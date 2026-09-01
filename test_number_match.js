/* Tests for Number Match.
 *
 * The rule that carries the whole game is that CLEARED SQUARES DO NOT BLOCK:
 * two numbers are neighbours if nothing uncleared sits between them along a
 * row, a column, a diagonal, or in plain reading order. Get that wrong and the
 * board seizes up after a dozen pairs. Most of this file is about that.
 *
 *   node test_number_match.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/number-match.html', 'utf8');

function fn(name){
  const a = src.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('no ' + name);
  let d = 0;
  for (let j = src.indexOf('{', a); j < src.length; j++){
    if (src[j] === '{') d++;
    else if (src[j] === '}'){ d--; if (!d) return src.slice(a, j + 1); }
  }
}
function chunk(a, b){ const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i) + b.length); }

const mod = { exports:{} };
new Function('module', [
  'const COLS = 9;',
  'let cells = [], gone = [];',
  chunk('const alive =', '\n'),
  chunk('const rowOf =', '\n'),
  fn('neighbours'),
  chunk('const pairs =', '\n'),
  fn('anyMove'), fn('dropEmptyRows'),
  chunk('const LEVELS = [', '\n];'),
  'module.exports = { COLS, LEVELS, neighbours, pairs, anyMove, dropEmptyRows,' +
  ' set:(c,g)=>{ cells=c; gone=g||c.map(()=>false); }, get:()=>({cells,gone}) };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ── 1. what counts as a pair ─────────────────────────────────
head('What pairs');
M.set([7,3,5,5,9,1,2,8,4]);
ok(M.pairs(0,1), '7 and 3 make ten');
ok(M.pairs(2,3), 'two 5s match');
ok(M.pairs(4,5), '9 and 1 make ten');
ok(!M.pairs(0,2), '7 and 5 do neither');
ok(M.pairs(2,3) && M.pairs(4,5), 'both rules work side by side');
// 5+5 is both a match AND a ten, which must not double-count or misbehave
M.set([5,5]);
ok(M.pairs(0,1), 'a pair of 5s is fine under either rule');

// ── 2. neighbours, the important part ────────────────────────
head('Neighbours on a full board');
M.set(Array.from({length:27},(_,i)=>i+1));       // 3 rows of 9, all distinct
let n = M.neighbours(0);
ok(n.includes(1), 'the square to the right');
ok(n.includes(9), 'the square below');
ok(n.includes(10), 'the square diagonally below-right');
ok(!n.includes(2), 'not the one two along — only the first live square counts');
n = M.neighbours(10);
ok([1,9,11,19,0,2,18,20].every(k => n.includes(k)),
   'a middle square has all eight around it');
ok(n.length === 8, 'and exactly eight (' + n.length + ')');

head('Reading order wraps the end of a row');
M.set(Array.from({length:27},(_,i)=>i+1));
ok(M.neighbours(8).includes(9), 'the last of a row is next to the first of the following one');
ok(M.neighbours(9).includes(8), 'and the other way round');

head('Cleared squares do not block — the rule the game rests on');
// 7 . . 3   with the middle two cleared: 7 and 3 must still be neighbours
M.set([7,1,1,3,2,2,2,2,2], [false,true,true,false,false,false,false,false,false]);
ok(M.neighbours(0).includes(3), 'a gap of cleared squares is seen through along a row');
ok(M.pairs(0,3), 'and they pair, so the move is legal');

// same down a column
const col = new Array(27).fill(2);
col[0] = 7; col[18] = 3;
const goneCol = new Array(27).fill(false);
goneCol[9] = true;
M.set(col, goneCol);
ok(M.neighbours(0).includes(18), 'cleared squares are seen through down a column too');

// and along a diagonal
const dia = new Array(27).fill(2);
dia[0] = 7; dia[20] = 3;
const goneDia = new Array(27).fill(false);
goneDia[10] = true;
M.set(dia, goneDia);
ok(M.neighbours(0).includes(20), 'and along a diagonal');

head('A live square DOES block');
M.set([7,4,4,3,2,2,2,2,2]);
ok(!M.neighbours(0).includes(3), 'an uncleared square in between stops the line');

head('A cleared square is nobody’s neighbour');
M.set([7,3,5,5,9,1,2,8,4], [false,true,false,false,false,false,false,false,false]);
ok(!M.neighbours(0).includes(1), 'a cleared square is never returned as a neighbour');
ok(M.neighbours(0).includes(2), 'and the game looks past it to the next live one');

// ── 3. detecting a dead board ────────────────────────────────
head('Is there a move left');
M.set([1,1]);
ok(!!M.anyMove(), 'two matching numbers side by side is a move');
M.set([1,9,4,5,7,8,3,2,4]);          // 1 and 9 sit side by side and make ten
const mv = M.anyMove();
ok(!!mv && M.pairs(mv[0], mv[1]) && M.neighbours(mv[0]).includes(mv[1]),
   'anyMove returns a pair that is both legal and adjacent');
M.set([1,2,4,5,7,8,1,2,4]);
ok(M.anyMove() === null,
   'and reports none on a board whose only matches are too far apart — 1s at 0 and 6, 4s at 2 and 8');
M.set([1,3,1,3,1,3,1,3,1]);   // nothing matches, nothing makes ten
ok(M.anyMove() === null, 'a board with no pair at all reports none');
M.set([1,1], [true,true]);
ok(M.anyMove() === null, 'a fully cleared board has no moves');

// ── 4. empty rows are removed ────────────────────────────────
head('Empty rows drop out');
const two = Array.from({length:18},(_,i)=>i+1);
const g2 = two.map((_,i)=> i < 9);            // first row all cleared
M.set(two, g2);
M.dropEmptyRows();
let st = M.get();
ok(st.cells.length === 9, 'the empty row is gone (' + st.cells.length + ' left)');
ok(st.cells[0] === 10, 'and the survivors kept their values in order');
ok(st.gone.every(v => !v), 'nothing that survived is marked cleared');

const three = Array.from({length:27},(_,i)=>i+1);
const g3 = three.map((_,i)=> i >= 9 && i < 18);   // middle row cleared
M.set(three, g3);
M.dropEmptyRows();
st = M.get();
ok(st.cells.length === 18 && st.cells[9] === 19, 'a middle empty row drops and the rest closes up');

const partial = Array.from({length:18},(_,i)=>i+1);
const gp = partial.map((_,i)=> i < 8);          // row nearly, but not fully, cleared
M.set(partial, gp);
M.dropEmptyRows();
ok(M.get().cells.length === 18, 'a row with one survivor is kept');

// ── 5. levels ────────────────────────────────────────────────
head('Levels');
ok(M.LEVELS.length === 3, 'three sizes');
ok(M.LEVELS.every(l => l.rows >= 3 && l.adds >= 1), 'each has rows and at least one add');
ok(M.LEVELS[0].rows * M.COLS === 27, 'the short board is 27 numbers');
ok(M.LEVELS.every((l,i,a) => i === 0 || l.rows > a[i-1].rows), 'the sizes actually increase');

// ── 6. a played-out game ─────────────────────────────────────
head('Playing a board out');
/* Plays greedily to completion, which is not how a person plays but does
   exercise the neighbour logic hard as the board empties. */
