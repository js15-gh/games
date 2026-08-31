-- ============================================================
--  002 — Group pages: three-tier retention
--
--  Run this in the Supabase SQL editor. It is idempotent; running it
--  twice is harmless.
--
--  Nothing else changes. Verified against the live backend that
--  `group-K7M2QX` and a room carrying `state._group` both already pass
--  game_save's id regex and round-trip through game_get, so neither RPC
--  needs touching.
-- ============================================================


-- ── 1. Retention, as a named function ────────────────────────
-- The current cron runs a bare DELETE with a 24-hour window, which would
-- take group pages and their rooms with it. Three tiers instead:
--
--   throwaway rooms      → 24 hours after the last move   (unchanged)
--   group hubs           → 3 months after the last write
--   group-owned rooms    → follow their GROUP, not themselves
--
-- That last rule is the point of the whole change. A group that plays
-- Tambola once a year keeps that room, because the group was active in
-- between even though the room was not.

create or replace function public.purge_stale_games()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- throwaway rooms: no group marker, not a hub
  delete from public.games
   where updated_at < now() - interval '24 hours'
     and id not like 'group-%'
     and coalesce(state->>'_group', '') = '';

  -- group hubs that have gone quiet
  delete from public.games
   where id like 'group-%'
     and updated_at < now() - interval '3 months';

  -- rooms whose group is gone or long stale (run after the hubs above,
  -- so anything just orphaned is caught in the same pass)
  delete from public.games g
   where coalesce(g.state->>'_group', '') <> ''
     and not exists (
       select 1
         from public.games h
        where h.id = 'group-' || (g.state->>'_group')
          and h.updated_at >= now() - interval '3 months');
end
$$;

revoke all on function public.purge_stale_games() from public, anon, authenticated;


-- ── 2. Point the cron at it ──────────────────────────────────
-- The old job ran an inline DELETE. Replace it rather than adding a
-- second job, or the 24-hour rule would still eat the group rows.

select cron.unschedule('purge-stale-games')
 where exists (select 1 from cron.job where jobname = 'purge-stale-games');

select cron.schedule(
  'purge-stale-games',
  '17 4 * * *',
  $$select public.purge_stale_games()$$
);


-- ── 3. Checks ────────────────────────────────────────────────
-- Should list one active job pointing at the function:
--   select jobname, schedule, command, active from cron.job;
--
-- Should run without error and delete nothing unexpected:
--   select public.purge_stale_games();
--
-- Row census by kind:
--   select case
--            when id like 'group-%' then 'group hub'
--            when coalesce(state->>'_group','') <> '' then 'group room'
--            else 'throwaway room'
--          end as kind,
--          count(*), min(updated_at), max(updated_at)
--     from public.games group by 1 order by 1;
