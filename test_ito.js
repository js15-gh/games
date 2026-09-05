/* Tests for Ito — the game this site recommends most strongly for 9-12 year
 * olds, and until now the one with no suite at all.
 *
 * Two things carry it. The numbers must be unique and spread, because the whole
 * game is describing a quantity and a table cannot tell 41 from 43 through
 * "a slightly cold bath". And nobody has a turn — anyone may play at any moment
 * — so every write races, and the guards all live inside commit callbacks.
 * The handlers are therefore driven THROUGH mutate() rather than around it.
 *
 *   node test_ito.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/ito-game-online.html', 'utf8');

function chunk(a, b){
  const i = src.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a);
  return src.slice(i, src.indexOf(b, i) + b.length);
}
function fn(name){
  let a = src.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('no ' + name);
  if (src.slice(a - 6, a) === 'async ') a -= 6;   // keep the keyword or it will not parse
  let d = 0;
  for (let j = src.indexOf('{', a); j < src.length; j++){
    if (src[j] === '{') d++;
    else if (src[j] === '}'){ d--; if (!d) return src.slice(a, j + 1); }
  }
}
const mod = { exports:{} };
new Function('module', [
  chunk('const THEMES = {', '\n};'), chunk('const CAT_KEYS', '\n'),
  chunk('const START_LIVES', '\n'), chunk('const FRESH = {', 'cats:[] };'),
  'let G = null, me = null, peek = false, __name = "";',
  'let __replay = false;',
  /* Two failure shapes, two models. __conflict: the save is refused and the
     callback re-runs against fresh state. __replay: the save lands but the
     response is lost, so mutate() parks the callback and the next poll applies
     it again on top of its own result. */
  'let __conflict = false, __lost = null;',
  'function mutate(fn){ if (__conflict) __lost = fn(JSON.parse(JSON.stringify(G)));' +
  ' G = fn(G); if (__replay) G = fn(G); return G; }',
  'function setErr(){} function render(){} function vpForgetSeat(){}',
  'const GAME_ID = "ito", ROOM = "TEST";',
  'function $(id){ return { value: __name, textContent: "" }; }',
  fn('themePool'), fn('pickTheme'), fn('drawNumbers'), fn('unplayed'),
  fn('addPlayer'), fn('removePlayer'), fn('startRound'), fn('rerollTheme'),
  fn('playCard'), fn('nextRound'), fn('restart'),
  'module.exports = { FRESH, START_LIVES, THEMES, pickTheme, drawNumbers, unplayed,' +
  ' CAT_KEYS, themePool, removePlayer, startRound, rerollTheme, playCard, nextRound, restart,' +
  ' addNamed:(n)=>{ __name = n; return addPlayer(); },' +
  ' setG:(g)=>{ G = g; }, getG:()=>G, setMe:(m)=>{ me = m; },' +
  ' conflict:(b)=>{ __conflict = b; __lost = null; }, replay:(b)=>{ __replay = b; } };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);
const clone = (o) => JSON.parse(JSON.stringify(o));
const fresh = (over) => Object.assign(clone(M.FRESH), over || {});

// ── 1. the numbers ───────────────────────────────────────────
head('The numbers');
const P4 = ['Asha','Bilal','Chetan','Devi'];
let allNums = [], tooClose = 0, outOfRange = 0, dupes = 0;
for (let i = 0; i < 4000; i++){
  const h = M.drawNumbers(P4);
  const v = P4.map(p => h[p]);
  if (new Set(v).size !== v.length) dupes++;
  if (v.some(n => n < 1 || n > 100)) outOfRange++;
  allNums = allNums.concat(v);
}
ok(dupes === 0, 'no two players ever hold the same number');
ok(outOfRange === 0, 'every number is between 1 and 100');
ok(Math.min(...allNums) <= 3 && Math.max(...allNums) >= 98,
   'the full range gets used (' + Math.min(...allNums) + '–' + Math.max(...allNums) + ')');
const buckets = new Array(10).fill(0);
for (const n of allNums) buckets[Math.min(9, Math.floor((n-1)/10))]++;
ok(Math.min(...buckets) > allNums.length/20,
   'and they are spread over it, not clustered (thinnest tenth: ' + Math.min(...buckets) + ')');

