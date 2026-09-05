/* Tests for the write path every game shares: saveState -> commit -> mutate,
 * and the deferred retry in poll().
 *
 * This code is copied verbatim into all twenty games, so a fault here is a
 * fault in all of them at once — and it is the one part no per-game suite ever
 * exercises, because every one of those suites stubs mutate() out in order to
 * test the game. Here the game is stubbed out instead and the plumbing is real,
 * driven against a fake server that can refuse a write, drop a connection, or
 * accept one from somebody else first.
 *
 *   node test_writepath.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/tambola-housie-online.html', 'utf8');

function fn(name){
  let a = src.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('no ' + name);
  if (src.slice(a - 6, a) === 'async ') a -= 6;
  let d = 0;
  for (let j = src.indexOf('{', a); j < src.length; j++){
    if (src[j] === '{') d++;
    else if (src[j] === '}'){ d--; if (!d) return src.slice(a, j + 1); }
  }
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

/* A stand-in for the room row. It enforces the one rule game_save enforces:
   a write is accepted only if its _stamp is ahead of what is already stored. */
function makeServer(){
  return {
    row: { _stamp: 0, v: [] },
    offline: false,
    saves: 0, rejects: 0, drops: 0,
    save(next){
      this.saves++;
      if ((next._stamp || 0) <= (this.row._stamp || 0)){ this.rejects++; return false; }
      this.row = JSON.parse(JSON.stringify(next));
      return true;
    },
    /* Stand in for fetch() itself, because that is where a dropped connection
       actually fails. Throwing from json() instead lands in the catch that
       exists for the older void-returning game_save, which treats a missing
       body as success — my first version of this harness did exactly that and
       reported a lost write as a successful one. */
    async post(next){
      if (this.offline){ this.drops++; throw new Error('network'); }
      const accepted = this.save(next);
      return { ok:true, json: async () => accepted };
    },
    load(){
      if (this.offline) throw new Error('network');
      return JSON.parse(JSON.stringify(this.row));
    },
    // somebody else's phone writes
    elsewhere(v){ this.row = { _stamp: this.row._stamp + 1, v: this.row.v.concat([v]) }; }
  };
}

function build(){
  const mod = { exports:{} };
  new Function('module', 'SERVER', [
    'let G = null, stamp = 0, pending = null, me = "Asha", joined = true;',
    'const ROOM = "TEST", GAME_ID = "tambola";',
    'const FRESH = { _stamp:0, v:[] };',
    'const hydrate = (s) => Object.assign(JSON.parse(JSON.stringify(FRESH)), s || {});',
    'let renders = 0;',
    'function render(){ renders++; }',
    'function setErr(){}',
    'function roomKey(){ return "tambola-TEST"; }',
    'function vpRecallSeat(){ return me; } function vpRememberSeat(){}',
    'function vpBeatDue(){ return false; } function vpMarkBeat(){}',
    'function vpStampSeen(g){ return g; }',
    /* Stub fetch() itself rather than rewriting the source. saveState and
       loadState then run exactly as they ship — which matters, because my first
       attempt rewrote the request line and so posted the object from BEFORE the
       stamp was applied, making a correct fix look broken. */
    'const SUPABASE_URL = "http://fake"; function HDRS(){ return {}; }',
    'async function fetch(url, opts){',
    '  const body = JSON.parse(opts.body);',
    '  if (url.endsWith("game_save")) return SERVER.post(body.p_state);',
    '  return { ok:true, json: async () => SERVER.load() };',
    '}',
    fn('saveState'), fn('loadState'), fn('commit'), fn('mutate'), fn('poll'),
    'module.exports = { commit, mutate, poll, saveState,' +
    ' getG:()=>G, setG:(g)=>{G=g;}, getStamp:()=>stamp, setStamp:(s)=>{stamp=s;},' +
    ' getPending:()=>pending, setPending:(p)=>{pending=p;}, renders:()=>renders };'
  ].join('\n'))(mod, SERVER_REF.s);
  return mod.exports;
}
const SERVER_REF = { s: null };

