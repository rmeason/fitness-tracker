-- =====================================================================
-- Hypertrophy Tracker: cloud sync + daily 5am backup
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Live data: one row per data set (entries, nutrition, sleep, ...)
--    The `key` names match the Export file, so a snapshot of this table
--    IS a normal backup file the app can Import.
-- ---------------------------------------------------------------------
create table if not exists public.app_state (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- The server stamps updated_at, so a phone with a wrong clock can't
-- make old data look new.
create or replace function public.stamp_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists app_state_stamp on public.app_state;
create trigger app_state_stamp
  before insert or update on public.app_state
  for each row execute function public.stamp_updated_at();

alter table public.app_state enable row level security;

drop policy if exists "own rows: read"   on public.app_state;
drop policy if exists "own rows: insert" on public.app_state;
drop policy if exists "own rows: update" on public.app_state;
drop policy if exists "own rows: delete" on public.app_state;
create policy "own rows: read"   on public.app_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.app_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.app_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.app_state for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 2. Daily snapshots (kept 30 days). Read-only from the app.
-- ---------------------------------------------------------------------
create table if not exists public.daily_backups (
  id       bigint generated always as identity primary key,
  user_id  uuid        not null references auth.users (id) on delete cascade,
  taken_at timestamptz not null default now(),
  snapshot jsonb       not null
);
create index if not exists daily_backups_user_taken on public.daily_backups (user_id, taken_at desc);

alter table public.daily_backups enable row level security;
drop policy if exists "own backups: read" on public.daily_backups;
create policy "own backups: read" on public.daily_backups for select to authenticated using ((select auth.uid()) = user_id);
-- No insert/update/delete policies: only the scheduled job writes here.

create or replace function public.take_daily_backup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.daily_backups (user_id, snapshot)
  select user_id,
         jsonb_object_agg(key, value) || jsonb_build_object('backupTakenAt', now())
  from public.app_state
  group by user_id;

  delete from public.daily_backups
  where taken_at < now() - interval '30 days';
end $$;

revoke all on function public.take_daily_backup() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Schedule it. pg_cron runs on UTC:
--    11:00 UTC = 5:00am Central in winter (CST), 6:00am in summer (CDT).
--    If this line errors, turn on "Cron" under Integrations in the
--    Supabase dashboard, then run this file again.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

select cron.unschedule(jobid) from cron.job where jobname = 'hypertrophy-daily-backup';
select cron.schedule(
  'hypertrophy-daily-backup',
  '0 11 * * *',
  $$ select public.take_daily_backup(); $$
);

-- ---------------------------------------------------------------------
-- Handy checks (run any time):
--   select key, jsonb_array_length(value) as items, updated_at from app_state where jsonb_typeof(value) = 'array';
--   select id, taken_at from daily_backups order by taken_at desc limit 5;
--   select public.take_daily_backup();   -- take one right now
--   select * from cron.job_run_details order by start_time desc limit 5;
-- ---------------------------------------------------------------------
