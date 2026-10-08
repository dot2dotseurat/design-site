-- Budget scenarios for the Reno mood board.
-- Run this once in the Supabase SQL editor, after replacing YOUR_EMAIL_HERE (twice) with the email you sign in with.
--
-- Access model:
--   * Only the editor email can list, create, change or delete scenarios.
--   * Anyone with a scenario's link can read that one scenario (the link holds its random id); nobody can list the others.

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists scenarios_touch on public.scenarios;
create trigger scenarios_touch before update on public.scenarios
  for each row execute function public.touch_updated_at();

alter table public.scenarios enable row level security;

drop policy if exists "editor can do everything" on public.scenarios;
create policy "editor can do everything" on public.scenarios
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'YOUR_EMAIL_HERE')
  with check ((auth.jwt() ->> 'email') = 'YOUR_EMAIL_HERE');

-- Read-only access to a single scenario by its id, for share links.
create or replace function public.get_scenario(p_id uuid)
returns table (id uuid, name text, lines jsonb, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select s.id, s.name, s.lines, s.updated_at from public.scenarios s where s.id = p_id
$$;

revoke all on function public.get_scenario(uuid) from public;
grant execute on function public.get_scenario(uuid) to anon, authenticated;
