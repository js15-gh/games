/* Tests for Cipher.
 *
 * Lifts the real functions out of the page so the test tracks what ships.
 *
 *   node test_cipher.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/cipher-online.html', 'utf8');

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
  chunk('const KEYWORDS = [', '\n];'),
  'const LIMIT = 2;',
  "const other = (t) => t === 'A' ? 'B' : 'A';",
  chunk('const sameCode =', '\n'),
  fn('dealWords'), fn('newCode'), fn('dealRound'), fn('interceptionOpen'), fn('settle'),
  'module.exports = { KEYWORDS, LIMIT, other, sameCode, dealWords, newCode, dealRound, interceptionOpen, settle };'
].join('\n');

const mod = { exports:{} };
new Function('module', code)(mod);
const { KEYWORDS, sameCode, dealWords, newCode, dealRound, interceptionOpen, settle } = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ── 1. keywords ──────────────────────────────────────────────
head('Keywords');
ok(KEYWORDS.length >= 100, 'at least 100 keywords (' + KEYWORDS.length + ')');
ok(new Set(KEYWORDS.map(w=>w.toLowerCase())).size === KEYWORDS.length, 'no duplicates');
ok(KEYWORDS.every(w => !/\s/.test(w)), 'each keyword is a single word');
ok(KEYWORDS.every(w => w.length <= 12), 'keywords fit on a phone row');

head('Dealing keywords');
let overlap = 0, wrongSize = 0, seen = new Set();
for (let i = 0; i < 800; i++){
  const g = dealWords({});
  if (g.words.A.length !== 4 || g.words.B.length !== 4) wrongSize++;
  const all = g.words.A.concat(g.words.B);
  if (new Set(all).size !== 8) overlap++;
  all.forEach(w=>seen.add(w));
}
ok(wrongSize === 0, 'each side always gets exactly four keywords');
ok(overlap === 0, 'the two teams never share a keyword (800 deals)');
ok(seen.size === KEYWORDS.length, 'every keyword can come up');

// ── 2. codes ─────────────────────────────────────────────────
head('Codes');
let bad = 0, dist = {};
for (let i = 0; i < 5000; i++){
  const c = newCode();
  if (c.length !== 3) bad++;
  if (new Set(c).size !== 3) bad++;
  if (c.some(d => d < 1 || d > 4)) bad++;
  dist[c.join('')] = (dist[c.join('')]||0) + 1;
}
ok(bad === 0, 'every code is three distinct digits from 1 to 4');
ok(Object.keys(dist).length === 24, 'all 24 permutations appear (' + Object.keys(dist).length + ')');
const counts = Object.values(dist);
ok(Math.min(...counts) > 5000/24*0.6, 'the codes are not obviously biased');

head('Comparing codes');
ok(sameCode([1,2,3],[1,2,3]), 'identical codes match');
ok(!sameCode([1,2,3],[3,2,1]), 'order matters');
ok(!sameCode(null,[1,2,3]) && !sameCode([1,2,3],null), 'a missing guess never matches');
ok(!sameCode([1,2],[1,2,3]), 'a short guess never matches');

// ── 3. interception opens late ───────────────────────────────
head('When interception opens');
ok(!interceptionOpen({ history:[], turn:'A' }), 'nobody can be intercepted on their first transmission');
ok(!interceptionOpen({ history:[{team:'B'}], turn:'A' }),
   'hearing the OTHER team once does not open interception on you');
ok(interceptionOpen({ history:[{team:'A'},{team:'B'}], turn:'A' }),
   'once you have transmitted once, you can be read');

// ── 4. tokens and winning ────────────────────────────────────
head('Tokens');
function play(turn, code, own, opp, tokens){
  const g = { teams:{A:['a1','a2'],B:['b1','b2']}, names:{A:'Team A',B:'Team B'},
              turn, round:1, encryptor:'a1', code, clues:['x','y','z'],
              ownGuess:own, oppGuess:opp, history:[], winner:null,
              tokens: tokens || { A:{mis:0,inter:0}, B:{mis:0,inter:0} } };
  return settle(g);
}
let r = play('A', [1,2,3], [1,2,3], [4,3,2]);
ok(r.tokens.A.mis === 0 && r.tokens.B.inter === 0, 'decoding your own code costs nothing and gives nothing away');

r = play('A', [1,2,3], [3,2,1], [4,3,2]);
ok(r.tokens.A.mis === 1, 'failing to decode your own code is a miscommunication');

r = play('A', [1,2,3], [1,2,3], [1,2,3]);
ok(r.tokens.B.inter === 1 && r.tokens.A.mis === 0,
   'being intercepted costs the other side nothing but hands over a green mark');

r = play('A', [1,2,3], [3,2,1], [1,2,3]);
ok(r.tokens.A.mis === 1 && r.tokens.B.inter === 1, 'both can happen in the same round');

r = play('A', [1,2,3], [1,2,3], null);
ok(r.tokens.B.inter === 0, 'a round with no interception attempt cannot be intercepted');

head('Endings');
r = play('A', [1,2,3], [1,2,3], [1,2,3], { A:{mis:0,inter:0}, B:{mis:0,inter:1} });
ok(r.winner === 'B', 'a second interception wins it');

r = play('A', [1,2,3], [3,2,1], [4,3,2], { A:{mis:1,inter:0}, B:{mis:0,inter:0} });
ok(r.winner === 'B', 'a second miscommunication loses it');

r = play('A', [1,2,3], [3,2,1], [1,2,3], { A:{mis:1,inter:0}, B:{mis:0,inter:1} });
ok(r.winner === 'B', 'both endings at once still resolves to one winner');

r = play('A', [1,2,3], [1,2,3], [4,3,2], { A:{mis:1,inter:1}, B:{mis:1,inter:1} });
ok(r.winner === null, 'one of each on both sides is not an ending');

head('The round log');
r = play('A', [1,2,3], [3,2,1], [1,2,3]);
const h = r.history[0];
ok(h.team === 'A' && h.code.join() === '1,2,3' && h.clues.length === 3,
   'the log records the team, the code and the clues');
ok(h.decoded === false && h.intercepted === true, 'and both outcomes');
ok(h.code !== r.code, 'the log holds copies, not references the next round will overwrite');

// ── 5. rotation ──────────────────────────────────────────────
head('Rotation');
const T = { A:['Asha','Bilal','Chetan'], B:['Devi','Esha'] };
let g = { players:[], teams:T, turn:'A', round:0, history:[], tokens:{A:{mis:0,inter:0},B:{mis:0,inter:0}} };
const byTeam = { A:[], B:[] };
for (let r2 = 1; r2 <= 12; r2++){
  g.round = r2; g.turn = r2 % 2 ? 'A' : 'B';
  g = dealRound(g);
  byTeam[g.turn].push(g.encryptor);
  ok(T[g.turn].includes(g.encryptor), 'round ' + r2 + ': the sender is on the transmitting team');
}
ok(byTeam.A.join() === 'Asha,Bilal,Chetan,Asha,Bilal,Chetan', 'a three-person team rotates evenly');
ok(byTeam.B.join() === 'Devi,Esha,Devi,Esha,Devi,Esha', 'so does a two-person one');
ok(g.clues.every(c => c === '') && g.ownGuess === null && g.oppGuess === null,
   'a new round clears the clues and both guesses');

// ── 6. the keyword leak this was patched for ─────────────────
head('Secrecy');
ok(/myTeam === h\.team/.test(src),
   'the result screen only maps clues to keywords for the team that sent them');
ok(/keywords stay secret until/.test(src),
   'and tells the other side why they are not seeing it');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
