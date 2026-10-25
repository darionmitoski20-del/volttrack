-- ============================================================================
-- VoltTrack — 0017 expose each user's email on their profile
--
-- auth.users is not queryable from the client, so coworkers/owners had no way
-- to see each other's email (only their own, via the session). Mirrors it
-- onto public.profiles at signup time and backfills existing rows. Existing
-- RLS on profiles (profiles_select) already allows reading coworkers' rows,
-- so no policy change is needed here.
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND p.email IS NULL;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do update set email = excluded.email where public.profiles.email is null;
  return new;
end;
$$;
