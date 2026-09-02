/* Tests for Judgement (Kachuful) — the largest rules engine on the site, and
 * until now the only big one with no suite at all.
 *
 * The mutators are driven THROUGH mutate(), not around it. That matters: every
 * guard in this game lives inside a commit callback, and a test that reaches
 * past the real entry point tests something that does not ship. That exact
 * shortcut is how test_werewolf walked past a deadlock that stopped the game
 * dead, so this file stubs mutate() to apply the callback and then calls the
 * handlers the buttons actually call.
 *
 *   node test_judgement.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/judgement-card-game-online.html', 'utf8');

function chunk(a, b){
  const i = src.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a);
  return src.slice(i, src.indexOf(b, i) + b.length);
}
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
  chunk("const SUITS = [", "\n"), chunk("const RANKS = [", "\n"),
  chunk("const TRUMP_CYCLE = [", "\n"), chunk("const FRESH = {", "maxCards:7 };"),
  'let G = null, me = null;',
  // the handlers all write through this; applying the callback is exactly what
  // commit() does, and re-applying it is exactly what commit() does on a retry
  'function mutate(fn){ G = fn(G); return G; }',
  'function setErr(){}',
  'const GAME_ID = "judgement", ROOM = "TEST";',
  'function vpForgetSeat(){}',
  chunk('const suitOf =', '\n'), chunk('const rankOf =', '\n'), chunk('const rankVal =', '\n'),
  fn('newDeck'), chunk('const sortHand =', '\n});'),
  fn('legalCards'), fn('trickWinner'), fn('estimateTricks'), fn('buildRounds'),
  chunk('const cardsThisRound =', '\n'), chunk('const seatAfter =', '\n'),
  chunk('const bidTotal =', '\n'), chunk('const allBidsIn =', '\n'),
  fn('addPlayer'), fn('removePlayer'), fn('startGame'), fn('dealRound'),
  fn('placeBid'), fn('playCard'), fn('nextTrick'), fn('nextRound'), fn('playAgain'),
  'module.exports = { FRESH, TRUMP_CYCLE, RANKS, SUITS, suitOf, rankOf, rankVal, newDeck,' +
  ' sortHand, legalCards, trickWinner, estimateTricks, buildRounds, cardsThisRound,' +
  ' seatAfter, bidTotal, allBidsIn, startGame, dealRound, placeBid, playCard, nextTrick,' +
  ' nextRound, playAgain, removePlayer,' +
  ' setG:(g)=>{ G=g; }, getG:()=>G, setMe:(m)=>{ me=m; },' +
  ' addName:(n)=>{ const el={value:n}; global.__el=el; return addPlayerWith(n); },' +
  ' addPlayerWith:(n)=>{ __name=n; return addPlayer(); } };',
  'let __name = "";',
  // addPlayer reads the input box; give it one
  'function $(id){ return { value: __name, textContent: "" }; }'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);
const clone = (o) => JSON.parse(JSON.stringify(o));

function fresh(over){
  const g = Object.assign(clone(M.FRESH), over || {});
  return g;
}
function seat(g, names){
  g.players = names.slice();
  names.forEach(n => g.scores[n] = 0);
  return g;
}

// ── 1. the deck and the cards ────────────────────────────────
head('The deck');
const deck = M.newDeck();
ok(deck.length === 52, 'fifty-two cards');
ok(new Set(deck).size === 52, 'all different');
ok(M.SUITS.every(s => deck.filter(c => M.suitOf(c) === s).length === 13),
   'thirteen of each suit');
ok(M.RANKS.every(r => deck.filter(c => M.rankOf(c) === r).length === 4),
   'four of each rank');
let shuffled = 0;
for (let i = 0; i < 50; i++) if (M.newDeck().join() !== M.newDeck().join()) shuffled++;
ok(shuffled === 50, 'and shuffled every time');

head('Card values');
ok(M.rankVal('2S') === 2 && M.rankVal('AS') === 14, 'two is low, ace is high');
ok(M.rankVal('TS') === 10 && M.rankVal('JS') === 11, 'ten below jack');
ok(M.RANKS.every((r,i) => M.rankVal(r + 'S') === i + 2), 'the whole ladder is in order');

// ── 2. following suit ────────────────────────────────────────
head('Following suit');
const hand = ['AS','5S','KH','2C'];
ok(M.legalCards(hand, 'S').join() === 'AS,5S', 'holding the led suit, only that suit is legal');
ok(M.legalCards(hand, 'H').join() === 'KH', 'one card of the led suit means one legal card');
ok(M.legalCards(hand, 'D').length === 4, 'holding none of it, everything is legal');
ok(M.legalCards(hand, '').length === 4, 'leading, everything is legal');
ok(M.legalCards(['AS','5S'], 'S').length === 2, 'a hand that is ALL the led suit is all legal');
ok(M.legalCards([], 'S').length === 0, 'an empty hand has no legal card');

head('Every hand always has something to play');
for (let i = 0; i < 400; i++){
  const d = M.newDeck();
  const h = d.slice(0, 5);
  for (const led of ['S','H','D','C','']){
    if (M.legalCards(h, led).length === 0){ ok(false, 'no legal card for ' + h + ' on ' + led); break; }
  }
}
ok(true, 'four hundred random hands, every led suit, always at least one legal card');

// ── 3. who wins a trick ──────────────────────────────────────
head('Winning a trick');
const T = (pairs) => pairs.map(([name, card]) => ({ name, card }));
let w = M.trickWinner(T([['A','2S'],['B','KS'],['C','5S']]), 'S', 'H');
ok(w === 'B', 'highest of the led suit wins when nobody trumps');
w = M.trickWinner(T([['A','AS'],['B','2H'],['C','KS']]), 'S', 'H');
ok(w === 'B', 'the smallest trump beats the highest card of the led suit');
w = M.trickWinner(T([['A','AS'],['B','2H'],['C','5H']]), 'S', 'H');
ok(w === 'C', 'and the highest trump beats a lower one');
w = M.trickWinner(T([['A','AS'],['B','KD'],['C','2C']]), 'S', 'H');
ok(w === 'A', 'off-suit cards that are not trumps cannot win');
w = M.trickWinner(T([['A','2S'],['B','AD'],['C','KC']]), 'S', 'N');
ok(w === 'A', 'in a no-trump round the led suit decides, however low');
w = M.trickWinner(T([['A','AH'],['B','KH'],['C','QH']]), 'H', 'H');
ok(w === 'A', 'when the led suit IS trumps the highest of it wins');

head('The winner of a trick leads the next');
let g = seat(fresh({ phase:'playing', rounds:[2], round:0, trump:'H', turn:0 }),
             ['A','B','C']);
g.hands = { A:['2S','3S'], B:['KS','4S'], C:['5S','6S'] };
g.bids = { A:0, B:1, C:0 }; g.tricksWon = { A:0, B:0, C:0 };
M.setG(g);
M.setMe('A'); M.playCard('2S');
M.setMe('B'); M.playCard('KS');
M.setMe('C'); M.playCard('5S');
g = M.getG();
ok(g.phase === 'trickend' && g.lastTrick.winner === 'B', 'B took it with the king');
M.nextTrick();
g = M.getG();
ok(g.players[g.turn] === 'B', 'and B is on lead for the next trick');
ok(g.trick.length === 0 && g.led === '', 'with a clean table');

// ── 4. the phase guards, driven through mutate() ─────────────
/* Every one of these is a bug that shipped. "Next trick" is drawn on EVERY
   phone, so two people tapping it is the normal case, not an edge case, and
   commit() re-runs the callback against fresh state when the first write wins. */