head('A big table still gets numbers');
for (const n of [2,5,8,10]){
  const names = 'ABCDEFGHIJ'.slice(0,n).split('');
  const h = M.drawNumbers(names);
  ok(names.every(p => h[p] >= 1 && h[p] <= 100) && new Set(names.map(p=>h[p])).size === n,
     n + ' players get ' + n + ' distinct numbers');
}

head('Themes');
const cats = Object.keys(M.THEMES);
ok(cats.length >= 10, cats.length + ' theme categories');
const total = cats.reduce((s,k)=>s+M.THEMES[k].list.length, 0);
ok(total >= 100, 'holding ' + total + ' themes between them — the page advertises 100');
ok(new Set(cats.flatMap(k=>M.THEMES[k].list)).size === total, 'and no theme is written twice');

// ── 2. playing in order ──────────────────────────────────────
function playing(nums, over){
  const g = fresh(Object.assign({ phase:'playing', players:P4.slice(), played:[],
                                  hands:nums, lives:M.START_LIVES, round:1, cleared:0,
                                  theme:'how frightening' }, over || {}));
  M.setG(g);
  return g;
}
head('Playing in order costs nothing');
playing({Asha:10,Bilal:30,Chetan:60,Devi:90});
for (const p of P4){ M.setMe(p); M.playCard(); }
let g = M.getG();
ok(g.lives === M.START_LIVES, 'four cards in ascending order, no life lost');
ok(g.phase === 'roundend', 'and the round ends');
ok(g.played.length === 4 && g.played.every(c => !c.auto), 'nothing was cut');

head('Playing out of order cuts the cards you skipped');
playing({Asha:10,Bilal:30,Chetan:60,Devi:90});
M.setMe('Chetan'); M.playCard();          // 60 before 10 and 30
g = M.getG();
ok(g.lives === M.START_LIVES - 2, 'skipping two people costs two lives');
ok(g.played.filter(c=>c.auto).length === 2, 'and cuts both of them');
ok(g.played.map(c=>c.number).join() === '10,30,60', 'the cut cards go down in order, below yours');
ok(g.played[g.played.length-1].name === 'Chetan', 'and yours lands on top');

head('The thread snaps when the lives run out');
playing({Asha:10,Bilal:30,Chetan:60,Devi:90}, { lives:2 });
M.setMe('Devi'); M.playCard();            // 90 skips three
g = M.getG();
ok(g.lives === 0, 'three skipped with two lives left leaves none');
ok(g.phase === 'gameover', 'and the game is over');

// ── 3. the guards ────────────────────────────────────────────
head('A card cannot be played twice');
/* playCard checked only that a number existed. commit() re-runs the callback on
   a conflict and mutate() replays it from `pending` after a failed save, so the
   same card could go down twice: played.length overshoots players.length, the
   strict equality never fires, and the room sits in 'playing' with nothing to
   tap and no restart on the screen. */
playing({Asha:10,Bilal:30,Chetan:60,Devi:90});
M.setMe('Asha'); M.playCard();
M.setMe('Asha'); M.playCard();
g = M.getG();
ok(g.played.length === 1, 'a second tap adds nothing');
ok(g.played.filter(c=>c.name==='Asha').length === 1, 'Asha is on the thread exactly once');

playing({Asha:10,Bilal:30,Chetan:60,Devi:90});
M.replay(true);
M.setMe('Asha'); M.playCard();
M.replay(false);
ok(M.getG().played.length === 1, 'and a replayed write does not double it either');

head('The round can always finish');
let stuck = 0;
for (let s = 0; s < 300; s++){
  const nums = {}; const pool = [];
  while (pool.length < 4){ const n = 1 + Math.floor(Math.random()*100); if (!pool.includes(n)) pool.push(n); }
  P4.forEach((p,i) => nums[p] = pool[i]);
  playing(nums, { lives: 99 });
  const order = P4.slice().sort(() => Math.random() - 0.5);
  for (const p of order){ M.setMe(p); M.playCard(); }
  const end = M.getG();
  if (end.played.length !== 4 || end.phase !== 'roundend') stuck++;
}
ok(stuck === 0, 'three hundred rounds in random order, every one resolved (' + stuck + ' stuck)');

head('Nobody can be seated after the deal');
/* A name added from a stale setup screen has no number: it can never play, can
   never be auto-cut, so played.length never reaches players.length and the
   round can never end. The playing screen has no restart. */
playing({Asha:10,Bilal:30,Chetan:60,Devi:90});
M.addNamed('Latecomer');
ok(!M.getG().players.includes('Latecomer'), 'no phantom seat mid-round');
M.removePlayer('Bilal');
ok(M.getG().players.includes('Bilal'), 'and no live player removed mid-round');

