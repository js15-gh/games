/* Shared player-identity layer — seats, avatars and presence.
 *
 * Three things every game needs and none of them had:
 *
 * 1. SEATS SURVIVE A REFRESH. `me` was a plain variable, so locking your
 *    phone, rotating it, or following the invite link twice dropped you back
 *    to "which one are you?" mid-game. It is remembered per room, so joining
 *    a different game does not inherit the wrong seat, and it is only
 *    restored if that name is still at the table.
 *
 * 2. A FACE PER NAME, derived from the name itself rather than stored — so
 *    every device shows Asha the same emoji without it having to be in the
 *    shared state at all.
 *
 * 3. PRESENCE. A heartbeat written at most every 30 seconds tells the table
 *    who is actually still holding their phone, which matters when a game is
 *    waiting on one person and nobody knows whether they have wandered off.
 *
 * Storage is per-origin and per-browser. It can throw (private windows,
 * blocked site data), so every access is wrapped — a game must work with no
 * storage at all.
 */
(function(){
  const NS = 'vp:seat:';
  const AWAY_AFTER = 75000;      // ms without a heartbeat before you look away
  const BEAT_EVERY = 30000;

  function read(k){ try { return localStorage.getItem(k); } catch { return null; } }
  function write(k, v){ try { localStorage.setItem(k, v); } catch {} }
  function drop(k){ try { localStorage.removeItem(k); } catch {} }

  const key = (game, room) => NS + game + '-' + room;

  /* Remember which seat this phone is in. Called from render(), so it runs
     constantly — it writes only when the value actually changes. */
  window.vpRememberSeat = function(game, room, name){
    if (!game || !room) return;
    const k = key(game, room);
    if (!name){ drop(k); return; }
    if (read(k) !== name) write(k, name);
  };

  /* Give the seat back, but only if that player is still at the table — a
     name removed during setup must not come back from storage. */
  window.vpRecallSeat = function(game, room, players){
    if (!game || !room) return null;
    const name = read(key(game, room));
    if (!name) return null;
    if (Array.isArray(players) && players.length && !players.includes(name)){
      drop(key(game, room));
      return null;
    }
    return name;
  };

  window.vpForgetSeat = function(game, room){ if (game && room) drop(key(game, room)); };

  /* A face for a name. Deterministic, so it needs no shared state and every
     phone agrees. Skin-toned and gendered faces are deliberately absent —
     these stand in for people who have not chosen them. */
  const FACES = ['🦊','🐼','🦉','🐙','🐝','🦋','🐢','🦜','🐳','🦌','🐧','🦔',
                 '🌵','🍁','🌻','🍀','⭐','🌙','🔥','💎','🎈','🎸','🚀','🧩'];
  window.vpAvatar = function(name){
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return FACES[h % FACES.length];
  };

  /* Presence, in three pieces rather than one, because the write goes through
     commit() — which re-applies its function on fresh state and may run it
     several times. The timestamp is therefore decided once, outside, and only
     stamped in; a version that decided inside would silently drop the beat on
     every retry. */
  let lastBeat = 0;
  window.vpBeatDue  = () => (Date.now() - lastBeat) > BEAT_EVERY;
  window.vpMarkBeat = () => { lastBeat = Date.now(); };
  window.vpStampSeen = function(state, name, t){
    if (!state || !name) return state;
    state._seen = state._seen || {};
    state._seen[name] = t;
    return state;
  };
  /* Everyone whose heartbeat has gone quiet. A player who has never sent one
     is NOT counted as away — they may simply be on an older tab, and marking
     them absent would be worse than saying nothing. */
  window.vpAway = function(state, players){
    const seen = (state && state._seen) || {};
    const now = Date.now();
    return (players || []).filter(p => seen[p] && (now - seen[p]) > AWAY_AFTER);
  };
  window.vpHere = function(state, name){
    const seen = (state && state._seen) || {};
    return !seen[name] || (Date.now() - seen[name]) <= AWAY_AFTER;
  };
})();
