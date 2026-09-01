/* Tests for the on-your-own games: Maths Sprint and Word Ladder.
 *
 *   node test_solo.js
 */
const fs = require('fs');

function loader(file){
  const src = fs.readFileSync(__dirname + '/' + file, 'utf8');
  return { src,
    chunk(a, b){ const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i) + b.length); },
    fn(name){
      const a = src.indexOf('function ' + name + '(');
      if (a < 0) throw new Error(file + ': no ' + name);
      let d = 0;
      for (let j = src.indexOf('{', a); j < src.length; j++){
        if (src[j] === '{') d++;
        else if (src[j] === '}'){ d--; if (!d) return src.slice(a, j + 1); }
      }
    } };
}
function build(parts, exp){
  const m = { exports:{} };
  new Function('module', parts.concat([exp]).join('\n'))(m);
  return m.exports;
}
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + msg); } };
const head = s => console.log('\n' + s);

// ════════════════════════════════════════════════════════════
//  MATHS SPRINT
// ════════════════════════════════════════════════════════════
const ms = loader('maths-sprint.html');
const MS = build([
  ms.chunk('const ri =', '\n'),
  ms.chunk('const pick =', '\n'),
  ms.chunk('const gcd =', '\n'),
  ms.fn('percentQ'),
  ms.chunk('const LEVELS = [', '\n];'),
  ms.chunk('const levelByKey =', '\n'),
  ms.chunk('const TIMES =', '\n'),
  ms.fn('makeQuestion'),
], 'module.exports = { LEVELS, levelByKey, TIMES, makeQuestion };');

head('Maths Sprint — the levels');
ok(MS.LEVELS.length === 4, 'four levels');
ok(new Set(MS.LEVELS.map(l=>l.key)).size === 4, 'with unique keys');
ok(MS.LEVELS.every(l => l.makers.length >= 3), 'each has at least three kinds of question');
ok(MS.LEVELS.every(l => l.name && l.hint && l.age), 'each is labelled, described and age-tagged');
ok(MS.TIMES.length >= 2 && MS.TIMES.every(t => t > 0), 'sensible time options');
ok(MS.levelByKey('nonsense').key === 'std', 'an unknown level falls back to Standard');

head('Maths Sprint — every question is answerable');
/* The real risk in a generated maths game is a question whose stated answer is
   wrong, or one that is unanswerable on a phone (fractions, negatives where the
   pad has no minus). This runs the generators hard and checks the arithmetic
   independently of how the question was built. */
function evaluate(q){
  // a deliberately separate evaluator — if it agrees with the generator, the
  // generator's own answer was right
  let s = q.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
           .replace(/²/g, '**2');
  const pct = s.match(/^(\d+)% of (\d+)$/);
  if (pct) return (+pct[1]) * (+pct[2]) / 100;
  const sqMinus = s.match(/^(\d+)\*\*2 - (\d+)$/);
  if (sqMinus) return (+sqMinus[1]) ** 2 - (+sqMinus[2]);
  if (!/^[0-9+\-*/() .*]+$/.test(s)) return NaN;
  try { return Function('"use strict";return (' + s + ')')(); } catch { return NaN; }
}
let bad = 0, nonInteger = 0, huge = 0, unparsed = 0, seenKinds = new Set();
for (const L of MS.LEVELS){
  for (let i = 0; i < 4000; i++){
    const heat = (i % 100) / 100;
    const q = MS.makeQuestion(L, heat, []);
    seenKinds.add(q.q.replace(/[0-9]+/g, '#'));
    const check = evaluate(q.q);
    if (Number.isNaN(check)) { unparsed++; continue; }
    if (Math.abs(check - q.a) > 1e-9) { bad++; if (bad < 4) console.log('    ' + L.key + ': ' + q.q + ' said ' + q.a + ', is ' + check); }
    if (!Number.isInteger(q.a)) nonInteger++;
    if (Math.abs(q.a) > 99999) huge++;
  }
}
ok(unparsed === 0, 'every generated question is in a form the checker recognises (' + unparsed + ' odd)');
ok(bad === 0, 'every generated question states the right answer (16,000 checked)');
ok(nonInteger === 0, 'no answer is a fraction — the number pad could not express one');
ok(huge === 0, 'no answer runs past six digits, which is the entry limit');
// 17 makers collapse to 10 distinct shapes once the digits are normalised
ok(seenKinds.size >= 9, 'the generators produce a good variety of shapes (' + seenKinds.size + ')');

head('Maths Sprint — difficulty actually moves');
function spread(level, heat){
  let sum = 0;
  for (let i = 0; i < 2000; i++) sum += Math.abs(MS.makeQuestion(level, heat, []).a);
  return sum / 2000;
}
for (const L of MS.LEVELS){
  const cold = spread(L, 0), hot = spread(L, 1);
  ok(hot > cold, L.key + ': the numbers grow with the heat (' +
     Math.round(cold) + ' → ' + Math.round(hot) + ')');
}
const warmHot = spread(MS.levelByKey('warm'), 1);
const brutalCold = spread(MS.levelByKey('brutal'), 0);
ok(warmHot < brutalCold, 'Warm-up at its hardest is still easier than Brutal at its easiest');

