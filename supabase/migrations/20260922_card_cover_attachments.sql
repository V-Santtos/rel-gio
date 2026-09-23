-- Flux Time: capa de cartao, anexos privados e salvamento atomico do cartao.
-- Migracao ADITIVA: nenhum UPDATE em tarefas/etiquetas existentes. Cartoes
-- existentes nascem com cover_type = 'none'. Rollback em
-- supabase/rollbacks/20260922_card_cover_attachments_down.sql.

-- 1. Anexos ---------------------------------------------------------------

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_bucket text not null default 'task-attachments',
  storage_path text not null,
  name text not null default '',
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_attachments_id_task_id_key unique (id, task_id),
  constraint task_attachments_storage_key unique (storage_bucket, storage_path)
);

create index if not exists task_attachments_task_sort_idx
  on public.task_attachments (task_id, sort_order, created_at);

drop trigger if exists task_attachments_set_updated_at on public.task_attachments;
create trigger task_attachments_set_updated_at
before update on public.task_attachments
for each row execute function public.set_updated_at();

alter table public.task_attachments enable row level security;
grant select, insert, update, delete on public.task_attachments to authenticated;

drop policy if exists "task_attachments_all_own" on public.task_attachments;
create policy "task_attachments_all_own"
on public.task_attachments
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.tasks task
    where task.id = task_attachments.task_id
      and task.user_id = (select auth.uid())
  )
);

-- 2. Capa do cartao --------------------------------------------------------

alter table public.tasks
  add column if not exists cover_type text not null default 'none',
  add column if not exists cover_color text,
  add column if not exists cover_attachment_id uuid,
  add column if not exists cover_focus_x real,
  add column if not exists cover_focus_y real;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_cover_type_check') then
    alter table public.tasks
      add constraint tasks_cover_type_check
      check (cover_type in ('none', 'color', 'image'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_cover_color_check') then
    alter table public.tasks
      add constraint tasks_cover_color_check
      check (cover_color is null or cover_color ~ '^#[0-9a-fA-F]{6}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_cover_focus_check') then
    alter table public.tasks
      add constraint tasks_cover_focus_check
      check (
        (cover_focus_x is null or cover_focus_x between 0 and 1)
        and (cover_focus_y is null or cover_focus_y between 0 and 1)
      );
  end if;

  -- A capa so pode apontar para um anexo DO PROPRIO cartao (FK composta).
  -- Apagar o anexo limpa apenas a referencia; o trigger abaixo zera o tipo.
  if not exists (select 1 from pg_constraint where conname = 'tasks_cover_attachment_fkey') then
    alter table public.tasks
      add constraint tasks_cover_attachment_fkey
      foreign key (cover_attachment_id, id)
      references public.task_attachments (id, task_id)
      on delete set null (cover_attachment_id);
  end if;
end;
$$;

create or replace function public.normalize_task_cover()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cover_type = 'image' and new.cover_attachment_id is null then
    new.cover_type := 'none';
  end if;
  if new.cover_type = 'color' and new.cover_color is null then
    new.cover_type := 'none';
  end if;
  if new.cover_type <> 'image' then
    new.cover_attachment_id := null;
    new.cover_focus_x := null;
    new.cover_focus_y := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_normalize_cover on public.tasks;
create trigger tasks_normalize_cover
before insert or update of cover_type, cover_color, cover_attachment_id, cover_focus_x, cover_focus_y
on public.tasks
for each row execute function public.normalize_task_cover();

-- 3. Bucket privado --------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-attachments',
  'task-attachments',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Caminho: <user_id>/<task_id>/<attachment_id>.<ext>
drop policy if exists "task_attachments_objects_select_own" on storage.objects;
create policy "task_attachments_objects_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'task-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "task_attachments_objects_insert_own" on storage.objects;
create policy "task_attachments_objects_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'task-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.tasks task
    where task.id::text = (storage.foldername(name))[2]
      and task.user_id = (select auth.uid())
  )
);

drop policy if exists "task_attachments_objects_delete_own" on storage.objects;
create policy "task_attachments_objects_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'task-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 4. Salvamento atomico do cartao -------------------------------------------
-- Substitui o ciclo "upsert + delete/reinsert" do cliente. Roda numa unica
-- transacao e com as permissoes do chamador (RLS vale). due_date dos itens de
-- checklist NUNCA e sobrescrito aqui: fica preservado mesmo oculto na UI.

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
    cover_type, cover_color, cover_attachment_id, cover_focus_x, cover_focus_y
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
    (v_cover->>'focus_y')::real
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
    cover_focus_y = excluded.cover_focus_y
  where t.user_id = v_user;

  if not found then
    raise exception 'task % not writable', v_task_id using errcode = '42501';
  end if;

  -- Etiquetas: remove as que sairam, grava a ordem atual.
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

  -- Checklists e itens: mutacao granular, sem recriar o que ja existe.
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