head('A second tap must never damage a round in progress');

function midRound(){
  const g = seat(fresh({ phase:'playing', rounds:[3], round:0, trump:'H', turn:0 }),
                 ['A','B','C']);
  g.hands = { A:['2S','3S','4S'], B:['KS','5S','6S'], C:['7S','8S','9S'] };
  g.bids = { A:1, B:1, C:1 }; g.tricksWon = { A:0, B:0, C:0 };
  return g;
}
// finish a trick, advance, then let a stale phone tap Next trick again
M.setG(midRound());
M.setMe('A'); M.playCard('2S');
M.setMe('B'); M.playCard('KS');
M.setMe('C'); M.playCard('7S');
M.nextTrick();                       // legitimate
M.setMe('B'); M.playCard('5S');      // B leads the new trick
const beforeStale = clone(M.getG());
M.nextTrick();                       // the stale second tap
const afterStale = M.getG();
ok(afterStale.trick.length === 1 && afterStale.trick[0].card === '5S',
   'the card already led into the new trick survives a stale "Next trick"');
ok(JSON.stringify(afterStale) === JSON.stringify(beforeStale),
   'in fact the stale tap changes nothing at all');

head('Cards are never destroyed');
function totalCards(g){
  return g.players.reduce((s,p)=> s + (g.hands[p]||[]).length, 0) + g.trick.length;
}
M.setG(midRound());
let expect = 9;
M.setMe('A'); M.playCard('2S'); ok(totalCards(M.getG()) === expect, 'nine cards after one play');
M.setMe('B'); M.playCard('KS');
M.setMe('C'); M.playCard('7S');
ok(totalCards(M.getG()) === 9, 'still nine with the trick on the table');
M.nextTrick();
ok(totalCards(M.getG()) === 6, 'six once the trick is taken');
M.nextTrick(); M.nextTrick();
ok(totalCards(M.getG()) === 6, 'and repeated stale taps take no more');