head('Maths Sprint — no immediate repeats');
const recent = [];
let repeats = 0;
const L = MS.levelByKey('std');
for (let i = 0; i < 3000; i++){
  const q = MS.makeQuestion(L, 0.5, recent);
  if (recent.includes(q.q)) repeats++;
  recent.push(q.q); if (recent.length > 12) recent.shift();
}
ok(repeats < 60, 'a question almost never repeats within twelve (' + repeats + ' in 3000)');

// ════════════════════════════════════════════════════════════
//  WORD LADDER
// ════════════════════════════════════════════════════════════
const wl = loader('word-ladder.html');
const WL = build([
  wl.chunk('const diffOne =', '\n};'),
  'let WORDS = [], SET = new Set(), NEIGH = new Map();',
  wl.fn('buildGraph'), wl.fn('makeLadder'), wl.fn('solve'),
  wl.fn('seedFrom'), wl.fn('rng'), wl.fn('todayKey'),
], 'module.exports = { diffOne, buildGraph, makeLadder, solve, seedFrom, rng, todayKey, ' +
   'graph: () => ({ WORDS, SET, NEIGH }) };');
const pack = JSON.parse(fs.readFileSync(__dirname + '/content/words4.json', 'utf8'));

head('Word Ladder — the word list');
ok(pack.words.length >= 700, 'at least 700 words (' + pack.words.length + ')');
ok(pack.words.every(w => w.length === 4), 'every word is four letters');
ok(pack.words.every(w => /^[a-z]{4}$/.test(w)), 'lower case, letters only');
ok(new Set(pack.words).size === pack.words.length, 'no duplicates');

WL.buildGraph(pack.words);
const { NEIGH } = WL.graph();
const orphans = pack.words.filter(w => (NEIGH.get(w) || []).length === 0);
ok(orphans.length < pack.words.length * 0.06,
   'few dead-end words: ' + orphans.length + ' of ' + pack.words.length +
   (orphans.length ? ' (' + orphans.slice(0,8).join(', ') + '…)' : ''));
const rich = pack.words.filter(w => (NEIGH.get(w) || []).length >= 3);
ok(rich.length > 250, 'plenty of well-connected words to start from (' + rich.length + ')');

head('Word Ladder — neighbours');
ok(WL.diffOne('cold','cord'), 'cold and cord are one apart');
ok(!WL.diffOne('cold','ward'), 'cold and ward are not');
ok(!WL.diffOne('cold','cold'), 'a word is not its own neighbour');
ok(!WL.diffOne('cold','colder'), 'different lengths never match');
ok((NEIGH.get('cold')||[]).every(w => WL.diffOne('cold', w)),
   "every listed neighbour of 'cold' really is one letter away");

head('Word Ladder — 2,000 generated ladders');
/* The failure that would make this game worthless is handing a child a ladder
   with no solution. Ladders are generated by walking, so one exists by
   construction — this proves it, and proves the ends are honest. */
let noPath = 0, tooEasy = 0, wrongLen = 0, badStep = 0, failed = 0;
for (let i = 0; i < 2000; i++){
  const rand = WL.rng(WL.seedFrom('t' + i));
  const steps = 3 + (i % 3);
  const path = WL.makeLadder(steps, rand);
  if (!path){ failed++; continue; }
  if (path.length !== steps + 1) wrongLen++;
  for (let k = 1; k < path.length; k++) if (!WL.diffOne(path[k-1], path[k])) badStep++;
  if (WL.diffOne(path[0], path[path.length-1])) tooEasy++;
  if (!WL.solve(path[0], path[path.length-1])) noPath++;
}
ok(failed === 0, 'a ladder is always produced (' + failed + ' failures)');
ok(wrongLen === 0, 'the ladder is exactly as long as asked');
ok(badStep === 0, 'every step really does change exactly one letter');
ok(tooEasy === 0, 'the two ends are never already one letter apart');
ok(noPath === 0, 'every ladder handed to a player is solvable');

head('Word Ladder — the same day gives the same ladder');
const a1 = WL.makeLadder(4, WL.rng(WL.seedFrom('ladder:2026-09-01')));
const a2 = WL.makeLadder(4, WL.rng(WL.seedFrom('ladder:2026-09-01')));
const b1 = WL.makeLadder(4, WL.rng(WL.seedFrom('ladder:2026-09-02')));
ok(a1.join() === a2.join(), 'same date, byte-identical ladder');
ok(a1.join() !== b1.join(), 'a different date gives a different one');
ok(WL.todayKey(new Date(2026,0,5)) === '2026-01-05', 'dates are local and padded');

head('Word Ladder — solving');
const sol = WL.solve('cold', 'warm');
ok(sol && sol[0] === 'cold' && sol[sol.length-1] === 'warm', 'it finds cold → warm');
ok(sol && sol.every((w,i) => i === 0 || WL.diffOne(sol[i-1], w)), 'and every step of it is legal');
ok(WL.solve('cold','cold').length === 1, 'a word solves to itself in no steps');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
