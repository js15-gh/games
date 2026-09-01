/* Tests for Clover.
 *
 * Lifts the real functions out of the page so the test tracks what ships.
 *
 *   node test_clover.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/clover-online.html', 'utf8');

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
  chunk('const WORDS = [', '\n];'),
  fn('shuffle'), fn('dealPuzzle'), fn('consensus'), fn('reveal'),
  'module.exports = { WORDS, shuffle, dealPuzzle, consensus, reveal };'
].join('\n');

const mod = { exports:{} };
new Function('module', code)(mod);
const { WORDS, shuffle, dealPuzzle, consensus, reveal } = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ── 1. words ─────────────────────────────────────────────────
head('Words');
ok(WORDS.length >= 100, 'at least 100 words (' + WORDS.length + ')');
ok(new Set(WORDS.map(w=>w.toLowerCase())).size === WORDS.length, 'no duplicates');
ok(WORDS.every(w => !/\s/.test(w)), 'every word is a single word');
ok(WORDS.every(w => w.length <= 12), 'words fit inside a pair chip');
// the deepest board plus decoys needs 16 distinct words at once
ok(WORDS.length >= 16, 'enough words for the largest puzzle');

// ── 2. shuffling ─────────────────────────────────────────────
head('Shuffle');
const orig = [1,2,3,4,5,6,7,8];
const s1 = shuffle(orig);
ok(orig.join() === '1,2,3,4,5,6,7,8', 'shuffle does not mutate its input');
ok(s1.slice().sort((a,b)=>a-b).join() === orig.join(), 'shuffle keeps every element');
let moved = 0;
for (let i = 0; i < 200; i++) if (shuffle(orig).join() !== orig.join()) moved++;
ok(moved > 190, 'shuffle actually shuffles');

// ── 3. dealing ───────────────────────────────────────────────
head('Dealing a puzzle');
const P = ['Asha','Bilal','Chetan'];
for (const [boards, decoys] of [[3,1],[4,1],[4,2],[5,3]]){
  const g = dealPuzzle({ players:P, round:1, boards, decoys });
  const all = g.pairs.concat(g.decoyPairs);
  const words = all.flatMap(p=>[p.a,p.b]);
  ok(g.pairs.length === boards, boards + '/' + decoys + ': ' + boards + ' clued pairs');
  ok(g.decoyPairs.length === decoys, boards + '/' + decoys + ': ' + decoys + ' decoy pairs');
  ok(new Set(words).size === words.length,
     boards + '/' + decoys + ': no word appears twice in one puzzle');
  ok(words.every(w => WORDS.includes(w)), boards + '/' + decoys + ': words come from the list');
  ok(new Set(all.map(p=>p.id)).size === all.length,
     boards + '/' + decoys + ': every pair has a unique id');
  ok(g.clues.length === boards && g.clues.every(c => c === ''),
     boards + '/' + decoys + ': clues start empty');
}
let g = dealPuzzle({ players:P, round:1, boards:4, decoys:1,
                     picks:{Asha:{}}, submitted:true, correct:{0:true}, order:[9] });
ok(Object.keys(g.picks).length === 0 && g.correct === null && g.order.length === 0,
   'a new puzzle clears the previous answers and the shuffled order');
ok(g.phase === 'write', 'and starts in the writing phase');

head('Whose turn it is');
const setters = [];
for (let r = 1; r <= 6; r++) setters.push(dealPuzzle({ players:P, round:r, boards:4, decoys:1 }).setter);
ok(setters.join() === 'Asha,Bilal,Chetan,Asha,Bilal,Chetan', 'the writer rotates through the table');

// ── 4. consensus ─────────────────────────────────────────────
head('Consensus');
let c = consensus({ clues:['x','y'], picks:{ A:{0:5,1:6}, B:{0:5,1:6} } });
ok(c[0] === 5 && c[1] === 6, 'unanimous solvers give their answer');

c = consensus({ clues:['x'], picks:{ A:{0:5}, B:{0:5}, C:{0:7} } });
ok(c[0] === 5, 'the majority carries it — one distracted player cannot sink the round');

c = consensus({ clues:['x'], picks:{ A:{0:5}, B:{0:7} } });
ok(c[0] === null, 'a dead tie is nobody’s answer');

c = consensus({ clues:['x'], picks:{ A:{0:5}, B:{0:7}, C:{0:9} } });
ok(c[0] === null, 'a three-way split is a tie too');

c = consensus({ clues:['x','y'], picks:{ A:{0:5} } });
ok(c[0] === 5 && c[1] === null, 'a clue nobody answered has no answer');

c = consensus({ clues:['x'], picks:{} });
ok(c[0] === null, 'no solvers at all does not crash');

// ── 5. scoring ───────────────────────────────────────────────
head('Scoring a puzzle');
function score(pairIds, agreedBy){
  const g = { round:1, setter:'Asha', clues:pairIds.map((_,i)=>'c'+i),
              pairs: pairIds.map(id => ({ id, a:'W'+id, b:'X'+id })),
              decoyPairs: [{ id:99, a:'D', b:'E' }],
              picks: agreedBy, score:0, possible:0, log:[] };
  return reveal(g);
}
let r = score([0,1,2,3], { A:{0:0,1:1,2:2,3:3}, B:{0:0,1:1,2:2,3:3} });
ok(r.score === 4 && r.possible === 4, 'every clue read correctly scores full marks');
ok(Object.values(r.correct).every(Boolean), 'and every clue is marked right');

r = score([0,1,2,3], { A:{0:1,1:0,2:2,3:3}, B:{0:1,1:0,2:2,3:3} });
ok(r.score === 2, 'two pairs swapped costs both of them');

r = score([0,1,2,3], { A:{0:99,1:99,2:99,3:99}, B:{0:99,1:99,2:99,3:99} });
ok(r.score === 0, 'putting the decoy everywhere scores nothing');

r = score([0,1], { A:{0:0,1:1}, B:{0:1,1:0} });
ok(r.score === 0, 'two solvers who cancel each other out agree on nothing');

r = score([0,1,2,3], { A:{0:0,1:1,2:2,3:3} });
ok(r.score === 4, 'a single solver is enough');

head('The log');
r = score([0,1,2,3], { A:{0:0,1:1,2:9,3:3} });
ok(r.log[0].right === 3 && r.log[0].of === 4, 'the log records the score out of the total');
ok(r.log[0].pairs.length === 4 && r.log[0].clues.length === 4,
   'and keeps the puzzle so the end screen can show it');
ok(r.log[0].pairs !== r.pairs, 'the log holds copies, not references the next round overwrites');
ok(r.log[0].agreed[2] === 9, 'and what the table actually said');

// ── 6. cumulative ────────────────────────────────────────────
head('Across a whole game');
let game = { players:P, round:0, boards:4, decoys:1, score:0, possible:0, log:[] };
for (let n = 1; n <= 3; n++){
  game.round = n;
  game = dealPuzzle(game);
  game.clues = game.pairs.map((_,i)=>'c'+i);
  // solvers get the first two right and the rest wrong
  const answer = {};
  game.pairs.forEach((p,i)=>{ answer[i] = i < 2 ? p.id : game.decoyPairs[0].id; });
  game.picks = { Bilal:answer, Chetan:answer };
  game = reveal(game);
}
ok(game.score === 6 && game.possible === 12, 'scores accumulate across rounds (' +
   game.score + '/' + game.possible + ')');
ok(game.log.length === 3, 'each round is logged');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