head('A round is never scored twice');
M.setG(midRound());
const order = [['A','2S'],['B','KS'],['C','7S']];
for (let trick = 0; trick < 3; trick++){
  const g0 = M.getG();
  const lead = g0.players[g0.turn];
  const seatsInOrder = [];
  for (let k = 0; k < 3; k++) seatsInOrder.push(g0.players[(g0.turn + k) % 3]);
  for (const p of seatsInOrder){ M.setMe(p); M.playCard((M.getG().hands[p] || [])[0]); }
  M.nextTrick();
}
g = M.getG();
ok(g.phase === 'roundend', 'the round ends when the cards run out');
const scoredOnce = clone(g.scores);
M.nextTrick(); M.nextTrick();
ok(JSON.stringify(M.getG().scores) === JSON.stringify(scoredOnce),
   'and two more taps of "Next trick" do not pay anybody again');

head('A second "Deal round N" must not skip a round');
g = seat(fresh({ phase:'roundend', rounds:[1,2,3,4], round:1, dealer:0 }), ['A','B','C']);
M.setG(g);
M.nextRound();
const r1 = M.getG().round, d1 = M.getG().dealer;
M.nextRound(); M.nextRound();
ok(M.getG().round === r1, 'the round number advances exactly once (' + r1 + ')');
ok(M.getG().dealer === d1, 'and the dealer rotates exactly one seat');

// ── 5. the deal can never overrun the deck ───────────────────
head('The deal always fits in fifty-two cards');
/* startGame used to read the player count from the phone's stale copy while
   dealing from the fresh one, so a join landing in between dealt a seat two
   cards — or none — and that player then had nothing to tap. */
let bad = 0, shortHands = 0;
for (let n = 3; n <= 7; n++){
  for (const max of [5,7,8,10]){
    const names = 'ABCDEFG'.slice(0, n).split('');
    const gg = seat(fresh({ maxCards:max }), names);
    M.setG(gg);
    M.startGame();
    const st = M.getG();
    for (let r = 0; r < st.rounds.length; r++){
      const cards = st.rounds[r];
      if (cards * n > 52) bad++;
    }
    // every seat gets the same number of cards on the first deal
    const sizes = names.map(p => st.hands[p].length);
    if (new Set(sizes).size !== 1) shortHands++;
    if (sizes[0] !== st.rounds[0]) shortHands++;
  }
}
ok(bad === 0, 'no round at any player count ever needs more than 52 cards');
ok(shortHands === 0, 'and every seat is dealt the same number');

head('A concurrent join cannot deal a short hand');
// the callback is re-applied to a state with one MORE player, exactly as
// commit() does after a conflict
g = seat(fresh({ maxCards:10 }), ['A','B','C','D','E']);
M.setG(g);
const late = clone(g); late.players.push('F'); late.scores.F = 0;
M.setG(late);
M.startGame();
g = M.getG();
ok(Math.max(...g.rounds) * g.players.length <= 52,
   'the cap is taken from the six players actually seated, not the five on screen');
