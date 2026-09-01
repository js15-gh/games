/* A "something's wrong" button on every page, and the inbox behind it.
 *
 * The point is that a bug report from a party is useless without the context
 * nobody thinks to include: which game, which room, which phase, what the
 * settings were. All of that is captured automatically. What is NOT captured
 * is anybody's name — see collect() below, which is a whitelist rather than a
 * dump for exactly that reason.
 *
 * Reports go into one row, `feedback-INBOX`, read back at /feedback. It is
 * written with the same read-modify-write retry the group scoreboard uses, so
 * two people reporting at the same moment cannot overwrite each other.
 *
 * NOTE: this row must be exempted from the nightly purge or it is swept within
 * a day — see migrations/003-feedback-retention.sql.
 */
(function(){
  const URL_ = "https://wwfoeclbsizxqfasvgsf.supabase.co";
  const KEY  = "sb_publishable_cFOQk3yLvX_OuB5baJA8Sg_ZqiY0sSl";
  const HDRS = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const ROW  = 'feedback-INBOX';
  const CAP  = 400;

  async function get(id){
    const r = await fetch(`${URL_}/rest/v1/rpc/game_get`, {
      method:'POST', headers:HDRS, body: JSON.stringify({ p_id:id }) });
    if (!r.ok) throw new Error('load ' + r.status);
    return await r.json();
  }
  async function put(id, state){
    const r = await fetch(`${URL_}/rest/v1/rpc/game_save`, {
      method:'POST', headers:HDRS, body: JSON.stringify({ p_id:id, p_state:state }) });
    if (!r.ok) throw new Error('save ' + r.status);
    try { return (await r.json()) === true; } catch { return true; }
  }
  window.vpReportsGet = () => get(ROW);

  /* Settings worth knowing, by name. A whitelist rather than a dump of the
     game state, because the state also holds every player's name, who the
     traitors are, and what everybody's secret word was — none of which belongs
     in a bug report, and all of which would end up there if this took a copy
     of G and shipped it. */
  const SETTING_KEYS = [
    'theme','decks','minBid','partnersWanted','evilCount','seer','doctor','recruit',
    'revealOnDeath','rounds','goal','cards','tier','family','clueRounds','decoys',
    'boards','maxLevel','lives','startLives','target','level','size','mode','adds','handsToPlay'
  ];

  /* Top-level const/let in classic scripts live in one shared global lexical
     scope, but they are NOT properties of window — so they cannot be read as
     window.X. Evaluating the bare name does reach them. Every name passed in
     comes from the fixed lists in this file, never from anything a user typed. */
  function peek(name){
    try { return new Function('try{return ' + name + '}catch(e){return undefined}')(); }
    catch { return undefined; }
  }
  /* The solo puzzles have no G and no room — their settings are plain
     top-level variables — so those are read by name too. Without this every
     report from Sudoku or Word Search arrived with no idea which puzzle. */
  const SOLO_KEYS = ['level','mode','size','theme','difficulty','tier','rows'];

  function collect(){
    const out = {
      url: location.pathname + location.search,
      title: document.title.slice(0, 120),
      at: new Date().toISOString(),
      screen: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
      ua: navigator.userAgent.slice(0, 180),
    };
    const gid = peek('GAME_ID');
    if (typeof gid === 'string') out.game = gid;
    // every page gets a name, so the inbox can always be filtered by game
    if (!out.game)
      out.game = (location.pathname.replace(/^\/+|\.html$/g, '').replace(/\/index$/, '') || 'home');
    const room = peek('ROOM');
    if (typeof room === 'string' && room) out.room = room;
    const solo = {};
    for (const k of SOLO_KEYS){
      const v = peek(k);
      if (v !== undefined && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
        solo[k] = v;
    }
    if (Object.keys(solo).length) out.settings = solo;
    try {
      const g = peek('G');
      if (g && typeof g === 'object'){
        out.phase = g.phase;
        out.playerCount = Array.isArray(g.players) ? g.players.length : undefined;
        out.round = g.round;
        const s = Object.assign({}, out.settings);
        for (const k of SETTING_KEYS) if (g[k] !== undefined && typeof g[k] !== 'object') s[k] = g[k];
        if (g.use && typeof g.use === 'object') s.use = Object.keys(g.use).filter(k => g.use[k]).join(',');
        if (Object.keys(s).length) out.settings = s;
      }
    } catch {}
    return out;
  }

  function css(){
    if (document.getElementById('vp-report-css')) return;
    const s = document.createElement('style');
    s.id = 'vp-report-css';
    s.textContent = `
      #vpRepBtn { position:fixed; right:14px; bottom:14px; z-index:2147483000;
        width:44px; height:44px; border-radius:50%; border:1px solid rgba(128,128,128,.45);
        background:rgba(20,18,26,.86); color:#fff; font-size:19px; line-height:1;
        cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.32); }
      #vpRepBtn:hover { background:#B5246B; border-color:#B5246B; }
      #vpRepWrap { position:fixed; inset:0; z-index:2147483001; background:rgba(0,0,0,.55);
        display:flex; align-items:flex-end; justify-content:center; padding:14px; }
      #vpRepBox { background:#fff; color:#2A2118; border-radius:14px; padding:18px 16px;
        width:100%; max-width:460px; max-height:86vh; overflow:auto;
        font-family:system-ui,-apple-system,'Karla',sans-serif; }
      #vpRepBox h3 { margin:0 0 4px; font-size:17px; }
      #vpRepBox p { margin:0; font-size:13.5px; color:#6B5D4C; line-height:1.5; }
      #vpRepBox textarea, #vpRepBox input { width:100%; box-sizing:border-box; margin-top:10px;
        border:1px solid #DDD2C0; border-radius:9px; padding:11px 12px; font-size:15px;
        font-family:inherit; color:#2A2118; background:#FFFDF9; }
      #vpRepBox textarea { min-height:104px; resize:vertical; }
      #vpRepRow { display:flex; gap:8px; margin-top:12px; }
      #vpRepRow button { flex:1; border-radius:9px; padding:12px; font-size:14px; font-weight:700;
        border:none; cursor:pointer; font-family:inherit; }
      #vpRepSend { background:#B5246B; color:#fff; }
      #vpRepSend[disabled] { opacity:.4; cursor:default; }
      #vpRepCancel { background:transparent; border:1px solid #DDD2C0; color:#6B5D4C; }
      #vpRepCtx { margin-top:12px; font-size:12px; color:#8C7C68; }
      #vpRepCtx summary { cursor:pointer; color:#B5246B; }
      #vpRepCtx pre { white-space:pre-wrap; word-break:break-word; background:#F7F2E9;
        border-radius:8px; padding:9px; margin-top:7px; font-size:11.5px; }
      @media (min-width:560px){ #vpRepWrap { align-items:center; } }`;
    document.head.appendChild(s);
  }

  function close(){ const w = document.getElementById('vpRepWrap'); if (w) w.remove(); }

  function open(){
    css(); close();
    const ctx = collect();
    const wrap = document.createElement('div');
    wrap.id = 'vpRepWrap';
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    wrap.innerHTML = `
      <div id="vpRepBox" role="dialog" aria-label="Report a problem">
        <h3>Something went wrong?</h3>
        <p>Tell us what you were doing and what happened. It goes straight to the people who
           can fix it.</p>
        <textarea id="vpRepText" placeholder="What happened?" aria-label="What happened"></textarea>
        <input id="vpRepWho" type="text" placeholder="Your email, if you want a reply (optional)"
               aria-label="Email, optional" autocomplete="email">
        <details id="vpRepCtx"><summary>What gets sent with it</summary>
          <p style="margin-top:6px">The page you are on and the game's settings — <b>never any
             player's name</b>, and nothing about who was what.</p>
          <pre>${JSON.stringify(ctx, null, 1).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>
        </details>
        <div id="vpRepRow">
          <button id="vpRepCancel" type="button">Cancel</button>
          <button id="vpRepSend" type="button">Send it</button>
        </div>
        <p id="vpRepMsg" style="margin-top:10px"></p>
      </div>`;
    document.body.appendChild(wrap);
    document.getElementById('vpRepCancel').onclick = close;
    document.getElementById('vpRepText').focus();
    document.getElementById('vpRepSend').onclick = async function(){
      const text = document.getElementById('vpRepText').value.trim();
      const who = document.getElementById('vpRepWho').value.trim().slice(0, 120);
      const msg = document.getElementById('vpRepMsg');
      if (!text){ msg.textContent = 'Say what happened first.'; return; }
      this.disabled = true; this.textContent = 'Sending…';
      const ok = await send({ ...ctx, text: text.slice(0, 2000), from: who || null });
      msg.textContent = ok ? 'Sent. Thank you — that genuinely helps.'
                           : "Couldn't send it. Check your connection and try again.";
      if (ok) setTimeout(close, 1400);
      else { this.disabled = false; this.textContent = 'Send it'; }
    };
  }

  /* Read-modify-write with retry, like the group scoreboard: two people
     reporting at the same moment must not overwrite one another. */
  async function send(entry){
    for (let attempt = 0; attempt < 5; attempt++){
      let box;
      try { box = await get(ROW); } catch { return false; }
      box = box && typeof box === 'object' ? box : {};
      box.reports = Array.isArray(box.reports) ? box.reports : [];
      entry.id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
      box.reports = [entry].concat(box.reports).slice(0, CAP);
      box._stamp = (box._stamp || 0) + 1;
      box._inbox = true;
      try { if (await put(ROW, box)) return true; } catch { return false; }
    }
    return false;
  }
  window.vpReportSend = send;

  function mount(){
    if (document.getElementById('vpRepBtn')) return;
    // a report button on the page where you read reports is just noise
    if (document.querySelector('meta[name="vp-no-report"]')) return;
    css();
    const b = document.createElement('button');
    b.id = 'vpRepBtn';
    b.type = 'button';
    b.title = 'Report a problem';
    b.setAttribute('aria-label', 'Report a problem');
    b.textContent = '🐞';
    b.onclick = open;
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
