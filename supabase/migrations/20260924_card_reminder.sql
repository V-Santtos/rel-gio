-- Flux Time: lembrete do cartao (Modo Semana). ADITIVA. Um lembrete por
-- cartao: reminder_time (HH:MM) + reminder_repeat:
--   'once'  -> toca no proximo dia da coluna do cartao e se desliga;
--   'daily' -> toca todo dia;
--   'days'  -> toca nos dias de reminder_days (monday..sunday).
-- Atualiza save_task_card para gravar os tres campos.
-- Rollback: supabase/rollbacks/20260924_card_reminder_down.sql

alter table public.tasks
  add column if not exists reminder_time time,
  add column if not exists reminder_repeat text,
  add column if not exists reminder_days text[];

alter table public.tasks
  drop constraint if exists tasks_reminder_repeat_check;

alter table public.tasks
  add constraint tasks_reminder_repeat_check
  check (reminder_repeat is null or reminder_repeat in ('once', 'daily', 'days'));

create or replace function public.save_task_card(p_card jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_task_id uuid := (p_card->>'id')::uuid;
  v_cover jsonb := coalesce(p_card->'cover', '{}'::jsonb);
  v_label_ids uuid[];
  v_checklist_ids uuid[];
  v_item_ids uuid[];
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.tasks as t (
    id, user_id, lane_id, title, description, done, status, period, sort_order,
    cover_type, cover_color, cover_attachment_id, cover_focus_x, cover_focus_y,
    start_date, due_at, reminder_time, reminder_repeat, reminder_days
  )
  values (
    v_task_id,
    v_user,
    (p_card->>'lane_id')::uuid,
    coalesce(p_card->>'title', ''),
    coalesce(p_card->>'description', ''),
    coalesce((p_card->>'done')::boolean, false),
    case when coalesce((p_card->>'done')::boolean, false) then 'done' else 'todo' end,
    nullif(p_card->>'period', ''),
    coalesce((p_card->>'sort_order')::integer, 0),
    coalesce(nullif(v_cover->>'type', ''), 'none'),
    nullif(v_cover->>'color', ''),
    nullif(v_cover->>'attachment_id', '')::uuid,
    (v_cover->>'focus_x')::real,
    (v_cover->>'focus_y')::real,
    nullif(p_card->>'start_date', '')::date,
    nullif(p_card->>'due_at', '')::timestamptz,
    nullif(p_card->>'reminder_time', '')::time,
    case when nullif(p_card->>'reminder_time', '') is null then null
         else coalesce(nullif(p_card->>'reminder_repeat', ''), 'once') end,
    case when jsonb_typeof(p_card->'reminder_days') = 'array'
         then array(select jsonb_array_elements_text(p_card->'reminder_days'))
         else null end
  )
  on conflict (id) do update set
    lane_id = excluded.lane_id,
    title = excluded.title,
    description = excluded.description,
    done = excluded.done,
    status = case when t.status = 'archived' then t.status else excluded.status end,
    period = excluded.period,
    sort_order = excluded.sort_order,
    cover_type = excluded.cover_type,
    cover_color = excluded.cover_color,
    cover_attachment_id = excluded.cover_attachment_id,
    cover_focus_x = excluded.cover_focus_x,
    cover_focus_y = excluded.cover_focus_y,
    start_date = excluded.start_date,
    due_at = excluded.due_at,
    reminder_time = excluded.reminder_time,
    reminder_repeat = excluded.reminder_repeat,
    reminder_days = excluded.reminder_days
  where t.user_id = v_user;

  if not found then
    raise exception 'task % not writable', v_task_id using errcode = '42501';
  end if;

  select coalesce(array_agg(value::uuid), '{}')
    into v_label_ids
  from jsonb_array_elements_text(coalesce(p_card->'labels', '[]'::jsonb));

  delete from public.task_label_assignments
  where task_id = v_task_id
    and not (label_id = any (v_label_ids));

  insert into public.task_label_assignments (task_id, label_id, sort_order)
  select v_task_id, label.value::uuid, (label.ordinality - 1)::integer
  from jsonb_array_elements_text(coalesce(p_card->'labels', '[]'::jsonb))
    with ordinality as label(value, ordinality)
  on conflict (task_id, label_id) do update set sort_order = excluded.sort_order;

  select coalesce(array_agg((list->>'id')::uuid), '{}')
    into v_checklist_ids
  from jsonb_array_elements(coalesce(p_card->'checklists', '[]'::jsonb)) as list;

  delete from public.task_checklists
  where task_id = v_task_id
    and not (id = any (v_checklist_ids));

  insert into public.task_checklists (id, task_id, title, sort_order)
  select
    (list.value->>'id')::uuid,
    v_task_id,
    coalesce(nullif(list.value->>'title', ''), 'Checklist'),
    coalesce((list.value->>'sort_order')::integer, (list.ordinality - 1)::integer)
  from jsonb_array_elements(coalesce(p_card->'checklists', '[]'::jsonb))
    with ordinality as list(value, ordinality)
  on conflict (id) do update set
    title = excluded.title,
    sort_order = excluded.sort_order
  where public.task_checklists.task_id = v_task_id;

  select coalesce(array_agg((item->>'id')::uuid), '{}')
    into v_item_ids
  from jsonb_array_elements(coalesce(p_card->'checklists', '[]'::jsonb)) as list,
       jsonb_array_elements(coalesce(list->'items', '[]'::jsonb)) as item;

  delete from public.task_checklist_items
  where checklist_id in (
      select id from public.task_checklists where task_id = v_task_id
    )
    and not (id = any (v_item_ids));

  insert into public.task_checklist_items (id, checklist_id, text, done, sort_order)
  select
    (item.value->>'id')::uuid,
    (list->>'id')::uuid,
    coalesce(item.value->>'text', ''),
    coalesce((item.value->>'done')::boolean, false),
    coalesce((item.value->>'sort_order')::integer, (item.ordinality - 1)::integer)
  from jsonb_array_elements(coalesce(p_card->'checklists', '[]'::jsonb)) as list,
       jsonb_array_elements(coalesce(list->'items', '[]'::jsonb))
         with ordinality as item(value, ordinality)
  on conflict (id) do update set
    checklist_id = excluded.checklist_id,
    text = excluded.text,
    done = excluded.done,
    sort_order = excluded.sort_order;
end;
$$;

revoke all on function public.save_task_card(jsonb) from public, anon;
grant execute on function public.save_task_card(jsonb) to authenticated;
