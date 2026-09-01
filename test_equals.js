/* Tests for Equals — the daily hidden-equation game.
 *
 * Three things carry this game and each fails quietly:
 *   1. The arithmetic parser. There is no eval() here, so the precedence,
 *      the exact-division rule and the leading-zero rule are all hand-written
 *      and all easy to get subtly wrong.
 *   2. mark(). Greens must be taken before ambers, or a guess holding two 4s
 *      lights both up when the answer holds one.
 *   3. generate(). Every puzzle it emits must be judged sound by the same
 *      function that judges the player, at every width.
 *
 *   node test_equals.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/equals.html', 'utf8');

function chunk(a, b){ const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i) + b.length); }
function fn(name){
  const a = src.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('no ' + name);
  let d = 0;
  for (let j = src.indexOf('{', a); j < src.length; j++){
    if (src[j] === '{') d++;
    else if (src[j] === '}'){ d--; if (!d) return src.slice(a, j + 1); }
  }
}
const mod = { exports:{} };
new Function('module', [
  chunk("const OPS = [", "\n"), chunk("const SYMS = [", "\n"),
  fn('todayKey'), fn('seedFrom'), fn('rng'),
  fn('tokenize'), fn('evalSide'), fn('checkEquation'), fn('mark'),
  chunk("const LENGTHS = [", "\n];"), chunk("const lenOf =", "\n"),
  fn('generate'),
  'module.exports = { OPS, SYMS, todayKey, seedFrom, rng, tokenize, evalSide,' +
  ' checkEquation, mark, LENGTHS, lenOf, generate };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ── 1. the arithmetic ────────────────────────────────────────
head('Reading a sum');
ok(M.evalSide('7') === 7, 'a bare number');
ok(M.evalSide('12+34') === 46, 'addition');
ok(M.evalSide('50-8') === 42, 'subtraction');
ok(M.evalSide('6*7') === 42, 'multiplication');
ok(M.evalSide('84/2') === 42, 'division');
ok(M.evalSide('1+2+3') === 6, 'three terms');

head('× and ÷ go before + and −');
ok(M.evalSide('2+3*4') === 14, '2+3*4 is 14, not 20');
ok(M.evalSide('3*4+2') === 14, 'and the same with the product first');
ok(M.evalSide('10-6/2') === 7, '10-6/2 is 7, not 2');
ok(M.evalSide('2*3*4') === 24, 'a run of products');
ok(M.evalSide('1+2*3+4') === 11, 'a product buried in the middle');

head('Division is exact or it is nothing');
ok(M.evalSide('7/2') === null, 'a remainder is not an answer');
ok(M.evalSide('5/0') === null, 'nor is dividing by zero');
ok(M.evalSide('9/3') === 3, 'but a clean one is fine');
ok(M.evalSide('1+7/2') === null, 'an inexact division anywhere kills the sum');

head('Malformed input returns null rather than throwing');
for (const bad of ['', '+', '1+', '+1', '1++2', '1 2', 'a', '1=2', '**', '1+*2', '3--4']){
  let threw = false, v;
  try { v = M.evalSide(bad); } catch (e) { threw = true; }
  ok(!threw && v === null, JSON.stringify(bad) + ' is rejected quietly');
}

head('Leading zeros are not numbers');
ok(M.evalSide('01') === null, '01 is not a number a player may write');
ok(M.evalSide('1+02') === null, 'nor in the middle of a sum');
ok(M.evalSide('0') === 0, 'but a plain zero is');
ok(M.evalSide('0+5') === 5, 'and zero may lead a sum');
ok(M.evalSide('10+20') === 30, 'a zero inside a number is untouched');

// ── 2. judging a guess ───────────────────────────────────────
head('Judging a guess');
ok(M.checkEquation('12+34=46', 8) === null, 'a true sum of the right width passes');
ok(M.checkEquation('12+34=47', 8) !== null, 'a false one does not');
ok(M.checkEquation('12+34=4', 7) !== null, 'nor a false one at another width');
ok(M.checkEquation('4+5=9', 8) !== null, 'the wrong width is rejected');
ok(M.checkEquation('4+5=9', 5) === null, 'and the right width accepted');
ok(M.checkEquation('1+2=3=3', 7) !== null, 'two equals signs');
ok(M.checkEquation('123456', 6) !== null, 'no equals sign at all');
ok(M.checkEquation('1+2=a', 5) !== null, 'a letter');
ok(M.checkEquation('5-9=-4', 6) !== null, 'a negative answer is out of bounds');
ok(M.checkEquation('9-9=0', 5) === null, 'but zero is in');
ok(M.checkEquation(null, 8) !== null, 'a non-string is rejected, not crashed on');
ok(M.checkEquation('1+1=2 ', 6) !== null, 'a trailing space is not a symbol');

head('Every rejection says something a player can act on');
for (const bad of ['12+34=47', '4+5=9', '1+2=3=3', '123456', '1+2=a']){
  const msg = M.checkEquation(bad, 8);
  ok(typeof msg === 'string' && msg.length > 8, 'rejecting ' + bad + ' explains why: ' + msg);
}

// ── 3. marking ───────────────────────────────────────────────
head('Marking a guess against the answer');
const mk = (g, a) => M.mark(g, a).join(' ');
ok(mk('12+34=46', '12+34=46') === 'hit hit hit hit hit hit hit hit', 'the answer is all green');

// the worked example printed on the page: guess 25+31=56, answer 12+34=46
ok(mk('25+31=56', '12+34=46') === 'near miss hit hit near hit miss hit',
   'the how-to example marks exactly as the page claims');

head('Greens are taken before ambers');
// answer holds ONE 4; a guess with two must not light both
ok(mk('44+00=44', '4+5=9xxx'.slice(0,8)) !== null, 'sanity');
ok(M.mark('4400', '4123').join(' ') === 'hit miss miss miss',
   'the 4 in place is green and the second 4 gets nothing');
ok(M.mark('0440', '0123').filter(x => x === 'near').length === 0,
   'a repeated digit absent from the answer stays grey');
ok(M.mark('4004', '0044').join(' ') === 'near hit near hit',
   'the two that happen to line up are green and the swapped pair amber');
ok(M.mark('40', '04').join(' ') === 'near near', 'a straight swap is two ambers');
ok(M.mark('44', '44').join(' ') === 'hit hit', 'both in place');
ok(M.mark('45', '54').join(' ') === 'near near', 'both present, both misplaced');

head('Amber count never exceeds what the answer holds');
for (const [g, a] of [['4444','4123'],['1111','1231'],['++++','1+2=3xx'.slice(0,4)],
                      ['5555','5555'],['0000','1010']]){
  const marks = M.mark(g, a);
  const counts = {};
  for (const c of a) counts[c] = (counts[c] || 0) + 1;
  const claimed = {};
  for (let i = 0; i < g.length; i++){
    if (marks[i] !== 'miss') claimed[g[i]] = (claimed[g[i]] || 0) + 1;
  }
  const bad = Object.keys(claimed).filter(c => claimed[c] > (counts[c] || 0));
  ok(bad.length === 0, g + ' vs ' + a + ' never claims more of a symbol than exists');
}

head('Marking is symmetric in length and never throws');
ok(M.mark('', '').length === 0, 'two empty strings');
ok(M.mark('1+1=2', '9*9=81'.slice(0,5)).length === 5, 'length follows the answer');

// ── 4. generated puzzles ─────────────────────────────────────
head('Every generated puzzle is judged sound by the same rule');
let made = 0, badWidth = 0, badSum = 0, negative = 0, none = 0;
const seenPerWidth = {};
for (const L of M.LENGTHS){
  const seen = new Set();
  for (let s = 0; s < 400; s++){
    const eq = M.generate(L.len, M.rng(M.seedFrom('seed-' + L.len + '-' + s)));
    if (eq === null){ none++; continue; }
    made++;
    if (eq.length !== L.len) badWidth++;
    if (M.checkEquation(eq, L.len) !== null) badSum++;
    const rhs = eq.split('=')[1];
    if (M.evalSide(rhs) < 0) negative++;
    seen.add(eq);
  }
  seenPerWidth[L.len] = seen.size;
}
ok(none === 0, 'the generator always found a sum (' + none + ' gave up)');
ok(made === 1200, 'twelve hundred puzzles generated across three widths');
ok(badWidth === 0, 'every one is exactly its stated width');
ok(badSum === 0, 'every one passes checkEquation — the rule that judges the player');
ok(negative === 0, 'no answer is negative');

head('And there is enough variety to play daily');
for (const L of M.LENGTHS){
  ok(seenPerWidth[L.len] > 100,
     L.len + ' wide: ' + seenPerWidth[L.len] + ' distinct equations in 400 draws');
}

head('The wider boards actually use the room');
let threeTerm = 0;
for (let s = 0; s < 300; s++){
  const eq = M.generate(10, M.rng(M.seedFrom('w-' + s)));
  if (eq && (eq.split('=')[0].match(/[+\-*\/]/g) || []).length >= 2) threeTerm++;
}
ok(threeTerm > 250, '10 wide is nearly always three numbers (' + threeTerm + '/300)');

let sixTwoTerm = 0;
for (let s = 0; s < 300; s++){
  const eq = M.generate(6, M.rng(M.seedFrom('n-' + s)));
  if (eq && (eq.split('=')[0].match(/[+\-*\/]/g) || []).length === 1) sixTwoTerm++;
}
ok(sixTwoTerm === 300, '6 wide is always two numbers, which is the gentle end');

// ── 5. the daily puzzle ──────────────────────────────────────
head('The same day gives everyone the same puzzle');
const d = new Date(2026, 8, 1);
ok(M.todayKey(d) === '2026-09-01', 'the date key is local, not UTC');
ok(M.todayKey(new Date(2026, 0, 5)) === '2026-01-05', 'months and days are padded');

const a1 = M.generate(8, M.rng(M.seedFrom('2026-09-01:8')));
const a2 = M.generate(8, M.rng(M.seedFrom('2026-09-01:8')));
ok(a1 === a2 && a1 !== null, 'one day, one answer, however many times you ask');

head('And a different one tomorrow');
let same = 0;
let prev = null;
for (let i = 1; i <= 60; i++){
  const k = M.todayKey(new Date(2026, 8, i));
  const eq = M.generate(8, M.rng(M.seedFrom(k + ':8')));
  if (eq !== null && eq === prev) same++;
  prev = eq;
}
ok(same === 0, 'sixty consecutive days, no day repeats the one before it');

head('Each width has its own puzzle for the day');
const byWidth = M.LENGTHS.map(L => M.generate(L.len, M.rng(M.seedFrom('2026-09-01:' + L.len))));
ok(new Set(byWidth).size === 3, 'switching width on the same day gives a new puzzle');

head('Widths');
ok(M.LENGTHS.length === 3, 'three widths');
ok(M.LENGTHS.every(L => L.len % 2 === 0 && L.name && L.hint), 'each is even and labelled');
ok(M.lenOf(99).len === 8, 'an unknown width falls back to the usual 8');
ok(M.lenOf(6).len === 6, 'and a known one is itself');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
