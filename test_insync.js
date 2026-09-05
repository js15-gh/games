/* Tests for In Sync.
 *
 * A co-operative game with no turns: everyone holds secret numbers and the
 * table has to play them in ascending order without speaking. Two things carry
 * it. Nobody may learn another player's numbers before they are played — so a
 * card leaving a hand and appearing on the pile has to happen together, and only
 * for a play that really happened. And because there are no turns, every write
 * races, so the handlers are driven THROUGH mutate() here rather than around it.
 *
 *   node test_insync.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/in-sync-online.html', 'utf8');

function chunk(a, b){
  const i = src.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a);
  return src.slice(i, src.indexOf(b, i) + b.length);
}
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
const mod = { exports:{} };
new Function('module', [
  chunk('const FRESH = {', '_sessionEnd:null };'),
  'let G = null, me = null, __name = "";',
  /* Two failure shapes, two models — a refused save re-runs the callback
     against fresh state; a landed save whose response was lost replays it on
     top of its own result. A callback that decides anything from the state it
     is handed only breaks under one of them. */
  'let __conflict = false, __replay = false, __lost = null;',
  'function mutate(fn){ if (__conflict) __lost = fn(JSON.parse(JSON.stringify(G)));' +
  ' G = fn(G); if (__replay) G = fn(G); return G; }',
  'function setErr(){} function render(){} function vpForgetSeat(){}',
  'const GAME_ID = "insync", ROOM = "TEST";',
  'function $(id){ return { value: __name, textContent: "" }; }',
  chunk('const stillOut =', '\n'), fn('deal'),
  fn('addPlayer'), fn('startGame'), fn('setLives'), fn('playLowest'),
  fn('nextLevel'), fn('backToSetup'),
  'module.exports = { FRESH, stillOut, deal, startGame, setLives, playLowest, nextLevel,' +
  ' backToSetup, addNamed:(n)=>{ __name = n; return addPlayer(); },' +
  ' setG:(g)=>{G=g;}, getG:()=>G, setMe:(m)=>{me=m;},' +
  ' conflict:(b)=>{__conflict=b;__lost=null;}, replay:(b)=>{__replay=b;}, lost:()=>__lost };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);
const clone = (o) => JSON.parse(JSON.stringify(o));
const fresh = (over) => Object.assign(clone(M.FRESH), over || {});

const P4 = ['Asha','Bilal','Chetan','Devi'];
function playing(hands, over){
  const g = fresh(Object.assign({ phase:'playing', players:P4.slice(), hands:hands,
                                  played:[], missed:[], level:1, cleared:0,
                                  lives:3, startLives:3, maxLevel:8 }, over || {}));
  M.setG(g);
  return g;
}
// every number still in somebody's hand
const inHands = (g) => g.players.reduce((n,p) => n + (g.hands[p]||[]).length, 0);

// ── 1. the deal ──────────────────────────────────────────────
head('Dealing');
for (const n of [2,4,6,8]){
  for (const level of [1,4,8]){
    const names = 'ABCDEFGH'.slice(0,n).split('');
    const g = fresh({ players:names, level:level, hands:{} });
    M.deal(g);
    const sizes = [...new Set(names.map(p => g.hands[p].length))];
    ok(sizes.length === 1 && sizes[0] === level,
       n + ' players at level ' + level + ': ' + level + ' cards each');
    const all = names.flatMap(p => g.hands[p]);
    ok(new Set(all).size === all.length, '  every number is unique across the table');
    ok(all.every(v => v >= 1 && v <= 100), '  and inside 1-100');
    ok(names.every(p => g.hands[p].every((v,i,a) => i === 0 || a[i-1] < v)),
       '  each hand arrives sorted, so hand[0] really is your lowest');
  }
}

