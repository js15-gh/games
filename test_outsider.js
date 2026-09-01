/* Tests for The Outsider.
 *
 * The game logic lives inline in the HTML, so rather than duplicate it here
 * (which would only prove the copy right) this pulls the real functions out of
 * the file by name and runs them. If the source changes, the test changes with
 * it or it fails loudly.
 *
 *   node test_outsider.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/the-outsider-online.html', 'utf8');

// ── lift the pieces we need out of the page ──────────────────
function slice(startMarker, endMarker){
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('not found: ' + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('no end for: ' + startMarker);
  return src.slice(a, b + endMarker.length);
}
// brace-match a top-level `function name(` … `\n}`
function fn(name){
  const a = src.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('no function ' + name);
  let depth = 0, i = src.indexOf('{', a);
  for (let j = i; j < src.length; j++){
    if (src[j] === '{') depth++;
    else if (src[j] === '}'){ depth--; if (!depth) return src.slice(a, j + 1); }
  }
  throw new Error('unbalanced ' + name);
}

const code = [
  slice('const CATS = [', '];'),
  'const catByKey = (k) => CATS.find(c=>c.key===k) || null;',
  fn('pick'), fn('dealRound'), fn('tally'), fn('score'),
  'module.exports = { CATS, catByKey, pick, dealRound, tally, score };'
].join('\n');

const mod = { exports:{} };
new Function('module', code)(mod);
const { CATS, dealRound, tally, score } = mod.exports;

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond){ pass++; } else { fail++; console.log('  FAIL: ' + msg); } }
function head(s){ console.log('\n' + s); }

// ── 1. the boards ────────────────────────────────────────────
head('Boards');
ok(CATS.length >= 10, 'at least ten categories, got ' + CATS.length);
for (const c of CATS){
  ok(c.words.length === 16, c.key + ' has 16 words, got ' + c.words.length);
  ok(new Set(c.words).size === 16, c.key + ' has no duplicate words');
  ok(c.words.every(w => typeof w === 'string' && w.trim().length > 0), c.key + ' has no blanks');
  ok(c.words.every(w => w.length <= 22), c.key + ' words all fit a grid cell');
}
ok(new Set(CATS.map(c=>c.key)).size === CATS.length, 'category keys are unique');
ok(new Set(CATS.map(c=>c.name)).size === CATS.length, 'category names are unique');

// ── 2. dealing ───────────────────────────────────────────────
head('Dealing');
const P = ['Asha','Bilal','Chetan','Devi'];
let g = { players:P, cats:[], outsider:null };
let secretOK = true, outsiderOK = true, repeats = 0, prev = null;
const seenCats = new Set(), seenWords = new Set();
for (let i = 0; i < 3000; i++){
  g = dealRound(g);
  const cat = CATS.find(c=>c.key===g.cat);
  if (!cat || !cat.words.includes(g.secret)) secretOK = false;
  if (!P.includes(g.outsider)) outsiderOK = false;
  if (prev && g.outsider === prev) repeats++;
  prev = g.outsider;
  seenCats.add(g.cat); seenWords.add(g.secret);
  if (g.phase !== 'reveal') outsiderOK = false;
}
ok(secretOK, 'the secret always belongs to the dealt category');
ok(outsiderOK, 'the Outsider is always a seated player, and the phase is reveal');
ok(repeats === 0, 'nobody is the Outsider twice running (got ' + repeats + ')');
ok(seenCats.size === CATS.length, 'every category comes up over 3000 deals');
ok(seenWords.size > 100, 'the secret varies widely (' + seenWords.size + ' distinct)');

// a two-player table has no alternative, so the rule must yield rather than hang
let g2 = { players:['Asha','Bilal'], cats:[], outsider:'Asha' };
g2 = dealRound(g2);
ok(g2.outsider === 'Bilal', 'with two players the role simply alternates');

// category filter is honoured
let g3 = { players:P, cats:['cricket','music'], outsider:null };
let filtered = true;
for (let i = 0; i < 300; i++){ g3 = dealRound(g3); if (!['cricket','music'].includes(g3.cat)) filtered = false; }
ok(filtered, 'only the chosen categories are dealt');

// a round is dealt clean — no clues, votes or verdict carried over
let g4 = dealRound({ players:P, cats:[], outsider:null,
  clues:{Asha:['x']}, votes:{Asha:'Bilal'}, ready:{Asha:true}, accused:'Asha', guess:'q', outcome:'caught' });
ok(Object.keys(g4.clues).length === 0 && Object.keys(g4.votes).length === 0
   && Object.keys(g4.ready).length === 0 && !g4.accused && !g4.guess && !g4.outcome
   && g4.clueRound === 1, 'a new round clears clues, votes, readiness and the verdict');

// ── 3. the vote ──────────────────────────────────────────────
head('Voting');
function voted(votes, outsider){
  return tally({ players:P, votes, outsider, scores:{}, log:[], round:1, cat:'cricket', secret:'Six' });
}
let r = voted({ Asha:'Bilal', Bilal:'Chetan', Chetan:'Bilal', Devi:'Bilal' }, 'Bilal');
ok(r.accused === 'Bilal' && r.phase === 'guess', 'a clear plurality on the Outsider goes to the guess');

r = voted({ Asha:'Chetan', Bilal:'Chetan', Chetan:'Devi', Devi:'Chetan' }, 'Bilal');
ok(r.accused === 'Chetan' && r.phase === 'result' && r.outcome === 'escaped',
   'accusing the wrong person lets the Outsider escape');

r = voted({ Asha:'Bilal', Bilal:'Asha', Chetan:'Devi', Devi:'Chetan' }, 'Bilal');
ok(r.accused === null && r.outcome === 'escaped',
   'a four-way tie accuses nobody and the Outsider escapes');

r = voted({ Asha:'Bilal', Bilal:'Asha', Chetan:'Bilal', Devi:'Asha' }, 'Bilal');
ok(r.accused === null && r.outcome === 'escaped', 'a two-way tie also accuses nobody');

// ── 4. scoring ───────────────────────────────────────────────
head('Scoring');
function scored(outcome, votes, outsider, guess){
  const g = { players:P, votes, outsider, outcome, guess, scores:{}, log:[],
              round:1, cat:'cricket', secret:'Six', accused:null };
  for (const p of P) g.scores[p] = 0;
  return score(g).scores;
}
let s = scored('caught', { Asha:'Bilal', Bilal:'Chetan', Chetan:'Bilal', Devi:'Bilal' }, 'Bilal', 'Duck');
ok(s.Asha === 1 && s.Chetan === 1 && s.Devi === 1 && s.Bilal === 0,
   'catching the Outsider pays 1 to each correct voter and nothing to them');

s = scored('guessed', { Asha:'Bilal', Bilal:'Chetan', Chetan:'Bilal', Devi:'Bilal' }, 'Bilal', 'Six');
ok(s.Bilal === 2 && s.Asha === 1, 'guessing the word pays the Outsider 2, and the voters still keep their point');

s = scored('escaped', { Asha:'Chetan', Bilal:'Chetan', Chetan:'Devi', Devi:'Chetan' }, 'Bilal', null);
ok(s.Bilal === 3 && s.Asha === 0 && s.Devi === 0, 'escaping pays the Outsider 3 and nobody else scores');

s = scored('escaped', { Asha:'Bilal', Bilal:'Chetan', Chetan:'Devi', Devi:'Chetan' }, 'Bilal', null);
ok(s.Bilal === 3 && s.Asha === 1,
   'a lone correct voter is still paid when the table as a whole gets it wrong');

// the Outsider never earns a point for voting — they vote for someone else by
// definition, so this is really a guard against a future refactor breaking it
s = scored('escaped', { Asha:'Chetan', Bilal:'Bilal', Chetan:'Devi', Devi:'Chetan' }, 'Bilal', null);
ok(s.Bilal === 3, 'the Outsider cannot pay themselves the voting point');

// ── 5. a whole game ──────────────────────────────────────────
head('Five rounds end to end');
let game = { players:P, cats:[], outsider:null, scores:{}, log:[], rounds:5, round:0 };
for (const p of P) game.scores[p] = 0;
let totalAwarded = 0;
for (let n = 1; n <= 5; n++){
  game.round = n;
  game = dealRound(game);
  game.votes = {};
  // everyone guesses at random, which is the worst case for the table
  for (const p of P){
    const others = P.filter(x=>x!==p);
    game.votes[p] = others[Math.floor(Math.random()*others.length)];
  }
  const before = P.reduce((t,p)=>t+game.scores[p], 0);
  game = tally(game);
  if (game.phase === 'guess'){
    const cat = CATS.find(c=>c.key===game.cat);
    game.guess = cat.words[Math.floor(Math.random()*16)];
    game.outcome = game.guess === game.secret ? 'guessed' : 'caught';
    game = score(game);
  }
  const after = P.reduce((t,p)=>t+game.scores[p], 0);
  totalAwarded += (after - before);
  ok(after >= before, 'round ' + n + ' never takes points away');
}
ok(game.log.length === 5, 'every round is logged, got ' + game.log.length);
ok(game.log[0].round === 5, 'the log is newest first');
ok(game.log.every(l => l.outsider && l.secret && l.outcome), 'each log line names the Outsider, the word and the outcome');
ok(totalAwarded > 0, 'points were actually awarded across five random rounds');

// ── 6. the escaping bug this game was patched for ────────────
head('Generated handlers');
const words = CATS.flatMap(c=>c.words);
ok(words.some(w => /['’]/.test(w)), "at least one board word contains an apostrophe (so this matters)");
ok(!/onclick="\w+\('\$\{esc\(/.test(src),
   'no generated handler interpolates an escaped string into an inline onclick');
ok(/function guessWord\(i\)/.test(src) && /function pickSeat\(i\)/.test(src)
   && /function voteSeat\(i\)/.test(src) && /function dropSeat\(i\)/.test(src),
   'handlers take indices instead');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
