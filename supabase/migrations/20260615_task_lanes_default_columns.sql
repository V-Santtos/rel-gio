-- Allow free-form columns for the default task board while keeping the seven
-- weekday lanes for week mode.

alter table public.task_lanes
  drop constraint if exists task_lanes_day_key_check;

alter table public.task_lanes
  add constraint task_lanes_day_key_check
  check (
    day_key in (
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday'
    )
    or day_key ~ '^default-[a-z0-9-]{1,64}$'
  );
