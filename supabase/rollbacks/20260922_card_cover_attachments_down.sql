-- Rollback de 20260922_card_cover_attachments.sql.
-- So remove estruturas NOVAS e so roda se nao houver nenhum anexo gravado
-- (tabela e bucket vazios). Nao toca em tarefas, etiquetas ou checklist.

do $$
begin
  if exists (select 1 from public.task_attachments) then
    raise exception 'Rollback abortado: existem anexos em public.task_attachments.';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'task-attachments') then
    raise exception 'Rollback abortado: existem arquivos no bucket task-attachments.';
  end if;
end;
$$;

drop function if exists public.save_task_card(jsonb);

drop trigger if exists tasks_normalize_cover on public.tasks;
drop function if exists public.normalize_task_cover();

alter table public.tasks drop constraint if exists tasks_cover_attachment_fkey;
alter table public.tasks drop constraint if exists tasks_cover_focus_check;
alter table public.tasks drop constraint if exists tasks_cover_color_check;
alter table public.tasks drop constraint if exists tasks_cover_type_check;
alter table public.tasks
  drop column if exists cover_focus_y,
  drop column if exists cover_focus_x,
  drop column if exists cover_attachment_id,
  drop column if exists cover_color,
  drop column if exists cover_type;

drop policy if exists "task_attachments_objects_select_own" on storage.objects;
drop policy if exists "task_attachments_objects_insert_own" on storage.objects;
drop policy if exists "task_attachments_objects_delete_own" on storage.objects;
delete from storage.buckets where id = 'task-attachments';

drop table if exists public.task_attachments;
