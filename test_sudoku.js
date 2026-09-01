/* Tests for Sudoku.
 *
 * One property matters more than everything else put together: every puzzle
 * handed to a player must have EXACTLY ONE answer. A sudoku with two answers
 * is not a hard sudoku, it is a broken one — the solver reasons correctly,
 * runs out of logic, guesses, and is told they are wrong.
 *
 *   node test_sudoku.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/sudoku.html', 'utf8');

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
  fn('seedFrom'), fn('rng'), chunk('const shuffled =', '\n};'),
  fn('boxDims'), fn('canPlace'), fn('countSolutions'), fn('fullGrid'), fn('carve'),
  chunk('const SIZES = [', '\n];'),
  chunk('const LEVELS = [', '];'),   // one line, so no leading newline to match
  chunk('const sizeOf =', '\n'),
  fn('makePuzzle'), fn('todayKey'),
  'module.exports = { seedFrom, rng, shuffled, boxDims, canPlace, countSolutions, ' +
  'fullGrid, carve, SIZES, LEVELS, sizeOf, makePuzzle, todayKey };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ── 1. box shapes ────────────────────────────────────────────
head('Box shapes');
ok(M.boxDims(4).join() === '2,2', '4×4 uses 2×2 boxes');
ok(M.boxDims(6).join() === '2,3', '6×6 uses 2 rows by 3 columns — not a 6×6 latin square');
ok(M.boxDims(9).join() === '3,3', '9×9 uses 3×3 boxes');
for (const s of M.SIZES){
  const [bh, bw] = M.boxDims(s.n);
  ok(bh * bw === s.n, s.n + '×' + s.n + ': a box holds exactly ' + s.n + ' cells');
  ok(s.n % bh === 0 && s.n % bw === 0, s.n + '×' + s.n + ': boxes tile the grid exactly');
}

// ── 2. placement rule ────────────────────────────────────────
head('The placement rule');
const g9 = new Array(81).fill(0);
g9[0] = 5;
ok(!M.canPlace(g9, 9, 1, 5), 'same row is blocked');
ok(!M.canPlace(g9, 9, 9, 5), 'same column is blocked');
ok(!M.canPlace(g9, 9, 10, 5), 'same box is blocked');
ok(M.canPlace(g9, 9, 40, 5), 'a cell sharing nothing is allowed');
ok(M.canPlace(g9, 9, 4, 3), 'a different digit in the same row is allowed');

// ── 3. full grids ────────────────────────────────────────────
head('Complete grids');
function validFull(g, n){
  const [bh, bw] = M.boxDims(n);
  const seen = (arr) => new Set(arr).size === n && arr.every(v => v >= 1 && v <= n);
  for (let r = 0; r < n; r++) if (!seen(g.slice(r*n, r*n+n))) return false;
  for (let c = 0; c < n; c++) if (!seen(Array.from({length:n},(_,r)=>g[r*n+c]))) return false;
  for (let r0 = 0; r0 < n; r0 += bh)
    for (let c0 = 0; c0 < n; c0 += bw){
      const box = [];
      for (let a = 0; a < bh; a++) for (let b = 0; b < bw; b++) box.push(g[(r0+a)*n + (c0+b)]);
      if (!seen(box)) return false;
    }
  return true;
}
for (const n of [4,6,9]){
  let bad = 0;
  const seen = new Set();
  for (let i = 0; i < 60; i++){
    const g = M.fullGrid(n, M.rng(M.seedFrom('full' + n + i)));
    if (!validFull(g, n)) bad++;
    seen.add(g.join(','));
  }
  ok(bad === 0, n + '×' + n + ': 60 complete grids, every row, column and box perfect');
  ok(seen.size > 50, n + '×' + n + ': the grids actually vary (' + seen.size + ' distinct of 60)');
}

// ── 4. solution counting ─────────────────────────────────────
head('Counting solutions');
const full9 = M.fullGrid(9, M.rng(1));
ok(M.countSolutions(full9, 9, 2) === 1, 'a completed grid has exactly one solution');
const oneHole = full9.slice(); oneHole[40] = 0;
ok(M.countSolutions(oneHole, 9, 2) === 1, 'one blank still has exactly one');
// two cells in the same row swapped between two values gives exactly two answers
const two = full9.slice();
const r = 0;
let a = -1, b = -1;
for (let c = 0; c < 9; c++){ if (a < 0) a = c; else { b = c; break; } }
two[r*9 + a] = 0; two[r*9 + b] = 0;
ok(M.countSolutions(two, 9, 3) >= 1, 'two blanks in a row remain solvable');
const empty4 = new Array(16).fill(0);
ok(M.countSolutions(empty4, 4, 2) === 2, 'an empty 4×4 has many answers — the counter stops at the limit');
const impossible = new Array(16).fill(0);
impossible[0] = 1; impossible[1] = 1;
ok(M.countSolutions(impossible, 4, 2) === 0, 'an illegal start has no answers at all');

// ── 5. THE property: every puzzle has exactly one answer ─────
head('Every generated puzzle has exactly one answer');
let checked = 0, notUnique = 0, notSolvable = 0, givensOff = 0, mismatched = 0, tooEasy = 0;
const t0 = Date.now();
for (const s of M.SIZES){
  for (const [lv] of M.LEVELS){
    for (let i = 0; i < (s.n === 9 ? 12 : 25); i++){
      const P = M.makePuzzle(s.n, lv, M.rng(M.seedFrom('p' + s.n + lv + i)));
      checked++;
      if (M.countSolutions(P.puzzle, P.n, 2) !== 1) notUnique++;
      if (!validFull(P.answer, P.n)) notSolvable++;
      // the givens flag must match the puzzle exactly, or the UI lets you edit a clue
      if (P.givens.some((gv, k) => gv !== (P.puzzle[k] !== 0))) givensOff++;
      // every given must agree with the answer
      if (P.puzzle.some((v, k) => v && v !== P.answer[k])) mismatched++;
      const blanks = P.puzzle.filter(v => !v).length;
      if (blanks === 0) tooEasy++;
    }
  }
}
ok(notUnique === 0, checked + ' puzzles, every one with EXACTLY ONE answer (' + notUnique + ' bad)');
ok(notSolvable === 0, 'every stored answer is itself a valid complete grid');
ok(givensOff === 0, 'the givens flag always matches the puzzle, so a clue can never be edited');
ok(mismatched === 0, 'every clue agrees with the answer it was carved from');
ok(tooEasy === 0, 'no puzzle arrives already finished');
console.log('  (' + checked + ' puzzles generated and verified in ' + (Date.now()-t0) + 'ms)');

// ── 6. difficulty is real and ordered ────────────────────────
head('Difficulty');
for (const s of M.SIZES){
  const blanks = {};
  for (const [lv] of M.LEVELS){
    let total = 0, runs = s.n === 9 ? 6 : 12;
    for (let i = 0; i < runs; i++)
      total += M.makePuzzle(s.n, lv, M.rng(M.seedFrom('d' + s.n + lv + i))).puzzle.filter(v => !v).length;
    blanks[lv] = total / runs;
  }
  ok(blanks.gentle < blanks.standard && blanks.standard < blanks.tricky,
     s.n + '×' + s.n + ': gentle → standard → tricky leaves more blank each time (' +
     Object.values(blanks).map(v=>v.toFixed(1)).join(' → ') + ')');
  ok(blanks.gentle >= 3, s.n + '×' + s.n + ': even Gentle leaves something to do');
}

// ── 7. the daily puzzle ──────────────────────────────────────
head('Today is the same for everybody');
const d1 = M.makePuzzle(6, 'gentle', M.rng(M.seedFrom('sudoku:2026-09-01:6:gentle')));
const d2 = M.makePuzzle(6, 'gentle', M.rng(M.seedFrom('sudoku:2026-09-01:6:gentle')));
const d3 = M.makePuzzle(6, 'gentle', M.rng(M.seedFrom('sudoku:2026-09-02:6:gentle')));
ok(d1.puzzle.join() === d2.puzzle.join(), 'same date and settings, byte-identical puzzle');
ok(d1.puzzle.join() !== d3.puzzle.join(), 'a different date gives a different one');
ok(M.todayKey(new Date(2026,0,5)) === '2026-01-05', 'the date is local and padded');

// ── 8. speed, because this runs on a phone ───────────────────
head('Generation speed');
const t1 = Date.now();
for (let i = 0; i < 5; i++) M.makePuzzle(9, 'tricky', M.rng(M.seedFrom('speed' + i)));
const per = (Date.now() - t1) / 5;
ok(per < 3000, 'a hard 9×9 generates in ' + Math.round(per) + 'ms — fast enough not to feel stuck');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
