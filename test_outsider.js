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

/* THE ANTI-REPEAT RULE MUST NOT APPLY AT THREE PLAYERS. Excluding whoever was
   Outsider last round leaves two candidates; a knower rules themselves out and
   knows the third with certainty, every round after the first. At four and up
   there is room for the rule; at three it hands the game away. Repeating is a
   mild annoyance — deducing the Outsider for free is the whole game. */
let recurred = 0;
let gThree = { players:["Asha","Bilal","Chetan"], cats:[], outsider:"Asha" };
for (let i = 0; i < 3000; i++){
  const before = gThree.outsider;
  gThree = dealRound(gThree);
  if (gThree.outsider === before) recurred++;
}
ok(recurred > 700,
   'at three players the Outsider CAN recur, so nobody can deduce it (' +
   recurred + '/3000, expected about a third)');

// and the rule must never hang, however small the table
let g2 = { players:['Asha','Bilal'], cats:[], outsider:'Asha' };
g2 = dealRound(g2);
ok(['Asha','Bilal'].includes(g2.outsider),
   'a two-player table still gets a seated Outsider rather than hanging');

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


// ── 7. the handlers ──────────────────────────────────────────
/* Everything above lifts pure functions. That is why this suite could have 88
   assertions and still miss a clue box that handed the Outsider the secret
   word: every guard in this game lives inside a commit callback, or in the few
   lines just before one, and none of it was ever run here. */
const H = (() => {
  const mod2 = { exports:{} };
  new Function('module', [
    slice('const CATS = [', '];'),
    slice('const FRESH = {', '_sessionEnd:null };'),
    'let G = null, me = null, peeked = false, clueDraft = "", __name = "", __clue = "";',
    'let __replay = false;',
    'function mutate(fn){ G = fn(G); if (__replay) G = fn(G); return G; }',
    'function setErr(){} function render(){} function vpForgetSeat(){}',
    'const GAME_ID = "outsider", ROOM = "TEST";',
    'function $(id){ return id === "clueInput" ? { value: __clue } : { value: __name }; }',
    fn('pick'), fn('dealRound'), fn('tally'), fn('score'),
    fn('submitClue'), fn('goToVote'), fn('anotherClueRound'), fn('nextRound'),
    fn('addPlayer'), fn('removePlayer'), fn('backToSetup'),
    'module.exports = { FRESH, dealRound, goToVote, anotherClueRound, nextRound,' +
    ' removePlayer, backToSetup,' +
    ' clue:(s)=>{ __clue = s; return submitClue(); },' +
    ' addNamed:(n)=>{ __name = n; return addPlayer(); },' +
    ' setG:(g)=>{G=g;}, getG:()=>G, setMe:(m)=>{me=m;}, replay:(b)=>{__replay=b;} };'
  ].join('\n'))(mod2);
  return mod2.exports;
})();

const clone = (o) => JSON.parse(JSON.stringify(o));
function inClue(over){
  const g = Object.assign(clone(H.FRESH), {
    phase:'clue', players:P.slice(), outsider:'Bilal', secret:'Yorker', cat:'cricket',
    clues:{}, votes:{}, ready:{}, clueRound:1, clueRounds:1, round:1, rounds:5,
    scores:{Asha:0,Bilal:0,Chetan:0,Devi:0}, log:[]
  }, over || {});
  H.setG(g);
  return g;
}

head('The clue box must not tell the Outsider the word');
/* The check ran on every phone against its own copy of the secret, before any
   write, and returned WITHOUT clearing the box — so the Outsider could type a
   board word, read the red bar, and learn the word for free. Sixteen words, one
   probe a round. */
inClue();
H.setMe('Bilal');                       // the Outsider
H.clue('Yorker');                       // types the secret itself
let cg = H.getG();
ok((cg.clues.Bilal || []).length === 1,
   'the Outsider typing the word sends it as their clue rather than being told');
ok((cg.clues.Bilal || [])[0] === 'Yorker', 'and it is the word they typed');

inClue();
H.setMe('Asha');                        // somebody who knows
H.clue('Yorker');
ok((H.getG().clues.Asha || []).length === 0,
   'but a knower is still stopped from just saying it');
H.clue('bouncer');
ok((H.getG().clues.Asha || [])[0] === 'bouncer', 'and can give a real clue after');

head('A clue is one word, from a seated player, in the clue phase');
inClue();
H.setMe('Asha'); H.clue('two words');
ok((H.getG().clues.Asha || []).length === 0, 'two words is refused');
inClue({ phase:'vote' });
H.setMe('Asha'); H.clue('bouncer');
ok((H.getG().clues.Asha || []).length === 0, 'and a clue cannot land after the clue phase');

head('The clue round closes when everyone has given one');
inClue();
for (const who of P){ H.setMe(who); H.clue('word' + who); }
ok(H.getG().phase === 'clueshow', 'four clues in, the round moves on');

head('A stale tap must not re-open a round that has been scored');
/* goToVote, anotherClueRound and nextRound were bare phase assignments with no
   test of the state they were handed. commit() replays a refused callback
   against fresh state, so a stale tap on a finished round LANDED: the room went
   back to a vote where every seat already showed a vote, and one tap of
   "change" re-ran the tally and paid the whole round a second time. */
inClue({ phase:'result', outcome:'caught', accused:'Bilal',
         votes:{Asha:'Bilal',Bilal:'Chetan',Chetan:'Bilal',Devi:'Bilal'},
         scores:{Asha:1,Bilal:0,Chetan:1,Devi:1} });
H.goToVote();
ok(H.getG().phase === 'result', 'a stale "go to the vote" cannot rewind a result');
ok(H.getG().scores.Asha === 1, 'so nobody is paid twice');

inClue({ phase:'result' });
H.anotherClueRound();
ok(H.getG().phase === 'result', 'nor can a stale "second clue round"');

inClue({ phase:'clueshow', clueRound:1, clueRounds:1 });
H.anotherClueRound();
ok(H.getG().clueRound === 1, 'and the clue round never goes past the agreed number');
inClue({ phase:'clueshow', clueRound:1, clueRounds:2 });
H.anotherClueRound();
ok(H.getG().clueRound === 2 && H.getG().phase === 'clue', 'but a legitimate one works');

head('Two taps on "next round" advance once');
inClue({ phase:'result', round:1, rounds:5 });
H.nextRound();
const after = clone(H.getG());
H.nextRound(); H.nextRound();
ok(H.getG().round === after.round, 'the round advances exactly once (' + after.round + ')');
ok(H.getG().secret === after.secret, 'and nobody is dealt a new word underneath them');

head('The table cannot change underneath a running round');
inClue();
H.addNamed('Latecomer');
ok(!H.getG().players.includes('Latecomer'),
   'a name added after the deal would have no card and stall the round forever');
H.setMe('Asha');
H.removePlayer('Bilal');
ok(H.getG().players.includes('Bilal'),
   'and removing the live Outsider mid-round would make it unwinnable');

H.setG(Object.assign(clone(H.FRESH), { phase:'setup', players:[] }));
H.addNamed('Sam'); H.addNamed('sam');
ok(H.getG().players.length === 1, 'the same name cannot be seated twice');
for (let i = 0; i < 16; i++) H.addNamed('P' + i);
ok(H.getG().players.length === 12, 'and twelve is really the ceiling');

head('"Change players" needs a seat');
inClue();
H.setMe(null);
H.backToSetup();
ok(H.getG().phase === 'clue', 'a phone with no seat cannot end everybody\'s game');
H.setMe('Asha');
H.backToSetup();
ok(H.getG().phase === 'setup', 'but a player can');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