// ── 1. the ordinary path ─────────────────────────────────────
head('An ordinary write');
SERVER_REF.s = makeServer();
let M = build();
M.setG({ _stamp:0, v:[] });
await0();
async function await0(){}
(async () => {

  await M.mutate(g => { g.v = g.v.concat(['a']); return g; });
  ok(SERVER_REF.s.row.v.join() === 'a', 'lands on the server');
  ok(M.getPending() === null, 'and nothing is left queued');
  ok(M.getG().v.join() === 'a', 'and the local copy agrees');

  head('A write that loses the race is re-applied to fresh state');
  SERVER_REF.s = makeServer(); M = build();
  M.setG({ _stamp:0, v:[] });
  // somebody else gets there first, twice
  const s1 = SERVER_REF.s;
  const origSave = s1.save.bind(s1);
  let first = true;
  s1.save = function(next){
    if (first){ first = false; this.elsewhere("other"); this.rejects++; return false; }
    return origSave(next);
  };
  await M.mutate(g => { g.v = g.v.concat(['mine']); return g; });
  ok(s1.row.v.join() === 'other,mine',
     'the losing write is re-applied ON TOP of the other one (' + s1.row.v.join() + ')');
  ok(M.getPending() === null, 'and it is not left queued');

  // ── 2. THE DEFERRED WRITE THAT WAS THROWN AWAY ─────────────
  head('A queued write survives the connection dropping again');
  /* poll() cleared `pending` BEFORE retrying, and only put it back if commit()
     returned false. If commit() THREW — which is what a dropped connection
     does — the catch at the bottom of poll() swallowed it and the write was
     gone for good. The player had been told, in as many words, "It will
     retry." */
  SERVER_REF.s = makeServer(); M = build();
  M.setG({ _stamp:0, v:[] });
  SERVER_REF.s.offline = true;
  await M.mutate(g => { g.v = g.v.concat(['offline-move']); return g; });
  ok(M.getPending() !== null, 'a write made while offline is queued');

  await M.poll();                       // still offline: the retry throws
  ok(M.getPending() !== null,
     'and is STILL queued after a retry that hits the network again');

  SERVER_REF.s.offline = false;
  await M.poll();                       // now it can land
  ok(SERVER_REF.s.row.v.includes('offline-move'),
     'and lands once the connection comes back (' + JSON.stringify(SERVER_REF.s.row.v) + ')');
  ok(M.getPending() === null, 'and is cleared only then');

  // ── 3. THE BURNED STAMP ────────────────────────────────────
  head('A save that never reached the server does not burn a stamp');
  /* saveState did `next._stamp = ++stamp` BEFORE the fetch, and `next` IS the
     local G by then. So a dropped save left the local copy carrying a stamp
     the server had never seen, and poll()'s guard — accept incoming state only
     if its stamp is >= ours — then REJECTED every update from the room until
     somebody else's writes pushed the server past it. The phone sat showing
     stale state and could not be told otherwise. */
  SERVER_REF.s = makeServer(); M = build();
  M.setG({ _stamp:0, v:[] });
  SERVER_REF.s.offline = true;
  // a phone in a lift taps a few times, as people do when nothing responds
  for (let i = 0; i < 5; i++){
    await M.mutate(g => { g.v = g.v.concat(['lost-' + i]); return g; });
    M.setPending(null);                 // each tap replaces the last anyway
  }
  const localStamp = (M.getG()._stamp || 0);
  SERVER_REF.s.offline = false;
  // meanwhile the rest of the room has played on
  SERVER_REF.s.elsewhere('them-1');
  SERVER_REF.s.elsewhere('them-2');
  ok(localStamp <= SERVER_REF.s.row._stamp,
     'the local stamp did not run ahead of the server (' + localStamp + ' vs ' +
     SERVER_REF.s.row._stamp + ')');

  M.setPending(null);                   // ignore the queued write for this check
  await M.poll();
  ok(M.getG().v.includes('them-1') && M.getG().v.includes('them-2'),
     'so the room\'s moves are accepted, not rejected as stale (' +
     JSON.stringify(M.getG().v) + ')');

  head('A refused save does not burn one either');
  SERVER_REF.s = makeServer(); M = build();
  M.setG({ _stamp:0, v:[] });
  const s2 = SERVER_REF.s;
  const realSave = s2.save.bind(s2);
  let refuseOnce = true;
  s2.save = function(next){
    if (refuseOnce){ refuseOnce = false; this.rejects++; return false; }
    return realSave(next);
  };
  await M.mutate(g => { g.v = g.v.concat(['x']); return g; });
  ok(s2.row.v.join() === 'x', 'the retry still lands');
  ok(M.getStamp() === s2.row._stamp,
     'and the local counter matches the server exactly (' + M.getStamp() + ' vs ' +
     s2.row._stamp + ')');

  // ── 4. the retry re-applies the CHANGE, not the state ──────
  head('A retry re-applies the change, never a stale snapshot');
  /* mutate parks the FUNCTION, not the state it produced. That is the whole
     reason a late write cannot roll the room back to what one phone happened
     to be looking at. */
  SERVER_REF.s = makeServer(); M = build();
  M.setG({ _stamp:0, v:[] });
  SERVER_REF.s.offline = true;
  await M.mutate(g => { g.v = g.v.concat(['mine']); return g; });
  SERVER_REF.s.offline = false;
  SERVER_REF.s.elsewhere('theirs-1');
  SERVER_REF.s.elsewhere('theirs-2');
  await M.poll();
  const v = SERVER_REF.s.row.v;
  ok(v.includes('theirs-1') && v.includes('theirs-2'),
     'the other phones\' moves are still there (' + JSON.stringify(v) + ')');
  ok(v.includes('mine'), 'and so is the one that was queued');
  ok(v.length === 3, 'nothing was rolled back (' + v.length + ' entries)');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
