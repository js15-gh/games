-- 004 — an inventory endpoint for /admin
--
-- WHY THIS IS SHAPED THE WAY IT IS. Read before changing it.
--
-- Every page on this site ships the Supabase URL and the publishable anon key
-- in its source. That is fine today because `anon` can call exactly two
-- functions — game_get(id) and game_save(...) — and neither will hand you a
-- room you cannot already name. Migration 001 closed room enumeration on
-- purpose.
--
-- So an admin page must NOT be built on "let anon list the games table". That
-- single grant would let anyone who views source enumerate every live room and
-- read every game's state: player names, who the Traitors are, the secret word.
-- A password checked in the BROWSER would not help either — the browser is the
-- attacker's own machine, and a JavaScript `if` is a suggestion.
--
-- Hence: the password is checked HERE, server-side, before a single row is
-- read. The anon key alone gets you nothing; you need the secret as well.
--
-- Second rule: this returns COUNTS AND LABELS, NEVER PEOPLE. No rosters, no
-- player names, no roles, no secret words, no clue text — the same whitelist
-- instinct as vp-report.js, and for the same reason. Everything below is
-- computed from the state inside the database; the state itself never leaves.
-- If you ever want names here, add them deliberately and know that you did.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_inventory(pass text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ok   boolean;
  out  jsonb;
begin
  -- sha256 of the admin password. Change the password by replacing this digest;
  -- the plaintext is deliberately not written down in the database.
  ok := encode(extensions.digest(coalesce(pass, ''), 'sha256'), 'hex')
        = '9c24c040a977c724b0712df7f3e5d8b1e8a1becad3eb5b15cb447d84481503d6';

  -- a wrong password costs a moment, so guessing over the network is slow
  if not ok then
    perform pg_sleep(1);
    raise exception 'no';
  end if;

  with rows as (
    select
      g.id,
      g.updated_at,
      g.state,
      pg_column_size(g.state)                                  as bytes,
      case
        when g.id = 'feedback-INBOX'                           then 'feedback'
        when g.id like 'group-%' and coalesce((g.state->>'_lobby')::boolean, false) then 'lobby'
        when g.id like 'group-%'                               then 'group'
        when position('-' in g.id) > 0                         then 'game'
        else 'other'
      end                                                      as kind,
      split_part(g.id, '-', 1)                                 as slug,
      split_part(g.id, '-', 2)                                 as code,
      coalesce(g.state->>'phase', '')                          as phase,
      coalesce(g.state->>'_group', '')                         as grp,
      -- players are counted, never listed. Games disagree about where the
      -- roster lives, so try each shape and take the first that is an array.
      coalesce(
        jsonb_array_length(case when jsonb_typeof(g.state->'players') = 'array'
                                then g.state->'players' end),
        jsonb_array_length(case when jsonb_typeof(g.state->'roster') = 'array'
                                then g.state->'roster' end),
        0)                                                     as players,
      coalesce(
        jsonb_array_length(case when jsonb_typeof(g.state->'launched') = 'array'
                                then g.state->'launched' end),
        0)                                                     as launched,
      coalesce(
        jsonb_array_length(case when jsonb_typeof(g.state->'reports') = 'array'
                                then g.state->'reports' end),
        0)                                                     as reports,
      -- how many phones have checked in recently, from vp.js's _seen stamps
      (select count(*) from jsonb_each_text(coalesce(g.state->'_seen', '{}'::jsonb)) s
        where s.value ~ '^[0-9]+$'
          and to_timestamp((s.value)::bigint / 1000.0) > now() - interval '2 minutes')
                                                               as live
    from public.games g
  ),
  -- what tonight's purge would take, mirroring purge_stale_games() exactly
  doomed as (
    select r.id from rows r
     where (r.updated_at < now() - interval '24 hours'
            and r.id not like 'group-%' and r.id not like 'feedback-%' and r.grp = '')
        or (r.id like 'group-%' and r.updated_at < now() - interval '3 months')
        or (r.grp <> '' and not exists (
              select 1 from rows h
               where h.id = 'group-' || r.grp
                 and h.updated_at >= now() - interval '3 months'))
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals', (select jsonb_build_object(
        'rows',      count(*),
        'games',     count(*) filter (where kind = 'game'),
        'lobbies',   count(*) filter (where kind = 'lobby'),
        'groups',    count(*) filter (where kind = 'group'),
        'feedback',  count(*) filter (where kind = 'feedback'),
        'other',     count(*) filter (where kind = 'other'),
        'bytes',     coalesce(sum(bytes), 0),
        'live_now',  coalesce(sum(live), 0),
        'active_1h', count(*) filter (where updated_at > now() - interval '1 hour'),
        'active_24h',count(*) filter (where updated_at > now() - interval '24 hours'),
        'active_7d', count(*) filter (where updated_at > now() - interval '7 days'),
        'doomed',    (select count(*) from doomed)
      ) from rows),
    'by_game', coalesce((select jsonb_agg(x order by x->>'rooms' desc, x->>'slug')
        from (select jsonb_build_object(
                'slug', slug,
                'rooms', count(*),
                'active_24h', count(*) filter (where updated_at > now() - interval '24 hours'),
                'finished', count(*) filter (where phase in ('gameover','done','over')),
                'players', coalesce(sum(players), 0),
                'live', coalesce(sum(live), 0),
                'last', max(updated_at)
              ) as x
          from rows where kind = 'game' group by slug) q), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(x order by x->>'updated_at' desc)
        from (select jsonb_build_object(
                'id', id, 'slug', slug, 'code', code, 'phase', phase,
                'players', players, 'live', live, 'group', grp, 'bytes', bytes,
                'updated_at', updated_at,
                'doomed', exists (select 1 from doomed d where d.id = rows.id)
              ) as x
          from rows where kind = 'game'
          order by updated_at desc limit 300) q), '[]'::jsonb),
    'lobbies', coalesce((select jsonb_agg(x order by x->>'updated_at' desc)
        from (select jsonb_build_object(
                'id', id, 'code', code, 'kind', kind,
                'name', left(coalesce(state->>'name', ''), 40),
                'roster', players, 'launched', launched, 'live', live,
                'bytes', bytes, 'updated_at', updated_at,
                'doomed', exists (select 1 from doomed d where d.id = rows.id)
              ) as x
          from rows where kind in ('lobby','group')
          order by updated_at desc limit 200) q), '[]'::jsonb),
    'feedback', coalesce((select jsonb_build_object(
        'reports', reports, 'updated_at', updated_at, 'bytes', bytes)
        from rows where kind = 'feedback' limit 1), '{}'::jsonb),
    'other', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'updated_at', updated_at, 'bytes', bytes))
        from rows where kind = 'other'), '[]'::jsonb)
  ) into out;

  return out;
end
$$;

-- anon may CALL it; the password inside is what actually gates it. anon still
-- has no rights on public.games itself.
revoke all on function public.admin_inventory(text) from public;
grant execute on function public.admin_inventory(text) to anon, authenticated;

-- ── verify ──────────────────────────────────────────────────
-- Wrong password must raise, and must take about a second:
--   select public.admin_inventory('wrong');
-- Right password returns the inventory:
--   select jsonb_pretty(public.admin_inventory('v3laAdmin'));
-- And prove no personal data is in the payload — this must return no rows:
--   select 1 where public.admin_inventory('v3laAdmin')::text ~* '"players":\s*\[';
