/* Tests for Tambola / Housie.
 *
 * Two halves. The first is the ticket, which has to be a real Housie ticket or
 * the whole evening is wrong in a way nobody can prove at the table: 3x9, five
 * to a row, every column inside its own band, ascending down each column, no
 * repeats. That is checked over thousands of generated tickets rather than one.
 *
 * The second is the guards. This game seats thirty phones — far more than
 * anything else on the site — so every write races, and the handlers are driven
 * THROUGH mutate() here rather than around it, because that is where the guards
 * live and a test that reaches past the real entry point tests something that
 * does not ship.
 *
 *   node test_tambola.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/tambola-housie-online.html', 'utf8');

function chunk(a, b){
  const i = src.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a);
  return src.slice(i, src.indexOf(b, i) + b.length);
}
function fn(name){
  let a = src.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('no ' + name);
  // keep the `async` keyword if there is one — slicing it off gives a plain
  // function with an await in it, which will not even parse
  if (src.slice(a - 6, a) === 'async ') a -= 6;
  let d = 0;
  for (let j = src.indexOf('{', a); j < src.length; j++){
    if (src[j] === '{') d++;
    else if (src[j] === '}'){ d--; if (!d) return src.slice(a, j + 1); }
  }
}
const mod = { exports:{} };
new Function('module', [
  chunk('const PRIZES = [', '\n];'), chunk('const FRESH = {', 'null} };'),
  'let G = null, me = null, flash = "", __name = "", boardOpen = false;',
  'let __conflict = false, __lost = null;',
  // commit() applies fn, has its save refused, then applies THE SAME fn
  // again to freshly fetched state. That second application is where a
  // Math.random() inside the callback changes its mind.
  'let __replay = false;',
  /* Two different failures, two different models.
     __conflict: the save is REFUSED, so commit() re-runs fn against freshly
       fetched state. The losing application is discarded.
     __replay: the save LANDS but the response is lost, so mutate() parks fn
       in `pending` and the next poll applies it AGAIN — this time on top of
       its own earlier result. A callback that flips a value rather than
       setting one silently undoes itself here. */
  'function mutate(fn){ if (__conflict) __lost = fn(JSON.parse(JSON.stringify(G)));'
  + ' G = fn(G); if (__replay) G = fn(G); return G; }',
  'function setErr(){} function render(){}',
  'function $(id){ return { value: __name, textContent: "" }; }',
  fn('colRange'), fn('shuffle'), fn('columnCounts'), fn('rowLayout'), fn('makeTicket'),
  chunk('const ticketNumbers =', '\n'),
  fn('rowNums'), fn('cornerNums'), fn('claimNumbers'), fn('checkClaim'),
  fn('addPlayer'), fn('removePlayer'), fn('dealTickets'), fn('callNext'),
  fn('toggleMark'), fn('markAllCalled'), fn('claim'), fn('claimAndTell'), fn('newGame'),
  'module.exports = { PRIZES, FRESH, colRange, columnCounts, rowLayout, makeTicket,' +
  ' ticketNumbers, rowNums, cornerNums, claimNumbers, checkClaim, dealTickets, callNext,' +
  ' toggleMark, markAllCalled, claim, claimAndTell, newGame, removePlayer,' +
  ' addNamed:(n)=>{ __name = n; return addPlayer(); },' +
  ' setG:(g)=>{ G = g; }, getG:()=>G, setMe:(m)=>{ me = m; },' +
  ' conflict:(b)=>{ __conflict = b; __lost = null; },' +
  ' replay:(b)=>{ __replay = b; }, lost:()=>__lost,' +
  ' flash:()=>flash, boardOpen:()=>boardOpen };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);
const clone = (o) => JSON.parse(JSON.stringify(o));
const fresh = (over) => Object.assign(clone(M.FRESH), over || {});

