-- Persist the full multi-cycle focus/break configuration.

alter table public.timer_settings
  add column if not exists cycles_count integer not null default 1,
  add column if not exists cycle_times jsonb not null default
    '[{"focusHours":0,"focusMinutes":25,"focusSeconds":0,"breakMinutes":5,"breakSeconds":0}]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'timer_settings_cycles_count_check'
  ) then
    alter table public.timer_settings
      add constraint timer_settings_cycles_count_check
      check (cycles_count between 1 and 6);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'timer_settings_cycle_times_array_check'
  ) then
    alter table public.timer_settings
      add constraint timer_settings_cycle_times_array_check
      check (jsonb_typeof(cycle_times) = 'array');
  end if;
end;
$$;

update public.timer_settings
set
  cycles_count = 1,
  cycle_times = jsonb_build_array(
    jsonb_build_object(
      'focusHours', focus_hours,
      'focusMinutes', focus_minutes,
      'focusSeconds', focus_seconds,
      'breakMinutes', break_minutes,
      'breakSeconds', break_seconds
    )
  )
where cycle_times = '[{"focusHours":0,"focusMinutes":25,"focusSeconds":0,"breakMinutes":5,"breakSeconds":0}]'::jsonb;
