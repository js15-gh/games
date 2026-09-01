/* Tests for One Word.
 *
 * Lifts the real functions out of the page rather than restating them here,
 * so the test cannot quietly drift away from what ships.
 *
 *   node test_oneword.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/one-word-online.html', 'utf8');

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
  chunk('const WORDS = {', '\n};'),
  chunk('const TIERS = [', '\n];'),
  chunk('const poolFor =', '[]);'),   // spans two lines
  chunk('const norm =', ".replace(/[^a-z0-9]/g, '');"),
  fn('same'), fn('deadClues'),
  chunk('const livingClues =', '\n};'),
  fn('nextWord'), fn('dealRound'), fn('settle'),
  'module.exports = { WORDS, TIERS, poolFor, norm, same, deadClues, livingClues, nextWord, dealRound, settle };'
].join('\n');

const mod = { exports:{} };
new Function('module', code)(mod);
const { WORDS, poolFor, same, deadClues, livingClues, nextWord, dealRound, settle } = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ── 1. the word lists ────────────────────────────────────────
head('Words');
const all = [].concat(WORDS.easy, WORDS.mixed, WORDS.tricky);
ok(WORDS.easy.length >= 50, 'easy tier is large enough (' + WORDS.easy.length + ')');
ok(all.length >= 180, 'at least 180 words in total (' + all.length + ')');
ok(new Set(all.map(w=>w.toLowerCase())).size === all.length, 'no word appears twice, in any tier');
ok(all.every(w => !/\s/.test(w)), 'every word is a single word');
ok(poolFor('easy').length === WORDS.easy.length, 'Easy draws only from the easy list');
ok(poolFor('mixed').length === WORDS.easy.length + WORDS.mixed.length, 'Mixed draws from two lists');
ok(poolFor('tricky').length === all.length, 'Tricky draws from everything');
// a child clueing "bureaucracy" is the failure this tier exists to prevent
ok(!WORDS.easy.some(w => w.length > 10), 'no long words in the easy tier');

// ── 2. matching, which is the entire game ────────────────────
head('Matching clues');
ok(same('cat', 'cat'), 'identical');
ok(same('Cat', 'CAT '), 'case and whitespace ignored');
ok(same('cat', 'cats'), 'plural cancels singular');
ok(same('boxes', 'box'), 'es-plural cancels');
ok(same('city', 'cities'), 'y/ies cancels');
ok(same('café', 'cafe'), 'accents ignored');
ok(same("rock'n'roll", 'rocknroll'), 'punctuation ignored');
// a stemmer that just strips a trailing 's' turns "bus" into "bu" and stops
// it cancelling "buses"; comparing both full forms instead does the right thing
ok(same('bus', 'buses'), 'bus/buses cancels, which naive stemming gets wrong');
ok(!same('cat', 'dog'), 'different words do not cancel');
ok(!same('sing', 'sings') === false, 'sing/sings cancels');
ok(!same('', 'cat') && !same('cat', ''), 'an empty clue never matches');
ok(!same('mouse', 'mice'), 'irregular plurals are NOT caught — a known, accepted limit');

head('Cancelling');
let d = deadClues({ A:'trunk', B:'trunk', C:'grey' }, 'Elephant');
ok(d.A && d.B && !d.C, 'a matching pair is cancelled and the odd one survives');

d = deadClues({ A:'tusk', B:'tusks', C:'big' }, 'Elephant');
ok(d.A && d.B && !d.C, 'singular and plural cancel each other');

d = deadClues({ A:'elephant', B:'grey', C:'trunk' }, 'Elephant');
ok(d.A && !d.B && !d.C, 'writing the secret word itself is thrown away');

d = deadClues({ A:'grey', B:'grey', C:'grey' }, 'Elephant');
ok(d.A && d.B && d.C, 'three identical clues all die, not just two');

d = deadClues({ A:'a', B:'b', C:'c' }, 'Elephant');
ok(Object.keys(d).length === 0, 'three different clues all survive');

ok(livingClues({ clues:{ A:'trunk', B:'trunk', C:'grey' }, secret:'Elephant' }).join() === 'C',
   'livingClues returns only the survivors');
ok(livingClues({ clues:{ A:'x', B:'x' }, secret:'Elephant' }).length === 0,
   'every clue can cancel, leaving the guesser nothing');

// ── 3. dealing ───────────────────────────────────────────────
head('Dealing');
const P = ['Asha','Bilal','Chetan','Devi'];
let g = { players:P, tier:'mixed', round:0, used:[], clues:{}, log:[] };
const guessers = [];
for (let r = 1; r <= 12; r++){ g.round = r; g = dealRound(g); guessers.push(g.guesser); }
ok(guessers.join(',') === [...Array(12)].map((_,i)=>P[i%4]).join(','),
   'the guesser rotates evenly through the table');
ok(new Set(g.used).size === g.used.length, 'no word is dealt twice in a game');
ok(g.used.every(w => poolFor('mixed').includes(w)), 'every word comes from the chosen tier');
ok(g.phase === 'clue' && Object.keys(g.clues).length === 0, 'a dealt round starts clean, in the clue phase');

// the deck must not run dry when the used-list covers the pool
let small = { players:P, tier:'easy', round:1, used:poolFor('easy').slice(), clues:{}, log:[] };
small = dealRound(small);
ok(!!small.secret, 'a word is still dealt once every word has been used');

// ── 4. card accounting ───────────────────────────────────────
head('Cards, wins and burns');
function play(outcomes, cards){
  // mirrors what render/nextRound do, so the arithmetic is tested where it lives
  let g = { players:P, tier:'mixed', cards, round:1, won:0, used:[], clues:{}, log:[], secret:'X', guesser:'Asha' };
  const seen = [];
  for (const o of outcomes){
    g.secret = 'W' + g.round;
    g.outcome = o; g.guess = o === 'pass' ? null : 'g';
    g = settle(g);
    seen.push({ round:g.round, burned:g.burned });
    const spent = g.round + (g.log[0].outcome === 'wrong' ? 1 : 0);
    if (spent >= cards){ g.phase = 'gameover'; break; }
    g.round = spent + 1;
  }
  return { g, seen };
}
let r = play(['right','right','right'], 13);
ok(r.g.won === 3 && r.g.round === 4, 'three right answers win three cards and reach card 4');

r = play(['wrong'], 13);
ok(r.g.won === 0 && r.g.round === 3 && r.seen[0].burned,
   'a wrong answer burns the next card, so play resumes at card 3');

r = play(['pass'], 13);
ok(r.g.won === 0 && r.g.round === 2 && !r.seen[0].burned, 'a pass costs the card but burns nothing');

r = play(Array(13).fill('right'), 13);
ok(r.g.won === 13 && r.g.phase === 'gameover', 'thirteen right answers is a perfect game and ends it');

r = play(Array(7).fill('wrong'), 13);
ok(r.g.phase === 'gameover' && r.g.won === 0,
   'seven wrong answers burn through thirteen cards');

// the last card cannot burn a card that does not exist
r = play(Array(6).fill('right').concat(['wrong']), 7);
ok(r.g.phase === 'gameover' && !r.seen[6].burned,
   'a wrong answer on the last card burns nothing');

// ── 5. the log ───────────────────────────────────────────────
head('Log');
let lg = { players:P, cards:13, round:1, won:0, log:[], secret:'Elephant', guesser:'Asha',
           clues:{ Bilal:'trunk', Chetan:'trunk', Devi:'grey' }, outcome:'right', guess:'elephant' };
lg = settle(lg);
ok(lg.log[0].dead.Bilal && lg.log[0].dead.Chetan && !lg.log[0].dead.Devi,
   'the log records which clues were cancelled, so the end screen can show them');
ok(lg.log[0].clues !== lg.clues, 'the log holds a copy, not a reference that the next round mutates');
ok(lg.won === 1, 'a right answer scores');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
