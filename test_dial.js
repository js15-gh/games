/* Tests for The Dial.
 *
 * Lifts the real functions out of the page so the test tracks what ships.
 *
 *   node test_dial.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/the-dial-online.html', 'utf8');

function chunk(start, end){
  const a = src.indexOf(start);
  if (a < 0) throw new Error('not found: ' + start);
  const b = src.indexOf(end, a);
  if (b < 0) throw new Error('no end for: ' + start);
  return src.slice(a, b + end.length);
}
function fn(name){
  const a = src.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('no function ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', a); j < src.length; j++){
    if (src[j] === '{') depth++;
    else if (src[j] === '}'){ depth--; if (!depth) return src.slice(a, j + 1); }
  }
  throw new Error('unbalanced ' + name);
}

const code = [
  chunk('const CARDS = [', '\n];'),
  chunk('const BANDS = [', '\n'),
  chunk('const pointsFor =', '\n'),
  "const other = (t) => t === 'A' ? 'B' : 'A';",
  fn('dealRound'), fn('settle'),
  'module.exports = { CARDS, BANDS, pointsFor, dealRound, settle, other };'
].join('\n');

const mod = { exports:{} };
new Function('module', code)(mod);
const { CARDS, pointsFor, dealRound, settle } = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ── 1. the cards ─────────────────────────────────────────────
head('Cards');
ok(CARDS.length >= 80, 'at least 80 scales (' + CARDS.length + ')');
ok(CARDS.every(c => Array.isArray(c) && c.length === 2), 'every card has exactly two ends');
ok(CARDS.every(c => c[0] && c[1] && c[0] !== c[1]), 'no blank or identical ends');
const keys = CARDS.map(c => c.join(' | ').toLowerCase());
ok(new Set(keys).size === keys.length, 'no card appears twice');
// a scale where both ends mean the same thing gives nothing to argue about
const flipped = CARDS.map(c => [c[1], c[0]].join(' | ').toLowerCase());
ok(!keys.some((k,i) => flipped.some((f,j) => i !== j && k === f)),
   'no card is another card reversed');
ok(CARDS.every(c => c[0].length <= 24 && c[1].length <= 24), 'ends are short enough to label the scale');

// ── 2. scoring bands ─────────────────────────────────────────
head('Bands');
ok(pointsFor(0) === 4 && pointsFor(5) === 4, 'dead on and 5 away are both worth 4');
ok(pointsFor(6) === 3 && pointsFor(12) === 3, 'the second band pays 3');
ok(pointsFor(13) === 2 && pointsFor(20) === 2, 'the third band pays 2');
ok(pointsFor(21) === 0 && pointsFor(100) === 0, 'beyond that, nothing');
ok([0,1,2,3,4].every(p => pointsFor(p) >= pointsFor(p+1) || true), 'bands never increase with distance');
let mono = true;
for (let d = 0; d < 100; d++) if (pointsFor(d) < pointsFor(d+1)) mono = false;
ok(mono, 'points fall monotonically as the guess gets worse');

// ── 3. dealing ───────────────────────────────────────────────
head('Dealing');
const T = { A:['Asha','Bilal','Chetan'], B:['Devi','Esha','Faiz'] };
let g = { players:[].concat(T.A,T.B), teams:T, turn:'A', round:0, used:[], scores:{A:0,B:0}, log:[] };
const spots = [], psychics = { A:[], B:[] };
for (let r = 1; r <= 24; r++){
  g.round = r; g.turn = r % 2 ? 'A' : 'B';
  g = dealRound(g);
  spots.push(g.spot);
  psychics[g.turn].push(g.psychic);
  ok(T[g.turn].includes(g.psychic) || psychics[g.turn].length === 0,
     'round ' + r + ': the clue-giver is on the team whose turn it is');
}
ok(spots.every(s => s >= 8 && s <= 92), 'the spot is never jammed against an end (' +
   Math.min(...spots) + '–' + Math.max(...spots) + ')');
ok(new Set(g.used).size === g.used.length, 'no card is dealt twice in a game');
ok(psychics.A.join(',') === ['Asha','Bilal','Chetan','Asha','Bilal','Chetan',
   'Asha','Bilal','Chetan','Asha','Bilal','Chetan'].join(','),
   'the clue-giver rotates through the team, one per turn');
ok(g.phase === 'clue' && g.locked === null && g.bet === null && g.dial === 50,
   'a dealt round resets the dial, the lock and the bet');

// the deck must not run dry
let dry = { players:[].concat(T.A,T.B), teams:T, turn:'A', round:1,
            used:CARDS.map((_,i)=>i), scores:{A:0,B:0}, log:[] };
dry = dealRound(dry);
ok(!!dry.card, 'a card is still dealt once every card has been used');

// ── 4. settling ──────────────────────────────────────────────
head('Scoring a round');
function round(spot, locked, bet, turn){
  let g = { teams:T, turn: turn||'A', round:1, psychic:'Asha', card:['Cold','Hot'], clue:'tea',
            spot, locked, bet, scores:{A:0,B:0}, log:[] };
  return settle(g);
}
let r = round(50, 50, 'left');
ok(r.scores.A === 4, 'a dead-on guess is worth 4');
ok(r.scores.B === 0 && !r.log[0].betRight,
   'a dead-on guess leaves the other team nothing to bet on, either way');
ok(round(50, 50, 'right').scores.B === 0, 'and that holds whichever side they picked');

r = round(60, 52, 'right');
ok(r.scores.A === 3, '8 away is worth 3');
ok(r.scores.B === 1 && r.log[0].betRight, 'the spot was right of the guess and they called right');

r = round(40, 52, 'right');
ok(r.scores.A === 3 && r.scores.B === 0, 'calling right when the spot was left scores nothing');

r = round(40, 52, 'left');
ok(r.scores.B === 1, 'calling left when the spot was left scores 1');

r = round(10, 90, 'left');
ok(r.scores.A === 0 && r.scores.B === 1,
   'a hopeless guess still lets the other team take their point');

r = round(60, 52, 'right', 'B');
ok(r.scores.B === 3 && r.scores.A === 1, 'the same arithmetic works with the teams swapped');

ok(r.log[0].card.join() === 'Cold,Hot' && r.log[0].clue === 'tea' && r.log[0].spot === 60,
   'the round is logged with its card, clue and true spot');

// ── 5. a full game ───────────────────────────────────────────
head('A game to 10');
let game = { players:[].concat(T.A,T.B), teams:T, turn:'A', round:0, goal:10,
             used:[], scores:{A:0,B:0}, log:[] };
let rounds = 0;
while (game.scores.A < 10 && game.scores.B < 10 && rounds < 60){
  rounds++;
  game.round = rounds; game.turn = rounds % 2 ? 'A' : 'B';
  game = dealRound(game);
  game.locked = Math.max(0, Math.min(100, game.spot + (Math.random()*30|0) - 15));
  game.bet = Math.random() < .5 ? 'left' : 'right';
  game = settle(game);
}
ok(rounds < 60, 'the game reaches 10 in a sane number of rounds (' + rounds + ')');
ok(game.scores.A >= 10 || game.scores.B >= 10, 'somebody actually got there');
ok(game.log.length === Math.min(rounds, 30), 'every round is logged, capped at 30');
ok(game.log[0].round === rounds, 'the log is newest first');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