ok(g.players.every(p => g.hands[p].length === g.rounds[0]), 'every seat dealt equally');

head('Refusing a table it cannot deal');
g = seat(fresh(), ['A','B']);
M.setG(g); M.startGame();
ok(M.getG().phase === 'setup', 'two players is refused inside the commit, not just on screen');
g = seat(fresh(), 'ABCDEFGH'.split(''));
M.setG(g); M.startGame();
ok(M.getG().phase === 'setup', 'and so is an eighth seat');

// ── 6. bidding ───────────────────────────────────────────────
head('A bid belongs to whoever tapped');
/* It used to be recorded against g.players[g.turn], so on a retry one player's
   number landed in the next player's bid — and that player never saw a bid
   screen, because the game counted them as done. */
g = seat(fresh({ phase:'bidding', rounds:[3], round:0, dealer:0, turn:1 }), ['A','B','C']);
g.hands = { A:['2S','3S','4S'], B:['KS','5S','6S'], C:['7S','8S','9S'] };
M.setG(g);
M.setMe('C'); M.placeBid(2);
ok(M.getG().bids.C === undefined, 'C cannot bid while it is B\'s turn');
ok(M.getG().bids.B === undefined, 'and C\'s number is NOT written into B\'s bid');
M.setMe('B'); M.placeBid(1);
ok(M.getG().bids.B === 1, 'B bids on B\'s turn');
M.setMe('B'); M.placeBid(3);
ok(M.getG().bids.B === 1, 'and cannot change it by tapping again');

head('The last bid may not make the total equal the tricks');
g = seat(fresh({ phase:'bidding', rounds:[3], round:0, dealer:0, turn:2 }), ['A','B','C']);
g.hands = { A:['2S','3S','4S'], B:['KS','5S','6S'], C:['7S','8S','9S'] };
g.bids = { A:1, B:1 };
M.setG(g);
M.setMe('C'); M.placeBid(1);
ok(M.getG().bids.C === undefined, 'the forbidden bid is refused by the rules, not only greyed out');
M.setMe('C'); M.placeBid(2);
ok(M.getG().bids.C === 2, 'any other bid is fine');
ok(M.getG().phase === 'playing', 'and the last bid opens play');
ok(M.getG().players[M.getG().turn] === 'B', 'left of the dealer leads');

// ── 7. scoring ───────────────────────────────────────────────
head('Scoring is exact or nothing');
g = seat(fresh({ phase:'playing', rounds:[2], round:0, trump:'H', turn:0 }), ['A','B','C']);
g.hands = { A:[], B:[], C:[] };
g.bids = { A:2, B:0, C:1 };
g.tricksWon = { A:2, B:1, C:1 };
g.lastTrick = { winner:'A' };
g.phase = 'trickend';
M.setG(g);
M.nextTrick();
g = M.getG();
ok(g.scores.A === 12, 'bid 2 and took 2 scores 10 + 2 = 12');
ok(g.scores.B === 0, 'bid 0 and took 1 scores nothing');
ok(g.scores.C === 11, 'bid 1 and took 1 scores 10 + 1 = 11');

head('Bidding zero and taking none is worth ten');
g = seat(fresh({ phase:'trickend', rounds:[1], round:0, turn:0 }), ['A','B','C']);
g.hands = { A:[], B:[], C:[] };
g.bids = { A:0, B:0, C:1 }; g.tricksWon = { A:0, B:0, C:1 };
g.lastTrick = { winner:'C' };
M.setG(g); M.nextTrick();
ok(M.getG().scores.A === 10, 'a made zero is a real score');

// ── 8. the round ladder and the trump rotation ───────────────
head('The round ladder');
ok(M.buildRounds(7).join() === '1,2,3,4,5,6,7,6,5,4,3,2,1', 'up to the top and back down');
ok(M.buildRounds(1).join() === '1', 'a one-card game is one round');
for (const max of [5,7,8,10]){
  const r = M.buildRounds(max);
  ok(r.length === max*2 - 1, max + ' cards gives ' + (max*2-1) + ' rounds');
  ok(Math.max(...r) === max && Math.min(...r) === 1, 'from one card up to ' + max);
}

