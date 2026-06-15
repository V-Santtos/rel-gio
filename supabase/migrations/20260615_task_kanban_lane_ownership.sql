-- Tighten lane ownership for tasks and alarms.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'task_lanes_id_user_id_key'
  ) then
    alter table public.task_lanes
      add constraint task_lanes_id_user_id_key unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tasks_lane_user_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_lane_user_fkey
      foreign key (lane_id, user_id)
      references public.task_lanes (id, user_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_alarms_lane_user_fkey'
  ) then
    alter table public.task_alarms
      add constraint task_alarms_lane_user_fkey
      foreign key (lane_id, user_id)
      references public.task_lanes (id, user_id)
      on delete cascade;
  end if;
end;
$$;

drop policy if exists "tasks_all_own" on public.tasks;
create policy "tasks_all_own"
on public.tasks
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    lane_id is null
    or exists (
      select 1
      from public.task_lanes lane
      where lane.id = tasks.lane_id
        and lane.user_id = (select auth.uid())
    )
  )
);
