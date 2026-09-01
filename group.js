/* Group reporting — shared by every game.
 *
 * A game room that belongs to a group carries `state._group` (the six-character
 * group code). When the game ends, it calls vpGroupReport() and the result is
 * folded into the group's hub row.
 *
 * Two things make this safe to call more than once:
 *   - every report carries a session id (`sid`); a sid already in history is
 *     ignored, so a retry or a double-tap cannot double-count.
 *   - standings are RECOMPUTED from history rather than incremented, so even a
 *     partially-applied write heals on the next report.
 */
(function(){
  const URL_ = "https://wwfoeclbsizxqfasvgsf.supabase.co";
  const KEY  = "sb_publishable_cFOQk3yLvX_OuB5baJA8Sg_ZqiY0sSl";
  const HDRS = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const HISTORY_CAP = 200;   // ~years for a group that plays weekly

  async function get(id){
    const r = await fetch(`${URL_}/rest/v1/rpc/game_get`, {
      method:'POST', headers:HDRS, body: JSON.stringify({ p_id:id }) });
    if (!r.ok) throw new Error('load ' + r.status);
    return await r.json();
  }
  async function save(id, state){
    const r = await fetch(`${URL_}/rest/v1/rpc/game_save`, {
      method:'POST', headers:HDRS, body: JSON.stringify({ p_id:id, p_state:state }) });
    if (!r.ok) throw new Error('save ' + r.status);
    try { return (await r.json()) === true; } catch { return true; }
  }

  // Derived, never incremented — see the note at the top.
  //
  // Points are kept PER GAME as well as in total, because a single total is
  // meaningless across games with different scales: a Judgement night is worth
  // a few hundred, an Ito night is worth about four. Played and won compare
  // across games; points only compare within one.
  function recompute(hub){
    const s = {};
    const touch = (p) => (s[p] = s[p] || { played:0, won:0, points:0, byGame:{} });
    for (const p of (hub.members || [])) touch(p);
    for (const h of (hub.history || [])){
      for (const r of (h.results || [])){
        if (!r || !r.player) continue;
        const e = touch(r.player);
        e.played += 1;
        if (r.won) e.won += 1;
        e.points += (r.score || 0);
        const g = (e.byGame[h.game] = e.byGame[h.game] || { played:0, won:0, points:0 });
        g.played += 1;
        if (r.won) g.won += 1;
        g.points += (r.score || 0);
      }
    }
    return s;
  }

  window.vpGroupGet  = (code) => get('group-' + code);
  window.vpGroupSave = (code, state) => save('group-' + code, state);
  window.vpRecomputeStandings = recompute;
  window.vpRoomGet   = get;
  window.vpRoomSave  = save;

  /* results: [{ player, score, won }] — score may be 0 for games that don't
     keep one. Returns true when the session is recorded (or already was). */
  window.vpGroupReport = async function(code, game, sid, results){
    if (!code || !sid || !results || !results.length) return false;
    for (let attempt = 0; attempt < 5; attempt++){
      let hub;
      try { hub = await get('group-' + code); } catch { return false; }
      if (!hub) return false;                       // group has gone
      hub.history = hub.history || [];
      if (hub.history.some(h => h.sid === sid)) return true;   // already in

      hub.members = hub.members || [];
      for (const r of results) if (r.player && !hub.members.includes(r.player)) hub.members.push(r.player);

      hub.history = [{ sid, at:new Date().toISOString(), game, results }]
                      .concat(hub.history).slice(0, HISTORY_CAP);
      hub.standings = recompute(hub);
      hub._stamp = (hub._stamp || 0) + 1;

      try { if (await vpGroupSave(code, hub)) return true; } catch { return false; }
      // someone else wrote first — loop and re-apply on their version
    }
    return false;
  };

  /* Called by a game once it reaches its end screen. Reads the group code from
     the game's own state, builds a session id from the room and the finish
     time, and reports. Safe to call on every render of the end screen. */
  window.vpMaybeReport = function(state, game, roomCode, results){
    if (!state || !state._group || !results || !results.length) return;
    const sid = roomCode + ':' + (state._sessionEnd || '');
    if (!state._sessionEnd) return;
    if (window.__vpReported === sid) return;        // this tab has already sent it
    window.__vpReported = sid;
    vpGroupReport(state._group, game, sid, results);
  };
})();