head('The worked example on the page must be a deal that can happen');
/* It used to say "seven cards and spades are trumps", which the ladder and the
   S,D,C,H,N rotation never produce at any setting. A worked example is code
   that nobody runs. */
function dealtPairs(max){
  const r = M.buildRounds(max), out = new Set();
  r.forEach((n,i) => out.add(n + ':' + M.TRUMP_CYCLE[i % M.TRUMP_CYCLE.length]));
  return out;
}
const anyMax = [5,7,8,10].map(dealtPairs);
ok(!anyMax.some(s => s.has('7:S')), 'seven cards on spades really is impossible (the old example)');
ok(anyMax.some(s => s.has('7:D')), 'seven cards on diamonds is dealt (the new one)');
const page = fs.readFileSync(__dirname + '/judgement-card-game-online.html', 'utf8');
const eg = page.slice(page.indexOf('class="eg"'), page.indexOf('class="facts"'));
ok(/seven cards and diamonds are trumps/.test(eg), 'and that is what the page now says');
ok(!/seven cards and spades/.test(eg), 'the impossible deal is gone from the page');

// ── 9. whole games ───────────────────────────────────────────
head('Two hundred games played to the end');
let stuck = 0, finished = 0, badTotal = 0, negative = 0, guardHits = 0;
for (let s = 0; s < 200; s++){
  const n = 3 + (s % 5);
  const names = 'ABCDEFG'.slice(0, n).split('');
  const max = [5,7,8,10][s % 4];
  M.setG(seat(fresh({ maxCards:max }), names));
  M.startGame();
  let guard = 0;
  while (M.getG().phase !== 'done' && guard++ < 4000){
    const g = M.getG();
    if (g.phase === 'bidding'){
      const p = g.players[g.turn];
      const cards = M.cardsThisRound(g);
      const left = g.players.filter(x => g.bids[x] === undefined || g.bids[x] === null);
      let bid = (s + guard) % (cards + 1);
      if (left.length === 1 && M.bidTotal(g) + bid === cards) bid = (bid + 1) % (cards + 1);
      M.setMe(p); M.placeBid(bid);
      if (M.getG().bids[p] === undefined) guardHits++;
    } else if (g.phase === 'playing'){
      const p = g.players[g.turn];
      const legal = M.legalCards(g.hands[p] || [], g.led);
      if (!legal.length){ stuck++; break; }
      M.setMe(p); M.playCard(legal[guard % legal.length]);
    } else if (g.phase === 'trickend'){
      M.nextTrick();
    } else if (g.phase === 'roundend'){
      M.nextRound();
    } else break;
  }
  const g = M.getG();
  if (g.phase === 'done') finished++; else stuck++;
  // tricks won in a round can never exceed the cards dealt
  const won = g.players.reduce((a,p)=> a + (g.tricksWon[p]||0), 0);
  if (won > (g.rounds[g.round] || 0)) badTotal++;
  if (g.players.some(p => g.scores[p] < 0)) negative++;
}
ok(stuck === 0, 'no game ever reached a state with nothing to play (' + stuck + ' stuck)');
ok(finished === 200, 'all two hundred reached the final round');
ok(badTotal === 0, 'tricks won never exceeded the cards dealt');
ok(negative === 0, 'nobody ever went below zero — a missed bid scores nothing, not a penalty');
ok(guardHits === 0, 'and the bid guard never had to refuse a legal bid');

head('Play again keeps the group it belongs to');
/* Rebuilding from FRESH used to drop _group, so a room in a group silently
   stopped reporting to its scoreboard from the second game onward. */
g = seat(fresh({ phase:'done', _group:'K7M2QX', maxCards:8 }), ['A','B','C']);
M.setG(g);
M.playAgain(true);
ok(M.getG()._group === 'K7M2QX', 'the group marker survives "play again"');
ok(M.getG().players.join() === 'A,B,C', 'and so do the players');
ok(M.getG().maxCards === 8, 'and the settings');
ok(Object.values(M.getG().scores).every(v => v === 0), 'with the scores reset');
M.setG(seat(fresh({ phase:'done', _group:'K7M2QX' }), ['A','B','C']));
M.playAgain(false);
ok(M.getG()._group === 'K7M2QX', 'and it survives starting over with new players too');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