// ── 2. playing in order ──────────────────────────────────────
head('Playing in order costs nothing');
playing({ Asha:[10,50], Bilal:[20,60], Chetan:[30,70], Devi:[40,80] });
for (const p of ['Asha','Bilal','Chetan','Devi','Asha','Bilal','Chetan','Devi']){
  M.setMe(p); M.playLowest();
}
let g = M.getG();
ok(g.lives === 3, 'eight cards in ascending order, no life lost');
ok(g.played.every(c => !c.bad), 'nothing was cut');
ok(inHands(g) === 0, 'and every card is down');

head('Playing out of order cuts what you skipped');
playing({ Asha:[10,50], Bilal:[20,60], Chetan:[30,70], Devi:[40,80] });
M.setMe('Devi'); M.playLowest();          // 40 skips 10, 20, 30
g = M.getG();
ok(g.lives === 2, 'one life per slip, however many were skipped');
ok(g.played.filter(c => c.bad).length === 3, 'and all three skipped cards are cut');
ok(g.played.map(c => c.card).join() === '10,20,30,40', 'they go down in order, below yours');
ok(inHands(g) === 4, 'four cards remain in hands');

head('Cards are neither created nor lost');
for (let s = 0; s < 300; s++){
  const hands = {}; const pool = [];
  while (pool.length < 8){ const v = 1 + Math.floor(Math.random()*100); if (!pool.includes(v)) pool.push(v); }
  P4.forEach((p,i) => hands[p] = [pool[i*2], pool[i*2+1]].sort((a,b)=>a-b));
  playing(hands, { lives: 99 });
  const before = inHands(M.getG());
  let guard = 0;
  while (inHands(M.getG()) > 0 && guard++ < 20){
    const who = P4.filter(p => (M.getG().hands[p]||[]).length);
    M.setMe(who[Math.floor(Math.random()*who.length)]);
    M.playLowest();
  }
  const end = M.getG();
  if (end.played.length !== before || inHands(end) !== 0){
    ok(false, 'a round lost or invented cards: ' + before + ' -> ' +
       end.played.length + ' down, ' + inHands(end) + ' held');
    break;
  }
}
ok(true, 'three hundred rounds, every card ends on the pile exactly once');

// ── 3. THE PLAY MUST BE THE CARD YOU TAPPED ──────────────────
head('A retried play puts down the card the button said');
/* `const card = hand[0]` was computed INSIDE the commit callback, so a retry
   re-read it against fresh state. If your lowest had been discarded by somebody
   else's slip in between, the retry silently played your NEXT card — one you
   never chose, which could skip several more and cost another life. */
playing({ Asha:[12,45,88], Bilal:[7], Chetan:[31], Devi:[99] });
M.setMe('Asha');
M.replay(true);                            // the save lands, the response is lost
M.playLowest();
M.replay(false);
g = M.getG();
ok(g.played.filter(c => c.player === 'Asha').length === 1,
   'a replayed write plays one card, not two');
ok((g.hands.Asha || []).join() === '45,88', 'and only the tapped card leaves the hand');
ok(g.lives === 2, 'and only one life is taken (' + g.lives + ')');

head('A play cannot land in a state that has moved on');
/* backToSetup keeps every hand, so a retried play used to run to completion
   against a setup screen — appending to the pile, taking a life, and able to
   drop the whole room into 'lost' from the player list. */
playing({ Asha:[34,61,90], Bilal:[9], Chetan:[11], Devi:[22] }, { lives:1 });
M.setMe('Asha');
M.setG(Object.assign(M.getG(), { phase:'setup' }));
M.playLowest();
g = M.getG();
ok(g.phase === 'setup', 'the room stays in setup');
ok(g.lives === 1, 'no life is taken');
ok(g.played.length === 0, 'and nothing reaches the pile');

head('A card already gone is not played again');
playing({ Asha:[10,50], Bilal:[20], Chetan:[30], Devi:[40] });
M.setMe('Asha'); M.playLowest();
ok(M.getG().played.map(c=>c.card).join() === '10', 'the 10 goes down alone, skipping nobody');
M.setMe('Asha'); M.playLowest();
g = M.getG();
ok((g.hands.Asha || []).length === 0, 'a second tap plays Asha\'s next card — a real move');
ok(g.played.map(c=>c.card).join() === '10,20,30,40,50',
   'and the 50 correctly cuts the three lower cards still out (' +
   g.played.map(c=>c.card).join() + ')');
