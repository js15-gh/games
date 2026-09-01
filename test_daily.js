/* Tests for the Daily Puzzle.
 *
 * The generator is the risky part: a puzzle where a word honestly belongs to
 * two of the day's groups is unsolvable-by-reasoning, and it would ship to
 * everybody on the same day. So this checks every date for the next four
 * years.
 *
 *   node test_daily.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/daily-puzzle.html', 'utf8');
const pack = JSON.parse(fs.readFileSync(__dirname + '/content/connections.json', 'utf8'));

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
const mod = { exports:{} };
new Function('module', [
  "const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g,'');",
  fn('todayKey'), fn('seedFrom'), fn('rng'), fn('shuffled'), fn('buildPuzzle'),
  'module.exports = { todayKey, seedFrom, rng, shuffled, buildPuzzle, norm };'
].join('\n'))(mod);
const { todayKey, seedFrom, rng, shuffled, buildPuzzle, norm } = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ── 1. the pack ──────────────────────────────────────────────
head('The pack');
const cats = pack.categories;
ok(cats.length >= 30, 'at least 30 categories (' + cats.length + ')');
ok(new Set(cats.map(c=>c.id)).size === cats.length, 'category ids are unique');
ok(new Set(cats.map(c=>c.name)).size === cats.length, 'category names are unique');
ok(cats.every(c => c.items.length >= 6), 'every category has at least six members');
ok(cats.every(c => new Set(c.items.map(norm)).size === c.items.length),
   'no category repeats a member');
ok(cats.every(c => c.items.every(w => w.length <= 20)), 'members fit in a tile');
ok(pack.age_rating === 'everyone', 'the pack declares an age rating');

// how many categories does a word appear in? Overlap is allowed in the pack —
// the generator's job is to keep two overlapping ones out of the same puzzle —
// but a word in many categories starves the generator.
const where = {};
for (const c of cats) for (const w of c.items) (where[norm(w)] = where[norm(w)] || []).push(c.id);
const shared = Object.entries(where).filter(([,v]) => v.length > 1);
ok(shared.every(([,v]) => v.length <= 3),
   'no word sits in more than three categories: ' +
   shared.filter(([,v])=>v.length>3).map(([w])=>w).join(', '));

// ── 2. determinism ───────────────────────────────────────────
head('Same day, same puzzle');
const a = buildPuzzle(cats, '2026-09-01');
const b = buildPuzzle(cats, '2026-09-01');
ok(JSON.stringify(a) === JSON.stringify(b), 'the same date builds a byte-identical puzzle');
const c = buildPuzzle(cats, '2026-09-02');
ok(JSON.stringify(a) !== JSON.stringify(c), 'a different date builds a different one');

head('Local dates, not UTC');
ok(todayKey(new Date(2026, 0, 5)) === '2026-01-05', 'months and days are padded');
ok(todayKey(new Date(2026, 11, 31)) === '2026-12-31', 'December is 12, not 11');

// ── 3. every puzzle for four years ───────────────────────────
head('Four years of puzzles');
let bad = 0, unfair = 0, wrongShape = 0, dupTiles = 0;
const seen = new Set();
const d = new Date(2026, 0, 1);
for (let i = 0; i < 365 * 4; i++){
  const key = todayKey(d);
  const p = buildPuzzle(cats, key);
  if (!p){ bad++; d.setDate(d.getDate()+1); continue; }

  if (p.groups.length !== 4 || p.tiles.length !== 16) wrongShape++;
  if (p.groups.some(g => g.items.length !== 4)) wrongShape++;

  // every tile belongs to exactly one of the day's groups, and no word twice
  const words = p.tiles.map(t => norm(t.w));
  if (new Set(words).size !== 16) dupTiles++;

  // THE important one: no word may honestly fit two of today's groups, which
  // means checking the groups' FULL member lists, not just the four shown
  const full = p.groups.map(g => new Set(cats.find(c=>c.id===g.id).items.map(norm)));
  for (let x = 0; x < 4; x++)
    for (let y = x+1; y < 4; y++)
      for (const w of full[x]) if (full[y].has(w)) unfair++;

  seen.add(p.groups.map(g=>g.id).sort().join('|'));
  d.setDate(d.getDate()+1);
}
ok(bad === 0, 'a puzzle can be built for every day (' + bad + ' failures)');
ok(wrongShape === 0, 'every puzzle is four groups of four, sixteen tiles');
ok(dupTiles === 0, 'no puzzle shows the same word twice');
ok(unfair === 0, 'no puzzle contains two groups that share any member at all (' + unfair + ')');
ok(seen.size > 200, 'the four category sets vary widely (' + seen.size + ' distinct combinations)');

// ── 4. the generator's guard actually does something ─────────
head('The overlap guard');
const rigged = [
  { id:'a', name:'A', items:['Mango','Guava','Lychee','Papaya','Jackfruit','Sapota'] },
  { id:'b', name:'B', items:['Mango','Neem','Peepal','Banyan','Gulmohar','Deodar'] },  // shares Mango
  { id:'c', name:'C', items:['Ruby','Emerald','Pearl','Topaz','Opal','Garnet'] },
  { id:'d', name:'D', items:['Gold','Silver','Copper','Iron','Brass','Bronze'] },
  { id:'e', name:'E', items:['Ganga','Yamuna','Kaveri','Narmada','Krishna','Sutlej'] },
];
let overlapEver = false;
for (let i = 0; i < 400; i++){
  const p = buildPuzzle(rigged, 'day-' + i);
  if (!p) continue;
  const ids = p.groups.map(g=>g.id);
  if (ids.includes('a') && ids.includes('b')) overlapEver = true;
}
ok(!overlapEver, 'two categories sharing a word are never put in the same puzzle');

const tooFew = buildPuzzle(rigged.slice(0,3), '2026-09-01');
ok(tooFew === null, 'with fewer than four usable categories it returns null rather than a broken puzzle');

// ── 5. shuffling ─────────────────────────────────────────────
head('Shuffle');
const r = rng(seedFrom('x'));
const orig = [1,2,3,4,5,6,7,8];
const s = shuffled(orig, r);
ok(orig.join() === '1,2,3,4,5,6,7,8', 'shuffled() does not mutate its input');
ok(s.slice().sort((x,y)=>x-y).join() === orig.join(), 'and keeps every element');

head('The PRNG');
const rr = rng(seedFrom('2026-09-01'));
const vals = Array.from({length:2000}, () => rr());
ok(vals.every(v => v >= 0 && v < 1), 'every value is in [0,1)');
const buckets = [0,0,0,0];
vals.forEach(v => buckets[Math.floor(v*4)]++);
ok(buckets.every(n => n > 350), 'and roughly uniform: ' + buckets.join('/'));
ok(rng(seedFrom('a'))() !== rng(seedFrom('b'))(), 'different seeds diverge immediately');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
