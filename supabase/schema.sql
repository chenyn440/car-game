create extension if not exists pgcrypto;

create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 16),
  score integer not null check (score >= 0),
  stage integer not null check (stage between 1 and 3),
  duration_sec integer not null check (duration_sec >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_leaderboard_score_desc
  on public.leaderboard_entries (score desc, duration_sec asc);

alter table public.leaderboard_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'leaderboard_entries'
      and policyname = 'leaderboard_select_public'
  ) then
    create policy leaderboard_select_public
      on public.leaderboard_entries
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'leaderboard_entries'
      and policyname = 'leaderboard_insert_public'
  ) then
    create policy leaderboard_insert_public
      on public.leaderboard_entries
      for insert
      with check (true);
  end if;
end
$$;
