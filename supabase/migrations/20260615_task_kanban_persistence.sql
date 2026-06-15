-- Flux Time task/Kanban persistence schema.
-- Extends the existing public.tasks table into the card model used by Tarefas.

create table if not exists public.task_lanes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day_key text not null,
  title text not null,
  mode text not null default 'default',
  collapsed boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_key text,
  name text not null default '',
  color text not null default 'transparent',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists lane_id uuid references public.task_lanes(id) on delete cascade,
  add column if not exists done boolean not null default false,
  add column if not exists period text,
  add column if not exists archived_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.task_label_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.task_labels(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (task_id, label_id)
);

create table if not exists public.task_checklists (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null default 'Checklist',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.task_checklists(id) on delete cascade,
  text text not null default '',
  done boolean not null default false,
  due_date date,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_alarms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lane_id uuid not null references public.task_lanes(id) on delete cascade,
  time_of_day time without time zone not null,
  description text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'task_lanes_day_key_check'
  ) then
    alter table public.task_lanes
      add constraint task_lanes_day_key_check
      check (day_key in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_lanes_mode_check'
  ) then
    alter table public.task_lanes
      add constraint task_lanes_mode_check
      check (mode in ('default', 'week'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_lanes_user_day_key_key'
  ) then
    alter table public.task_lanes
      add constraint task_lanes_user_day_key_key unique (user_id, day_key);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_labels_user_client_key_key'
  ) then
    alter table public.task_labels
      add constraint task_labels_user_client_key_key unique (user_id, client_key);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tasks_period_check'
  ) then
    alter table public.tasks
      add constraint tasks_period_check
      check (period is null or period in ('morning', 'afternoon', 'night'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_lanes_metadata_object_check'
  ) then
    alter table public.task_lanes
      add constraint task_lanes_metadata_object_check
      check (jsonb_typeof(metadata) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_labels_metadata_object_check'
  ) then
    alter table public.task_labels
      add constraint task_labels_metadata_object_check
      check (jsonb_typeof(metadata) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tasks_metadata_object_check'
  ) then
    alter table public.tasks
      add constraint tasks_metadata_object_check
      check (jsonb_typeof(metadata) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_checklists_metadata_object_check'
  ) then
    alter table public.task_checklists
      add constraint task_checklists_metadata_object_check
      check (jsonb_typeof(metadata) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_checklist_items_metadata_object_check'
  ) then
    alter table public.task_checklist_items
      add constraint task_checklist_items_metadata_object_check
      check (jsonb_typeof(metadata) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_alarms_metadata_object_check'
  ) then
    alter table public.task_alarms
      add constraint task_alarms_metadata_object_check
      check (jsonb_typeof(metadata) = 'object');
  end if;
end;
$$;

create index if not exists task_lanes_user_sort_idx
  on public.task_lanes (user_id, sort_order, created_at);

create index if not exists task_labels_user_sort_idx
  on public.task_labels (user_id, sort_order, created_at);

create index if not exists tasks_user_lane_sort_idx
  on public.tasks (user_id, lane_id, sort_order, created_at desc);

create index if not exists tasks_lane_period_sort_idx
  on public.tasks (lane_id, period, sort_order, created_at desc);

create index if not exists task_label_assignments_label_idx
  on public.task_label_assignments (label_id, sort_order);

create index if not exists task_checklists_task_sort_idx
  on public.task_checklists (task_id, sort_order, created_at);

create index if not exists task_checklist_items_checklist_sort_idx
  on public.task_checklist_items (checklist_id, sort_order, created_at);

create index if not exists task_alarms_user_lane_time_idx
  on public.task_alarms (user_id, lane_id, time_of_day);

create or replace function public.ensure_default_task_board(profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_lanes (user_id, day_key, title, sort_order)
  values
    (profile_id, 'monday', 'Segunda', 0),
    (profile_id, 'tuesday', 'Terca', 1),
    (profile_id, 'wednesday', 'Quarta', 2),
    (profile_id, 'thursday', 'Quinta', 3),
    (profile_id, 'friday', 'Sexta', 4),
    (profile_id, 'saturday', 'Sabado', 5),
    (profile_id, 'sunday', 'Domingo', 6)
  on conflict (user_id, day_key) do nothing;

  insert into public.task_labels (user_id, client_key, name, color, sort_order)
  values
    (profile_id, 'red', '', '#ff1a19', 0),
    (profile_id, 'orange', '', '#ff4e00', 1),
    (profile_id, 'green', '', '#4bff5c', 2),
    (profile_id, 'teal', '', '#0fffa5', 3),
    (profile_id, 'blue', '', '#186dff', 4),
    (profile_id, 'purple', '', '#8a10ff', 5)
  on conflict (user_id, client_key) do nothing;
end;
$$;

select public.ensure_default_task_board(id)
from public.profiles;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'display_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);

  insert into public.timer_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  perform public.ensure_default_task_board(new.id);

  return new;
end;
$$;

drop trigger if exists task_lanes_set_updated_at on public.task_lanes;
create trigger task_lanes_set_updated_at
before update on public.task_lanes
for each row execute function public.set_updated_at();

drop trigger if exists task_labels_set_updated_at on public.task_labels;
create trigger task_labels_set_updated_at
before update on public.task_labels
for each row execute function public.set_updated_at();

drop trigger if exists task_checklists_set_updated_at on public.task_checklists;
create trigger task_checklists_set_updated_at
before update on public.task_checklists
for each row execute function public.set_updated_at();

drop trigger if exists task_checklist_items_set_updated_at on public.task_checklist_items;
create trigger task_checklist_items_set_updated_at
before update on public.task_checklist_items
for each row execute function public.set_updated_at();

drop trigger if exists task_alarms_set_updated_at on public.task_alarms;
create trigger task_alarms_set_updated_at
before update on public.task_alarms
for each row execute function public.set_updated_at();

alter table public.task_lanes enable row level security;
alter table public.task_labels enable row level security;
alter table public.task_label_assignments enable row level security;
alter table public.task_checklists enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_alarms enable row level security;

grant select, insert, update, delete on public.task_lanes to authenticated;
grant select, insert, update, delete on public.task_labels to authenticated;
grant select, insert, update, delete on public.task_label_assignments to authenticated;
grant select, insert, update, delete on public.task_checklists to authenticated;
grant select, insert, update, delete on public.task_checklist_items to authenticated;
grant select, insert, update, delete on public.task_alarms to authenticated;

drop policy if exists "task_lanes_all_own" on public.task_lanes;
create policy "task_lanes_all_own"
on public.task_lanes
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "task_labels_all_own" on public.task_labels;
create policy "task_labels_all_own"
on public.task_labels
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "task_alarms_all_own" on public.task_alarms;
create policy "task_alarms_all_own"
on public.task_alarms
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.task_lanes lane
    where lane.id = task_alarms.lane_id
      and lane.user_id = (select auth.uid())
  )
);