(async function main(){
// ── 1. the ticket ────────────────────────────────────────────
head('Twenty thousand tickets, every rule of a real Housie ticket');
const faults = { none:0, shape:0, fifteen:0, dupes:0, row5:0, emptyCol:0,
                 colTooTall:0, outOfBand:0, notAscending:0 };
for (let i = 0; i < 20000; i++){
  const t = M.makeTicket();
  if (!t){ faults.none++; continue; }
  if (t.length !== 3 || t.some(r => r.length !== 9)) faults.shape++;
  const nums = M.ticketNumbers(t);
  if (nums.length !== 15) faults.fifteen++;
  if (new Set(nums).size !== nums.length) faults.dupes++;
  for (let r = 0; r < 3; r++) if (t[r].filter(x => x !== null).length !== 5) faults.row5++;
  for (let j = 0; j < 9; j++){
    const col = [0,1,2].map(r => t[r][j]).filter(x => x !== null);
    if (col.length === 0) faults.emptyCol++;
    if (col.length > 3) faults.colTooTall++;
    const [lo, hi] = M.colRange(j);
    if (col.some(v => v < lo || v > hi)) faults.outOfBand++;
    for (let k = 1; k < col.length; k++) if (col[k] <= col[k-1]) faults.notAscending++;
  }
}
ok(faults.none === 0, 'the generator never gives up');
ok(faults.shape === 0, 'every ticket is 3 rows of 9');
ok(faults.fifteen === 0, 'every ticket holds exactly fifteen numbers');
ok(faults.dupes === 0, 'no number appears twice on one ticket');
ok(faults.row5 === 0, 'every row holds exactly five');
ok(faults.emptyCol === 0, 'no column is empty');
ok(faults.colTooTall === 0, 'no column holds more than three');
ok(faults.outOfBand === 0, 'every number sits in its own column band');
ok(faults.notAscending === 0, 'and every column ascends top to bottom');

head('The column bands are the standard ones');
ok(M.colRange(0).join() === '1,9', 'first column is 1 to 9');
ok(M.colRange(4).join() === '40,49', 'middle columns are the obvious tens');
ok(M.colRange(8).join() === '80,90', 'last column is 80 to 90 — eleven numbers, as it should be');

head('Tickets differ');
const seen = new Set();
for (let i = 0; i < 3000; i++) seen.add(M.ticketNumbers(M.makeTicket()).join());
ok(seen.size === 3000, 'three thousand tickets, three thousand different sets');

// ── 2. claims ────────────────────────────────────────────────
head('A claim is checked against the ticket and the numbers actually called');
const t0 = [
  [1,   null, 21,   null, 41,   null, 61,   null, 81  ],
  [null, 12,  null,  32,  null,  52,  null,  72,  82  ],
  [3,    13,  null, null,  43,  null,  63,   73,  null]
];
ok(M.rowNums(t0,0).join() === '1,21,41,61,81', 'the top row reads left to right');
ok(M.cornerNums(t0).join() === '1,81,3,73', 'corners are the ends of the top and bottom rows');
ok(M.ticketNumbers(t0).length === 15, 'fifteen numbers on the test ticket');

ok(M.checkClaim(t0, [1,21,41,61,81], 'top'), 'a real top line is allowed');
ok(!M.checkClaim(t0, [1,21,41,61], 'top'), 'four of the five is not');
ok(M.checkClaim(t0, [1,81,3,73], 'corners'), 'four corners');
ok(!M.checkClaim(t0, [1,81,3], 'corners'), 'three corners is not four');
ok(M.checkClaim(t0, M.ticketNumbers(t0), 'full'), 'a full house needs every number');
ok(!M.checkClaim(t0, M.ticketNumbers(t0).slice(1), 'full'), 'fourteen of fifteen is not a full house');
ok(M.checkClaim(t0, [1,21,41,61,81], 'five'), 'five marked is early five');
ok(!M.checkClaim(t0, [1,21,41,61], 'five'), 'four is not');
ok(M.checkClaim(t0, [1,2,3,4,5,6,7,8,9,12,13,21], 'five'),
   'early five counts only numbers that are ON the ticket');

head('Numbers not on your ticket never help');
ok(!M.checkClaim(t0, [2,4,5,6,7,8,9,10,11], 'five'),
   'nine called numbers, none of them yours, is not an early five');
ok(!M.checkClaim(t0, [], 'top'), 'nothing called, nothing claimed');

// ── 3. the guards ────────────────────────────────────────────
function playing(names){
  const g = fresh({ phase:'setup', players:names.slice() });
  M.setG(g);
  M.dealTickets();
  return M.getG();
}

head('A stale "Deal the tickets" must not wipe a game in progress');
/* The deal button is on every phone. Two taps, or one tap from a phone whose
   screen has not caught up, used to re-deal all thirty tickets, empty the call
   history and un-award prizes that had already been won. */
let g = playing(['Asha','Bilal','Chetan']);
for (let i = 0; i < 12; i++) M.callNext();
g = M.getG();
g.prizes.five = 'Asha';
const ticketsBefore = clone(g.tickets);
const calledBefore = g.called.slice();
M.setG(g);
M.dealTickets();
g = M.getG();
ok(JSON.stringify(g.tickets) === JSON.stringify(ticketsBefore),
   'nobody\'s ticket is swapped underneath them');
ok(g.called.join() === calledBefore.join(), 'the called numbers survive');
ok(g.prizes.five === 'Asha', 'and a prize already won is not un-awarded');

head('Two phones adding the same name must not share one ticket');
/* Players are keyed by name. Two "Sam"s used to collapse to a single ticket,
   and marks made on one phone appeared on the other. */
M.setG(fresh({ phase:'setup' }));
M.addNamed('Sam'); M.addNamed('Sam'); M.addNamed('sam');
ok(M.getG().players.length === 1, 'the same name cannot be seated twice, in any case');
for (let i = 0; i < 40; i++) M.addNamed('P' + i);
ok(M.getG().players.length === 30, 'and thirty is really the ceiling (' + M.getG().players.length + ')');

head('Add and Remove must not reach into a game already running');
g = playing(['Asha','Bilal','Chetan']);
M.setG(g);
M.addNamed('Latecomer');
ok(!M.getG().players.includes('Latecomer'),
   'a stale Add cannot seat somebody with no ticket mid-game');
M.setMe('Asha');
M.removePlayer('Bilal');
ok(M.getG().players.includes('Bilal'), 'and a stale Remove cannot take a live player out');
ok(M.getG().tickets.Bilal, 'nor destroy their ticket');

head('Fewer than two players is refused where it counts');
M.setG(fresh({ phase:'setup', players:['Solo'] }));
M.dealTickets();
ok(M.getG().phase === 'setup', 'one player cannot start a game');

// ── 4. calling ───────────────────────────────────────────────
head('Calling numbers');
g = playing(['Asha','Bilal']);
M.setG(g);
for (let i = 0; i < 90; i++) M.callNext();
g = M.getG();
ok(g.called.length === 90, 'all ninety numbers come out');
ok(new Set(g.called).size === 90, 'each exactly once');
ok(Math.min(...g.called) === 1 && Math.max(...g.called) === 90, 'and they are 1 to 90');
M.callNext();
ok(M.getG().called.length === 90, 'calling again once the bag is empty does nothing');

head('A called number never changes after it has been read out');
/* callNext used to draw inside the commit callback with Math.random(). commit()
   re-runs that callback against fresh state on a conflict, so the number the
   caller had already announced was thrown away and a different one written —
   the room then marked a number that was never called. */
let changed = 0;
M.conflict(true);
for (let i = 0; i < 300; i++){
  M.setG(playing(['Asha','Bilal']));
  for (let k = 0; k < 20; k++) M.callNext();
  M.callNext();                       // one tap; the callback runs twice
  const lost = M.lost(), won = M.getG();
  const a = lost.called[lost.called.length - 1];
  const b = won.called[won.called.length - 1];
  if (a !== b) changed++;
}
M.conflict(false);
ok(changed === 0,
   'the number survives commit() re-running the callback (' + changed + '/300 changed)');

head('Calling is refused outside a running game');
M.setG(fresh({ phase:'setup', players:['A','B'] }));
M.callNext();
ok(M.getG().called.length === 0, 'no numbers come out during setup');

// ── 5. prizes ────────────────────────────────────────────────
head('A prize goes to exactly one person and stays there');
g = playing(['Asha','Bilal']);
g.called = M.ticketNumbers(g.tickets.Asha).slice();
M.setG(g);
M.setMe('Asha'); await M.claimAndTell('full');
ok(M.getG().prizes.full === 'Asha', 'Asha has the full house');
// Bilal races for the same prize on a ticket that also happens to be complete
g = M.getG();
g.called = [...new Set([...g.called, ...M.ticketNumbers(g.tickets.Bilal)])];
M.setG(g);
M.setMe('Bilal'); await M.claimAndTell('full');
ok(M.getG().prizes.full === 'Asha', 'the second claim does not take it off her');

head('A claim you have not earned is refused');
g = playing(['Asha','Bilal']);
g.called = [];
M.setG(g);
M.setMe('Asha'); await M.claimAndTell('top');
ok(M.getG().prizes.top === null, 'with nothing called, a top line is not yours');
await M.claimAndTell('five');
ok(M.getG().prizes.five === null, 'nor an early five');

head('Claiming needs a seat and a ticket');
g = playing(['Asha','Bilal']);
g.called = M.ticketNumbers(g.tickets.Asha).slice();
M.setG(g);
M.setMe(null); M.claim('full');
ok(M.getG().prizes.full === null, 'a phone with no seat cannot claim');
M.setMe('Nobody'); M.claim('full');
ok(M.getG().prizes.full === null, 'and neither can a name with no ticket');

// ── 6. marks are personal ────────────────────────────────────
head('Marks belong to one phone');
g = playing(['Asha','Bilal']);
M.setG(g);
M.setMe('Asha'); M.toggleMark(7); M.toggleMark(19);
ok((M.getG().marks.Asha || []).join() === '7,19', 'Asha\'s marks are Asha\'s');
ok((M.getG().marks.Bilal || []).length === 0, 'and Bilal has none');
M.toggleMark(7);
ok((M.getG().marks.Asha || []).join() === '19', 'tapping again unmarks');

head('Mark-all-called only takes what is both called and on your ticket');
g = playing(['Asha','Bilal']);
const mine = M.ticketNumbers(g.tickets.Asha);
g.called = [mine[0], mine[1], ...[...Array(90).keys()].map(n=>n+1).filter(n=>!mine.includes(n)).slice(0,5)];
M.setG(g);
M.setMe('Asha'); M.markAllCalled();
ok((M.getG().marks.Asha || []).length === 2, 'two of mine were called, so two are marked');
ok((M.getG().marks.Asha || []).every(n => mine.includes(n)), 'and nothing that is not on my ticket');

head('Mark-all-called cannot throw for a phone with no ticket');
g = playing(['Asha','Bilal']);
M.setG(g);
M.setMe('Ghost');
let threw = false;
try { M.markAllCalled(); } catch { threw = true; }
ok(!threw, 'a seat with no ticket does not crash the page');

head('The loser of a claim race is never told they won');
/* `flash` used to be set optimistically before the write. Two people claiming
   Full House in the same second both saw "you take Full House!", and nothing
   ever withdrew it from the one who lost. */
g = playing(['Asha','Bilal']);
g.called = [...new Set([...M.ticketNumbers(g.tickets.Asha), ...M.ticketNumbers(g.tickets.Bilal)])];
M.setG(g);
M.setMe('Asha'); await M.claimAndTell('full');
ok(M.getG().prizes.full === 'Asha', 'Asha wins the race');
ok(/Asha takes Full House/.test(M.flash()), 'and her phone says so: ' + M.flash());
M.setMe('Bilal'); await M.claimAndTell('full');
ok(M.getG().prizes.full === 'Asha', 'Bilal does not take it off her');
ok(!/Bilal takes/.test(M.flash()), 'and Bilal is NOT told he won');
ok(/Asha/.test(M.flash()) && /got there first/.test(M.flash()),
   'he is told who did: ' + M.flash());

head('A mark cannot vanish when the write is retried');
/* toggleMark flipped the value inside the commit callback, and commit() re-runs
   that callback on a conflict — so the mark was toggled twice and went back to
   where it started. At thirty phones, conflicts are constant. */
g = playing(['Asha','Bilal']);
M.setG(g);
M.setMe('Asha');
M.replay(true);
M.toggleMark(42);
ok((M.getG().marks.Asha || []).includes(42), 'the mark survives its own write being replayed');
M.toggleMark(42);
ok(!(M.getG().marks.Asha || []).includes(42), 'and so does un-marking it');
M.replay(false);
let flips = 0;
for (let i = 0; i < 200; i++){
  M.setG(playing(['Asha','Bilal'])); M.setMe('Asha');
  M.replay(true);
  M.toggleMark(7);
  if (!(M.getG().marks.Asha || []).includes(7)) flips++;
  M.replay(false);
}
ok(flips === 0, 'two hundred replayed marks, none lost (' + flips + ')');

// ── 7. starting over ─────────────────────────────────────────
head('A new game keeps the group it belongs to');
/* Rebuilding from FRESH used to drop _group, so a room in a group silently
   stopped reporting to its scoreboard from the second game onward. */
g = playing(['Asha','Bilal']);
g._group = 'K7M2QX';
M.setG(g);
M.newGame(true);
ok(M.getG()._group === 'K7M2QX', 'the group marker survives a new game');
ok(M.getG().players.join() === 'Asha,Bilal', 'and the players, when kept');
ok(M.getG().called.length === 0, 'with a fresh bag');
ok(Object.values(M.getG().prizes).every(v => v === null), 'and no prizes carried over');
g = playing(['Asha','Bilal']); g._group = 'K7M2QX';
M.setG(g); M.newGame(false);
ok(M.getG()._group === 'K7M2QX', 'and it survives starting over with new players');

// ── 8. a whole game, many times ──────────────────────────────
head('Two hundred full games called out to the last number');
let stuck = 0, allWon = 0, wrongWinner = 0, doubleAward = 0;
for (let s = 0; s < 200; s++){
  const names = ['A','B','C','D','E'].slice(0, 2 + (s % 4));
  let gg = playing(names);
  M.setG(gg);
  let guard = 0;
  while (M.getG().called.length < 90 && guard++ < 200){
    M.callNext();
    const cur = M.getG();
    for (const p of names){
      for (const pr of M.PRIZES){
        if (cur.prizes[pr.key]) continue;
        if (M.checkClaim(cur.tickets[p], cur.called, pr.key)){
          M.setMe(p); await M.claimAndTell(pr.key);
          const after = M.getG();
          if (after.prizes[pr.key] !== p) wrongWinner++;
          // and it must genuinely have been earned
          if (!M.checkClaim(after.tickets[p], after.called, pr.key)) doubleAward++;
        }
      }
    }
  }
  const end = M.getG();
  if (end.called.length !== 90) stuck++;
  if (Object.values(end.prizes).every(v => v)) allWon++;
}
ok(stuck === 0, 'every game called all ninety numbers');
ok(wrongWinner === 0, 'every prize went to the player who actually earned it');
ok(doubleAward === 0, 'and no prize was awarded on an unearned claim');
ok(allWon === 200, 'by the ninetieth number every prize has been won (' + allWon + '/200)');

})().then(() => {
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
});