M.setG(fresh({ phase:'setup' }));
M.addNamed('Sam'); M.addNamed('sam'); M.addNamed('SAM');
ok(M.getG().players.length === 1, 'the same name cannot be seated twice, in any case');
for (let i = 0; i < 20; i++) M.addNamed('P' + i);
ok(M.getG().players.length === 10, 'and ten is really the ceiling');

head('A stale deal cannot re-draw numbers people have already seen');
M.setG(fresh({ phase:'setup', players:P4.slice() }));
M.startRound();
const dealt = clone(M.getG().hands);
M.startRound();
ok(JSON.stringify(M.getG().hands) === JSON.stringify(dealt),
   'a second "Deal the numbers" leaves every number alone');

M.setG(fresh({ phase:'setup', players:['Solo'] }));
M.startRound();
ok(M.getG().phase === 'setup', 'and one player cannot start a round');

head('The theme cannot change once somebody has committed to it');
M.setG(fresh({ phase:'setup', players:P4.slice() }));
M.startRound();
M.setMe('Asha'); M.playCard();
const theme = M.getG().theme;
M.rerollTheme();
ok(M.getG().theme === theme, 'a reroll after the first card is refused');

/* The interesting case is the one an ordinary reroll never reaches. pickTheme
   prefers themes not yet used, so while the pool is fresh it practically never
   repeats — a test that only rerolls a few times passes with or without the
   guard, which is exactly what my first version of this did. The guard exists
   for the state where EVERY theme has been used and pickTheme falls back to the
   whole list: there, it could hand back the one already on screen and the
   button looked dead. */
const everyTheme = M.CAT_KEYS.flatMap(k => M.THEMES[k].list);
let changed = 0, sameAgain = 0;
for (let i = 0; i < 200; i++){
  M.setG(fresh({ phase:'playing', players:P4.slice(), played:[],
                 usedThemes: everyTheme.slice(), theme: everyTheme[i % everyTheme.length] }));
  const t0 = M.getG().theme;
  M.rerollTheme();
  if (M.getG().theme !== t0) changed++; else sameAgain++;
}
ok(sameAgain === 0,
   '"Different theme" returns a different one even once every theme has been used (' +
   changed + '/200 changed)');
ok(everyTheme.length === total, 'and the pool really is every theme (' + everyTheme.length + ')');

head('A round is only "cleared" if the thread held');
/* nextRound incremented g.cleared unconditionally, so "Round 3 cleared — the
   thread holds" appeared after a round that had just cost two lives, and
   contradicted the crumb at the top of the same screen. */
playing({Asha:10,Bilal:30,Chetan:60,Devi:90});
for (const p of P4){ M.setMe(p); M.playCard(); }
M.nextRound();
ok(M.getG().cleared === 1, 'a clean round counts');
ok(M.getG().round === 2, 'and the round number advances');

playing({Asha:10,Bilal:30,Chetan:60,Devi:90});
M.setMe('Chetan'); M.playCard();          // cuts two
M.setMe('Devi'); M.playCard();
g = M.getG();
ok(g.phase === 'roundend', 'the round still ends');
M.nextRound();
ok(M.getG().cleared === 0, 'but a round that cut the thread is NOT counted as cleared');

head('Two taps on "next round" advance once');
playing({Asha:10,Bilal:30,Chetan:60,Devi:90});
for (const p of P4){ M.setMe(p); M.playCard(); }
M.nextRound();
const afterOne = clone(M.getG().hands);
const roundOne = M.getG().round;
M.nextRound(); M.nextRound();
ok(M.getG().round === roundOne, 'the round number moves exactly once');
ok(JSON.stringify(M.getG().hands) === JSON.stringify(afterOne),
   'and the numbers are not re-dealt under somebody who has already looked');

// ── 4. the reveal at the end ─────────────────────────────────
head('The end screen can always name what was still held');
playing({Asha:10,Bilal:30,Chetan:60,Devi:90}, { lives:1 });
M.setMe('Devi'); M.playCard();
g = M.getG();
ok(g.phase === 'gameover', 'the thread snapped');
const held = M.unplayed(g);
ok(held.every(p => typeof g.hands[p] === 'number'),
   'everybody still holding a card has a real number to show (' + JSON.stringify(held) + ')');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
