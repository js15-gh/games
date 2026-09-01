/* Tests for 2048.
 *
 * One rule carries the whole game and is easy to get subtly wrong: a tile made
 * by a merge cannot merge again on the same move. Without it, 2 2 2 2 collapses
 * to a single 8 instead of two 4s, and the game stops having anything to build.
 * Most of this file is that rule, from every direction.
 *
 *   node test_2048.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/2048.html', 'utf8');

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
  chunk('const SIZES = [', '\n];'), chunk('const sizeOf =', '\n'),
  fn('slideLine'), fn('readLine'), fn('writeLine'), fn('indexOfSlot'), fn('move'),
  chunk('const emptyCells =', '\n'), fn('addTile'), fn('canMove'),
  'module.exports = { SIZES, sizeOf, slideLine, readLine, writeLine, move, emptyCells, addTile, canMove };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);
const L = (a) => M.slideLine(a).line.join(',');
const G = (a) => M.slideLine(a).gained;

// ── 1. sliding one line ──────────────────────────────────────
head('Sliding a single line');
ok(L([2,0,0,0]) === '2,0,0,0', 'a lone tile already at the wall does not move');
ok(L([0,0,0,2]) === '2,0,0,0', 'a lone tile slides all the way');
ok(L([0,2,0,4]) === '2,4,0,0', 'gaps close up, order preserved');
ok(L([2,4,8,16]) === '2,4,8,16', 'a full line with nothing matching is unchanged');

head('Merging');
ok(L([2,2,0,0]) === '4,0,0,0', 'two matching tiles merge');
ok(G([2,2,0,0]) === 4, 'and score the merged value');
ok(L([2,0,2,0]) === '4,0,0,0', 'they merge across a gap');
ok(L([4,2,2,0]) === '4,4,0,0', 'the pair merges, the loner stays put');
ok(L([2,2,4,0]) === '4,4,0,0', 'and the same the other way round');
ok(L([2,4,4,0]) === '2,8,0,0', 'the merge happens where the pair is, not at the wall');

head('THE rule: a tile made this move cannot merge again');
ok(L([2,2,2,2]) === '4,4,0,0', 'four 2s make TWO 4s, not one 8');
ok(G([2,2,2,2]) === 8, 'and score 4 + 4');
ok(L([4,4,4,4]) === '8,8,0,0', 'four 4s make two 8s');
ok(L([2,2,4,4]) === '4,8,0,0', 'two separate pairs merge separately');
ok(L([4,4,2,2]) === '8,4,0,0', 'in either order');
ok(L([2,2,2,0]) === '4,2,0,0', 'three 2s: the first two merge and the third waits');
ok(G([2,2,2,0]) === 4, 'scoring only the one merge');
ok(L([2,2,2,2,2]) === '4,4,2,0,0', 'five 2s on a wider board: two merges and a leftover');
ok(L([8,8,8,8,8,8]) === '16,16,16,0,0,0', 'six 8s make three 16s');

head('Nothing is created or destroyed');
for (const line of [[2,2,2,2],[4,2,2,4],[2,4,2,4],[8,8,4,4],[2,2,4,8],[0,2,0,2]]){
  const before = line.reduce((a,b)=>a+b,0);
  const after = M.slideLine(line).line.reduce((a,b)=>a+b,0);
  ok(before === after, 'the total on the line is unchanged by [' + line + ']');
}

// ── 2. the four directions ───────────────────────────────────
head('Directions');
// 2 . . .      swipe right ->  . . . 2
const g4 = [2,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
ok(M.move(g4, 4, 'right').grid[3] === 2, 'right pushes to the right wall');
ok(M.move(g4, 4, 'down').grid[12] === 2, 'down pushes to the bottom');
ok(M.move(g4, 4, 'up').grid[0] === 2, 'up leaves a top-row tile where it is');
ok(!M.move(g4, 4, 'left').moved, 'and a move that changes nothing reports so');

// a column of matching tiles must merge vertically exactly like a row does
const col = [2,0,0,0, 2,0,0,0, 2,0,0,0, 2,0,0,0];
let r = M.move(col, 4, 'up');
ok(r.grid[0] === 4 && r.grid[4] === 4 && r.grid[8] === 0,
   'a column of four 2s makes two 4s going up');
r = M.move(col, 4, 'down');
ok(r.grid[12] === 4 && r.grid[8] === 4 && r.grid[4] === 0, 'and going down');

head('Rows do not leak into each other');
const two = [2,2,0,0, 2,2,0,0, 0,0,0,0, 0,0,0,0];
r = M.move(two, 4, 'left');
ok(r.grid[0] === 4 && r.grid[4] === 4 && r.gained === 8,
   'two identical rows each merge on their own');
ok(r.grid.filter(v=>v).length === 2, 'and produce exactly two tiles');

head('Merged slots are reported for the animation');
r = M.move([2,2,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 4, 'left');
ok(r.merged.length === 1 && r.merged[0] === 0, 'the merged slot is where the new tile landed');
r = M.move([2,2,2,2, 0,0,0,0, 0,0,0,0, 0,0,0,0], 4, 'left');
ok(r.merged.length === 2 && r.merged.join() === '0,1', 'both merged slots reported');
r = M.move([2,2,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 4, 'right');
ok(r.merged.join() === '3', 'and in the right place going the other way');

// ── 3. when the game is over ─────────────────────────────────
head('Is there a move left');
ok(M.canMove([2,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 4), 'an empty square is always a move');
const checker = [2,4,2,4, 4,2,4,2, 2,4,2,4, 4,2,4,2];
ok(!M.canMove(checker, 4), 'a full board with no two neighbours alike is the end');
const nearly = [2,4,2,4, 4,2,4,2, 2,4,2,4, 4,2,4,4];
ok(M.canMove(nearly, 4), 'one matching pair anywhere means the game continues');
const vert = [2,4,2,4, 2,2,4,2, 4,4,2,4, 2,2,4,2];
ok(M.canMove(vert, 4), 'a vertical pair counts too');

// ── 4. new tiles ─────────────────────────────────────────────
head('The tile that appears after every move');
let twos = 0, fours = 0, other = 0;
for (let i = 0; i < 4000; i++){
  const g = new Array(16).fill(0);
  const at = M.addTile(g);
  const v = g[at];
  if (v === 2) twos++; else if (v === 4) fours++; else other++;
}
ok(other === 0, 'a new tile is always a 2 or a 4');
ok(fours > 200 && fours < 700, 'roughly one in ten is a 4 (' + fours + ' of 4000)');
const full = new Array(16).fill(2);
ok(M.addTile(full) === null, 'nothing is placed on a full board');
const oneGap = new Array(16).fill(2); oneGap[7] = 0;
ok(M.addTile(oneGap) === 7, 'the single gap is the only place it can go');

const spread = new Array(16).fill(0);
for (let i = 0; i < 8000; i++){ const g = new Array(16).fill(0); spread[M.addTile(g)]++; }
ok(Math.min(...spread) > 300, 'new tiles are spread over the whole board (' +
   Math.min(...spread) + '–' + Math.max(...spread) + ')');

// ── 5. long games ────────────────────────────────────────────
head('Two hundred games played out');
let broke = 0, badSum = 0, badValue = 0, reached = {}, maxSeen = 0;
for (let s = 0; s < 200; s++){
  let g = new Array(16).fill(0);
  M.addTile(g); M.addTile(g);
  let guard = 0;
  while (M.canMove(g, 4) && guard++ < 3000){
    const dirs = ['left','up','right','down'];
    let did = false;
    for (const d of dirs){
      const r = M.move(g, 4, d);
      if (!r.moved) continue;
      // every value on the board must remain a power of two
      if (r.grid.some(v => v && (v & (v-1)))) badValue++;
      g = r.grid; M.addTile(g); did = true; break;
    }
    if (!did) break;
  }
  if (guard >= 3000) broke++;
  const top = Math.max(...g);
  maxSeen = Math.max(maxSeen, top);
  reached[top] = (reached[top]||0) + 1;
  if (g.some(v => v && (v & (v-1)))) badSum++;
}
ok(broke === 0, 'every game terminated (' + broke + ' ran away)');
ok(badValue === 0, 'every tile on every board was a power of two');
ok(badSum === 0, 'and still was at the end');
ok(maxSeen >= 64, 'a fixed left-up-right-down strategy still builds real tiles (best ' + maxSeen + ')');

// ── 6. board sizes ───────────────────────────────────────────
head('Board sizes');
ok(M.SIZES.length === 3, 'three boards');
ok(M.SIZES.every(s => s.n >= 3 && s.target >= 512), 'each has a size and a target');
ok(M.sizeOf(99).n === 4, 'an unknown size falls back to the classic 4×4');
for (const s of M.SIZES){
  const g = new Array(s.n*s.n).fill(0);
  g[0] = 2; g[1] = 2;
  const rr = M.move(g, s.n, 'left');
  ok(rr.grid[0] === 4 && rr.gained === 4, s.name + ': merging works at this size');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