drop policy if exists "task_label_assignments_all_own" on public.task_label_assignments;
create policy "task_label_assignments_all_own"
on public.task_label_assignments
for all
to authenticated
using (
  exists (
    select 1
    from public.tasks task
    where task.id = task_label_assignments.task_id
      and task.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.tasks task
    where task.id = task_label_assignments.task_id
      and task.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.task_labels label
    where label.id = task_label_assignments.label_id
      and label.user_id = (select auth.uid())
  )
);

drop policy if exists "task_checklists_all_own" on public.task_checklists;
create policy "task_checklists_all_own"
on public.task_checklists
for all
to authenticated
using (
  exists (
    select 1
    from public.tasks task
    where task.id = task_checklists.task_id
      and task.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.tasks task
    where task.id = task_checklists.task_id
      and task.user_id = (select auth.uid())
  )
);

drop policy if exists "task_checklist_items_all_own" on public.task_checklist_items;
create policy "task_checklist_items_all_own"
on public.task_checklist_items
for all
to authenticated
using (
  exists (
    select 1
    from public.task_checklists checklist
    join public.tasks task on task.id = checklist.task_id
    where checklist.id = task_checklist_items.checklist_id
      and task.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.task_checklists checklist
    join public.tasks task on task.id = checklist.task_id
    where checklist.id = task_checklist_items.checklist_id
      and task.user_id = (select auth.uid())
  )
);
