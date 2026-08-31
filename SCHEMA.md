# Group pages — schema

A **group** is a set of people who play together regularly. It owns a permanent
page, a handful of game rooms that keep their codes, and a scoreboard that
carries from one night to the next.

Nothing here needs an account. A group is reached by its link, exactly like a
game room — the same trust model that already applies to every game on the site.

---

## Why this lives in the existing `games` table

Everything already runs as *one JSON blob per row behind two RPCs*
(`game_get` / `game_save`). Putting groups in that same table means they inherit,
for free:

- the **optimistic-concurrency guard** (`_stamp`), so two phones updating the
  scoreboard at once can't erase each other;
- the **id validation** regex, which already permits `group-XXXXXX`;
- the **locked-down access model** — `anon` cannot read the table, only call the
  two functions with an exact id.

A separate `groups` table would need its own RPCs, its own concurrency guard and
its own tests, to hold data of the same shape. Not worth it.

---

## Three kinds of row

| Kind | Id | Marker | Retention |
|---|---|---|---|
| Ephemeral game room | `judgement-AB12` | none | 24 hours after last write |
| Group hub | `group-K7M2QX` | — | 3 months after last write |
| Group-owned game room | `judgement-AB12` | `state._group = "K7M2QX"` | follows its group |

A group-owned room is kept while **its group** is active, not while the room is.
A group that plays Tambola every Diwali keeps that room all year.

Group codes are **six characters** from the same no-`I/O/0/1` alphabet — about
887 million combinations. They're permanent and hold the standings, so they
deserve more than the four characters a throwaway room gets.

---

## Group hub state

```jsonc
{
  "kind": "group",
  "name": "Sunday Crew",
  "created": "2026-08-31T19:04:00Z",

  // People who play. Plain names — no accounts, no emails.
  "members": ["Asha", "Bilal", "Chetan", "Divya"],

  // Rooms that keep their codes. The room rows live separately and
  // carry state._group pointing back here.
  "rooms": [
    { "game": "judgement", "code": "AB12", "label": "Our Judgement table" },
    { "game": "tambola",   "code": "9QRS", "label": "Diwali housie" }
  ],

  // Running totals. Rebuildable from history, kept here so the page renders
  // without walking every session.
  "standings": {
    "Asha":  { "played": 12, "won": 5, "points": 1420 },
    "Bilal": { "played": 12, "won": 3, "points":  980 }
  },

  // Newest first, capped at 50 so the row stays small.
  "history": [
    {
      "at": "2026-08-30T21:15:00Z",
      "game": "judgement",
      "results": [
        { "player": "Asha",  "score": 140, "won": true  },
        { "player": "Bilal", "score":   0, "won": false }
      ]
    }
  ],

  "_stamp": 41
}
```

### Rules the client must hold to

- **`standings` is derived.** Always recompute it from the appended result
  rather than incrementing blindly, so a retried write can't double-count.
- **Append to `history` through `mutate(fn)`**, never by replaying a snapshot —
  the concurrency fix depends on it.
- **Cap `history` at 50** entries on every write.
- A player who appears in a result but not in `members` is **added
  automatically**; people join a group by turning up.

---

## Group-owned room state

An ordinary game room with one extra field:

```jsonc
{ "_group": "K7M2QX",  /* …the game's own state… */ }
```

The game reads it on load to know it should report results, and the purge reads
it to know the row's lifetime follows the group.

---

## Retention

One function, three tiers. Ephemeral rooms are untouched by this change.

```sql
create or replace function public.purge_stale_games()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- 1. throwaway rooms: unchanged, a day after the last move
  delete from public.games
   where updated_at < now() - interval '24 hours'
     and id not like 'group-%'
     and coalesce(state->>'_group', '') = '';

  -- 2. group hubs: three months of silence
  delete from public.games
   where id like 'group-%'
     and updated_at < now() - interval '3 months';

  -- 3. group-owned rooms: gone when their group is gone or long stale,
  --    NOT when the room itself is quiet
  delete from public.games g
   where coalesce(g.state->>'_group', '') <> ''
     and not exists (
       select 1 from public.games h
        where h.id = 'group-' || (g.state->>'_group')
          and h.updated_at >= now() - interval '3 months');
end $$;
```

The third rule is the one that matters: a Tambola room played once a year
survives, because the *group* was active in between.
