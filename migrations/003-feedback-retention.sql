-- ============================================================
--  003 — keep the feedback inbox out of the nightly purge
-- ============================================================
--
--  The bug-report button writes every report into a single row, feedback-INBOX.
--  Without this, purge_stale_games() sweeps it within a day of the last report
--  and the inbox silently empties — which is the worst possible failure for a
--  feedback system, because nobody notices until they go looking for a report
--  that mattered.
--
--  Run this once, in the Supabase SQL editor. It is safe to run twice.
--
--  Verify afterwards with the three queries at the bottom.
-- ------------------------------------------------------------

create or replace function public.purge_stale_games()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1. the inbox is never purged, whatever its age
  --    (kept first and explicit so a later edit cannot quietly drop it)

  -- 2. ordinary game rooms: gone a day after the last move
  delete from public.games g
   where g.id not like 'feedback-%'
     and g.id not like 'group-%'
     and coalesce(g.state->>'_group', '') = ''
     and g.updated_at < now() - interval '24 hours';

  -- 3. rooms belonging to a group survive as long as the group is active
  delete from public.games g
   where g.id not like 'feedback-%'
     and coalesce(g.state->>'_group', '') <> ''
     and not exists (
       select 1 from public.games h
        where h.id = 'group-' || (g.state->>'_group')
          and h.updated_at >= now() - interval '3 months');

  -- 4. group hubs themselves: three months of silence and they go
  delete from public.games g
   where g.id like 'group-%'
     and g.updated_at < now() - interval '3 months';
end $$;

-- ------------------------------------------------------------
--  Verify
-- ------------------------------------------------------------
--
--  a) the function now mentions the inbox three times:
--
--     select count(*) from pg_proc p
--      where p.proname = 'purge_stale_games'
--        and p.prosrc like '%feedback-%';
--     -- expect 1
--
--  b) the cron job is still scheduled:
--
--     select jobname, schedule from cron.job where jobname = 'purge-stale-games';
--     -- expect one row, '17 4 * * *'
--
--  c) after somebody sends a report, the row exists:
--
--     select id, updated_at, jsonb_array_length(state->'reports') as reports
--       from public.games where id = 'feedback-INBOX';
--
--  To empty the inbox by hand once reports have been dealt with:
--
--     update public.games
--        set state = jsonb_set(state, '{reports}', '[]'::jsonb)
--      where id = 'feedback-INBOX';
