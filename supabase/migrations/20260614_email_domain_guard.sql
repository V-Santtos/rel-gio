-- Keep Flux Time accounts limited to known personal e-mail providers.
-- Frontend validation helps UX; this trigger keeps the rule on the database side.

create or replace function public.is_allowed_flux_time_email(email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    email is not null
    and lower(btrim(email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and split_part(lower(btrim(email)), '@', 2) in (
      'gmail.com',
      'hotmail.com',
      'outlook.com'
    );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(new.email));
begin
  if not public.is_allowed_flux_time_email(normalized_email) then
    raise exception 'Email domain is not allowed for Flux Time';
  end if;

  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    normalized_email,
    nullif(new.raw_user_meta_data->>'display_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);

  insert into public.timer_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(new.email));
begin
  if not public.is_allowed_flux_time_email(normalized_email) then
    raise exception 'Email domain is not allowed for Flux Time';
  end if;

  update public.profiles
  set email = normalized_email
  where id = new.id;

  return new;
end;
$$;
