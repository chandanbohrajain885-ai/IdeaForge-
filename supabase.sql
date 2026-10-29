-- =====================================================================
-- IdeaForge AI - OPTIONAL Supabase setup (accounts + cloud saving)
-- Run once in Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to re-run.
-- =====================================================================

create table if not exists public.ideaforge_projects (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ideaforge_projects_user_updated_idx
  on public.ideaforge_projects (user_id, updated_at desc);

-- Row Level Security: every user can only see and change their own projects.
alter table public.ideaforge_projects enable row level security;

drop policy if exists "ideaforge select own" on public.ideaforge_projects;
drop policy if exists "ideaforge insert own" on public.ideaforge_projects;
drop policy if exists "ideaforge update own" on public.ideaforge_projects;
drop policy if exists "ideaforge delete own" on public.ideaforge_projects;

create policy "ideaforge select own" on public.ideaforge_projects
  for select to authenticated using (auth.uid() = user_id);

create policy "ideaforge insert own" on public.ideaforge_projects
  for insert to authenticated with check (auth.uid() = user_id);

create policy "ideaforge update own" on public.ideaforge_projects
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "ideaforge delete own" on public.ideaforge_projects
  for delete to authenticated using (auth.uid() = user_id);

-- Anonymous visitors get no access at all.
revoke all on public.ideaforge_projects from anon;
grant select, insert, update, delete on public.ideaforge_projects to authenticated;

-- Limit project size (~1 MB of JSON) to prevent abuse.
alter table public.ideaforge_projects drop constraint if exists ideaforge_projects_data_size;
alter table public.ideaforge_projects add constraint ideaforge_projects_data_size
  check (pg_column_size(data) < 1000000);