function playOut(seed){
  let c = [], rnd = seed;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
  c = Array.from({length:45},()=> 1 + Math.floor(rand()*9));
  let g = c.map(()=>false);
  M.set(c, g);
  let steps = 0, illegal = 0;
  while (steps++ < 400){
    const m = M.anyMove();
    if (!m) break;
    const [a,b] = m;
    if (!M.pairs(a,b) || !M.neighbours(a).includes(b)) illegal++;
    const st = M.get();
    st.gone[a] = true; st.gone[b] = true;
    M.dropEmptyRows();
  }
  return { illegal, left: M.get().gone.filter(v=>!v).length, steps };
}
let anyIllegal = 0, totalLeft = 0, worst = 0;
for (let s = 1; s <= 40; s++){
  const r = playOut(s);
  anyIllegal += r.illegal;
  totalLeft += r.left;
  worst = Math.max(worst, r.left);
}
const avgLeft = totalLeft / 40;
ok(anyIllegal === 0, 'over 40 played-out boards, anyMove never proposed an illegal pair');
/* Greedy play with no adds is NOT expected to clear the board — that is what
   the adds are for, and a solver that cleared it every time would mean the
   game had no decisions in it. What matters is that it makes real progress
   rather than seizing up early, which is what the see-through rule buys. */
ok(avgLeft < 20, 'greedy play with no adds clears most of a 45-square board, ' +
   'leaving ' + avgLeft.toFixed(1) + ' on average (worst ' + worst + ')');
ok(worst < 45, 'and never seizes up on the opening position');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