playing({ Asha:[10,50], Bilal:[20], Chetan:[30], Devi:[40] });
M.setMe('Asha');
M.conflict(true); M.playLowest(); M.conflict(false);
ok(M.getG().played.filter(c => c.player === 'Asha').length === 1,
   'but a refused-and-retried save still plays exactly one');

// ── 4. levels ────────────────────────────────────────────────
head('Finishing a level');
playing({ Asha:[10], Bilal:[20], Chetan:[30], Devi:[40] }, { level:1, maxLevel:8 });
for (const p of P4){ M.setMe(p); M.playLowest(); }
g = M.getG();
ok(g.phase === 'levelend', 'the level ends when every card is down');
ok(g.cleared === 1, 'and counts as cleared');

head('Two taps on "next level" advance once');
/* nextLevel had no guard at all: two taps skipped a level outright and re-dealt
   one already in progress, wiping the pile. */
M.nextLevel();
const lvl = M.getG().level;
const dealt = clone(M.getG().hands);
M.nextLevel(); M.nextLevel();
ok(M.getG().level === lvl, 'the level moves exactly once (' + lvl + ')');
ok(JSON.stringify(M.getG().hands) === JSON.stringify(dealt),
   'and nobody is re-dealt under a hand they have already seen');

head('The last level ends the game rather than running past it');
playing({ Asha:[10], Bilal:[20], Chetan:[30], Devi:[40] },
        { level:8, maxLevel:8, cleared:7 });
for (const p of P4){ M.setMe(p); M.playLowest(); }
g = M.getG();
ok(g.phase === 'won', 'clearing the last level wins it');
ok(g.cleared === 8, 'having genuinely cleared eight');
playing({ Asha:[10], Bilal:[20], Chetan:[30], Devi:[40] },
        { level:8, maxLevel:8, cleared:7, phase:'levelend' });
M.nextLevel();
ok(M.getG().level === 8, 'and nothing can push the level past the last one');

head('Running out of lives ends it');
playing({ Asha:[10,50], Bilal:[20], Chetan:[30], Devi:[40] }, { lives:1 });
M.setMe('Devi'); M.playLowest();          // skips three
g = M.getG();
ok(g.lives === 0 && g.phase === 'lost', 'the last life goes and the game is lost');

// ── 5. the setup guards ──────────────────────────────────────
head('The table cannot be changed underneath a running game');
playing({ Asha:[10], Bilal:[20], Chetan:[30], Devi:[40] });
M.addNamed('Latecomer');
ok(!M.getG().players.includes('Latecomer'), 'nobody is seated mid-game');
M.setLives(1);
ok(M.getG().lives === 3, 'and the lives cannot be changed mid-game');
M.setG(Object.assign(M.getG(), { phase:'playing' }));
M.startGame();
ok(M.getG().played !== undefined && M.getG().level === 1, 'sanity');

M.setG(fresh({ phase:'setup' }));
M.addNamed('Sam'); M.addNamed('sam');
ok(M.getG().players.length === 1, 'the same name cannot be seated twice — hands are keyed by name');
for (let i = 0; i < 12; i++) M.addNamed('P' + i);
ok(M.getG().players.length === 8, 'and eight is really the ceiling');

M.setG(fresh({ phase:'setup', players:['Solo'] }));
M.startGame();
ok(M.getG().phase === 'setup', 'one player cannot start a game');

head('"Change players" needs a seat');
playing({ Asha:[10], Bilal:[20], Chetan:[30], Devi:[40] });
M.setMe(null);
M.backToSetup();
ok(M.getG().phase === 'playing', 'a phone with no seat cannot end everybody\'s game');
M.setMe('Asha');
M.backToSetup();
ok(M.getG().phase === 'setup', 'but a player can');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
