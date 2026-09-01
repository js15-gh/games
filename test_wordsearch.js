/* Tests for Word Search.
 *
 * The one that matters: a grid whose words all run across and down is not a
 * word search, it is a list. Placement used to pick a start square and then a
 * direction, which is quietly biased — a square near an edge only fits
 * straight lines — and diagonals came out at about one word in six. An
 * eight-word grid would then average barely one diagonal, which reads as none.
 *
 *   node test_wordsearch.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/word-search.html', 'utf8');
const pack = JSON.parse(fs.readFileSync(__dirname + '/content/connections.json', 'utf8'));

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
  chunk('const EASY_DIRS', '\n'), chunk('const ALL_DIRS', '\n'),
  chunk('const LEVELS = [', '\n];'), chunk('const levelOf =', '\n'),
  chunk('const clean =', '\n'), fn('usableWords'),
  fn('seedFrom'), fn('rng'), chunk('const shuffled =', '\n};'),
  fn('buildGrid'), fn('lineBetween'),
  'module.exports = { EASY_DIRS, ALL_DIRS, LEVELS, levelOf, clean, usableWords,' +
  ' seedFrom, rng, shuffled, buildGrid, lineBetween };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

const WORDS = ['MANGO','GUAVA','LYCHEE','PAPAYA','JACKFRUIT','SAPOTA','BANYAN','NEEM'];

function survey(dirs, size, n){
  const dirCount = {};
  let grids = 0, noDiag = 0, misplaced = 0, empty = 0, dupWord = 0, outOfBounds = 0;
  for (let i = 0; i < n; i++){
    const g = M.buildGrid(WORDS, size, dirs, M.rng(M.seedFrom('s' + size + i)));
    if (!g) continue;
    grids++;
    let diagHere = 0;
    for (const p of g.placed){
      const a = p.path[0], b = p.path[1];
      const dr = Math.floor(b/size) - Math.floor(a/size), dc = (b%size) - (a%size);
      dirCount[dr + ',' + dc] = (dirCount[dr + ',' + dc] || 0) + 1;
      if (dr && dc) diagHere++;
      if (p.path.map(k => g.grid[k]).join('') !== p.word) misplaced++;
      if (p.path.some(k => k < 0 || k >= size*size)) outOfBounds++;
    }
    if (!diagHere) noDiag++;
    if (g.grid.some(c => !c)) empty++;
    if (new Set(g.placed.map(p=>p.word)).size !== g.placed.length) dupWord++;
  }
  const total = Object.values(dirCount).reduce((a,b)=>a+b,0);
  const diag = Object.keys(dirCount)
    .filter(k => { const [a,b] = k.split(',').map(Number); return a && b; })
    .reduce((s,k) => s + dirCount[k], 0);
  return { grids, noDiag, misplaced, empty, dupWord, outOfBounds,
           dirs: Object.keys(dirCount).length, diagShare: diag/total, dirCount };
}

head('Direction sets');
ok(M.ALL_DIRS.length === 8, 'eight directions when diagonals are allowed');
ok(M.EASY_DIRS.length === 2, 'two on Easy');
ok(M.ALL_DIRS.filter(([a,b]) => a && b).length === 4, 'four of the eight are diagonal');
ok(M.EASY_DIRS.every(([a,b]) => !(a && b)), 'none of the Easy ones are');

head('Standard, 300 grids');
let s = survey(M.ALL_DIRS, 11, 300);
ok(s.grids === 300, 'every grid built');
ok(s.dirs === 8, 'all eight directions get used (' + s.dirs + ')');
ok(s.diagShare > 0.35, 'diagonals are a real share of the words, not a rarity: ' +
   Math.round(s.diagShare*100) + '%');
ok(s.noDiag === 0, 'no grid comes out with zero diagonal words (' + s.noDiag + ')');
ok(s.misplaced === 0, 'every word reads correctly along its own path');
ok(s.outOfBounds === 0, 'no path leaves the grid');
ok(s.empty === 0, 'no square is left blank');
ok(s.dupWord === 0, 'no word is placed twice');
const counts = Object.values(s.dirCount);
ok(Math.min(...counts) > Math.max(...counts) * 0.6,
   'no single direction dominates (' + Math.min(...counts) + '–' + Math.max(...counts) + ')');

head('Tricky, 300 grids on a bigger board');
s = survey(M.ALL_DIRS, 13, 300);
ok(s.diagShare > 0.35, 'still a real share of diagonals: ' + Math.round(s.diagShare*100) + '%');
ok(s.noDiag === 0 && s.misplaced === 0 && s.empty === 0, 'and still sound');

head('Easy stays across and down');
s = survey(M.EASY_DIRS, 9, 300);
ok(s.diagShare === 0, 'not one diagonal word on Easy');
ok(s.dirs === 2, 'only two directions used — no reversed words either');
ok(s.misplaced === 0 && s.empty === 0, 'and the grids are sound');

head('Reading a selection');
ok(M.lineBetween(0, 4, 9).join() === '0,1,2,3,4', 'across');
ok(M.lineBetween(0, 27, 9).join() === '0,9,18,27', 'down');
ok(M.lineBetween(0, 20, 9).join() === '0,10,20', 'diagonal down-right');
ok(M.lineBetween(2, 18, 9).join() === '2,10,18', 'diagonal down-left');
ok(M.lineBetween(20, 0, 9).join() === '20,10,0', 'and backwards along one');
ok(M.lineBetween(0, 10, 9) !== null, 'a knight-ish step that happens to be diagonal is fine');
ok(M.lineBetween(0, 11, 9) === null, 'but a crooked pair is refused');
ok(M.lineBetween(0, 0, 9).join() === '0', 'a square selects itself');

head('Multi-word entries never reach the grid');
const all = pack.categories.flatMap(c => M.usableWords(c, 13));
ok(all.every(w => /^[A-Z]+$/.test(w)), 'every usable word is plain letters');
ok(!pack.categories.some(c => M.usableWords(c, 13).includes('BANANALEAF')),
   '"Banana leaf" is dropped rather than squashed into BANANALEAF');

head('Every level can find enough themes');
for (const L of M.LEVELS){
  const need = Math.ceil(L.count / (L.mix || 1));
  const themes = pack.categories.filter(c => M.usableWords(c, L.size).length >= need);
  ok(themes.length >= 10, L.name + ' has ' + themes.length + ' themes to draw on');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
