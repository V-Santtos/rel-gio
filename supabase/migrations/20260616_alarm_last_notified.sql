-- Controle de disparo: evita que o cron envie o mesmo alarme mais de uma vez por minuto.
ALTER TABLE public.task_alarms
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS task_alarms_time_enabled_idx
  ON public.task_alarms (time_of_day)
  WHERE enabled = true;
