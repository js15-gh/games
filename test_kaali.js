/* Tests for Kaali Tiri.
 *
 * The partner is the whole game: you call a card, whoever holds it is secretly
 * on your side, and nobody knows until it is played. On two decks that had
 * never worked — dealtTo was keyed by the copy id ("AH#1") while the card is
 * called by face ("AH"), so the lookup always missed and the bidder played
 * every hand alone against the table while the screen promised otherwise.
 * Most of this file is that, from both deck counts.
 *
 *   node test_kaali.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/kaali-tiri-online.html', 'utf8');

function chunk(a, b){
  const i = src.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a);
  return src.slice(i, src.indexOf(b, i) + b.length);
}
function fn(name){
  let a = src.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('no ' + name);
  if (src.slice(a - 6, a) === 'async ') a -= 6;
  let d = 0;
  for (let j = src.indexOf('{', a); j < src.length; j++){
    if (src[j] === '{') d++;
    else if (src[j] === '}'){ d--; if (!d) return src.slice(a, j + 1); }
  }
}
const mod = { exports:{} };
new Function('module', [
  chunk('const SUITS =', '\n'), chunk('const RANKS =', '\n'),
  chunk('const SUIT_CH =', '\n'), chunk('const SUIT_NAME =', '\n'),
  chunk('const face   =', '\n'), chunk('const suitOf =', '\n'),
  chunk('const rankOf =', '\n'), chunk('const rankVal =', '\n'),
  chunk('const isKaali =', '\n'),
  chunk('const FRESH = {', 'handResult:null };'),
  'let G = null, me = null, pickTrump = "", pickCards = [];',
  'function mutate(fn){ G = fn(G); return G; }',
  'function setErr(){} function render(){}',
  fn('cardPoints'), fn('newDeck'), fn('trimDeck'), chunk('const sortHand =', '\n});'),
  fn('legalCards'), fn('beats'), fn('trickWinner'),
  fn('holdersOf'), fn('partnerHolders'), fn('biddingTeam'), fn('liveScore'),
  fn('dealHand'), fn('bid'), fn('passBid'), fn('closeBiddingIfDone'),
  'module.exports = { SUITS, RANKS, SUIT_CH, SUIT_NAME, FRESH, face, suitOf, rankOf, rankVal,' +
  ' isKaali, cardPoints, newDeck, trimDeck, sortHand, legalCards, beats, trickWinner,' +
  ' holdersOf, partnerHolders, biddingTeam, liveScore, dealHand, bid, passBid,' +
  ' setG:(g)=>{G=g;}, getG:()=>G, setMe:(m)=>{me=m;} };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);
const clone = (o) => JSON.parse(JSON.stringify(o));

function dealt(names, decks){
  const g = Object.assign(clone(M.FRESH), { players:names.slice(), decks:decks,
                                            minBid:130*decks });
  names.forEach(p => g.scores[p] = 0);
  M.setG(g);
  M.dealHand(M.getG());
  return M.getG();
}

// ── 1. the deal ──────────────────────────────────────────────
head('Dealing');
for (const n of [4,5,6,7,8,10]){
  for (const decks of [1,2]){
    const names = 'ABCDEFGHIJ'.slice(0,n).split('');
    const g = dealt(names, decks);
    const sizes = [...new Set(names.map(p => g.hands[p].length))];
    const all = names.flatMap(p => g.hands[p]);
    ok(sizes.length === 1, n + ' players / ' + decks + ' deck: everyone gets ' + sizes[0]);
    ok(all.length + g.removed.length === 52*decks,
       '  and every card is either dealt or listed as removed');
    ok(new Set(all).size === all.length, '  with no card dealt twice');
  }
}
head('Only worthless cards are removed to even the hands');
for (const n of [5,6,7]){
  const g = dealt('ABCDEFG'.slice(0,n).split(''), 1);
  ok(g.removed.every(c => M.cardPoints(c) === 0), n + ' players: nothing worth points is removed');
  ok(!g.removed.some(M.isKaali), '  and never the black three');
}

head('The points add up');
for (const decks of [1,2]){
  const g = dealt(['A','B','C','D'], decks);
  const inHands = ['A','B','C','D'].reduce((s,p)=>s+g.hands[p].reduce((x,c)=>x+M.cardPoints(c),0),0);
  ok(inHands === 250*decks, decks + ' deck: ' + inHands + ' points are in play');
}
ok(M.cardPoints('3S') === 30, 'the black three is worth thirty');
ok(M.cardPoints('AS') === 10 && M.cardPoints('TH') === 10, 'aces and tens are ten');
ok(M.cardPoints('5C') === 5, 'fives are five');
ok(M.cardPoints('4C') === 0 && M.cardPoints('2H') === 0, 'and the rest are worth nothing');

// ── 2. THE PARTNER ───────────────────────────────────────────
head('The called card finds its holder — on either deck count');
/* This is the bug. dealtTo was keyed by the id a two-deck game gives a card
   ("3S#1"), but partnerCards holds the face ("3S"), so on two decks the lookup
   missed every time: biddingTeam came back as the bidder alone, partnerHolders
   as nobody, and one person played the whole hand against five others while
   the screen told them somebody was secretly helping. */
for (const decks of [1,2]){
  const names = ['A','B','C','D','E','F'];
  const g = dealt(names, decks);
  // call a card somebody genuinely holds, by face, exactly as the screen does
  const holder = 'C';
  const called = M.face(g.hands[holder][0]);
  g.highBidder = 'A';
  g.partnerCards = [called];
  const team = M.biddingTeam(g);
  ok(team.includes('A'), decks + ' deck: the bidder is on their own side');
  ok(team.includes(holder),
     decks + ' deck: and so is whoever was dealt ' + called + ' (team ' + team.join('+') + ')');
  ok(M.partnerHolders(g).includes(holder), decks + ' deck: partnerHolders agrees');
}

head('On two decks BOTH holders of the called card are partners');
/* Two decks mean the called card exists twice, so it can be in two hands. Both
   of those players are on the bidder's side — which is only possible to express
   because dealtTo now maps a face to a LIST. */
let foundSplit = false;
for (let attempt = 0; attempt < 200 && !foundSplit; attempt++){
  const names = ['A','B','C','D','E','F'];
  const g = dealt(names, 2);
  for (const f of Object.keys(g.dealtTo)){
    const who = M.holdersOf(g, f);
    if (new Set(who).size === 2){
      g.highBidder = names.find(n => !who.includes(n));
      g.partnerCards = [f];
      const team = M.biddingTeam(g);
      ok(team.length === 3 && who.every(w => team.includes(w)),
         'both holders of ' + f + ' join the bidder (' + team.join('+') + ')');
      foundSplit = true;
      break;
    }
  }
}
ok(foundSplit, 'and a split pair really does occur in a two-deck deal');

head('Calling a card nobody holds leaves the bidder alone');
{
  const g = dealt(['A','B','C','D'], 1);
  g.highBidder = 'A';
  g.partnerCards = [ M.face(g.removed[0] || 'ZZ') ];
  const team = M.biddingTeam(g);
  ok(team.length === 1 && team[0] === 'A',
     'a removed card calls nobody — the bidder plays alone, which is a real risk');
}

head('Old rooms saved before the fix still work');
/* A game already in progress has dealtTo mapping a face to a bare string. */
{
  const g = dealt(['A','B','C','D'], 1);
  const holder = 'C';
  const called = M.face(g.hands[holder][0]);
  g.dealtTo = { [called]: holder };          // the old shape
  g.highBidder = 'A'; g.partnerCards = [called];
  ok(M.biddingTeam(g).includes(holder), 'a string still resolves to a partner');
}

// ── 3. trumps, including none ────────────────────────────────
head('Taking a trick');
const T = (pairs) => pairs.map(([name, card]) => ({ name, card }));
ok(M.trickWinner(T([['A','2S'],['B','KS'],['C','5S']]), 'S', 'H') === 'B',
   'highest of the led suit takes it');
ok(M.trickWinner(T([['A','AS'],['B','2H'],['C','KS']]), 'S', 'H') === 'B',
   'the smallest trump beats the biggest card of the led suit');
ok(M.trickWinner(T([['A','AS'],['B','KD'],['C','2C']]), 'S', 'H') === 'A',
   'an off-suit discard cannot win');
ok(M.trickWinner(T([['A','4S'],['B','3S'],['C','2S']]), 'S', 'H') === 'A',
   'the black three does NOT beat a four — it carries points, not rank');

head('No trump');
/* beats() needed no change: no card has suit "N", so both trump tests fall
   through and the led suit decides every trick — which is what no-trump means.
   Only the label and the button were missing. */
ok(M.SUIT_CH.N === '—' && M.SUIT_NAME.N === 'no trump', 'no trump has a label');
ok(M.trickWinner(T([['A','2S'],['B','AD'],['C','KC']]), 'S', 'N') === 'A',
   'with no trump the led suit decides, however low');
ok(M.trickWinner(T([['A','2S'],['B','KS'],['C','5S']]), 'S', 'N') === 'B',
   'and the highest of it still wins');
ok(M.trickWinner(T([['A','2H'],['B','AS'],['C','KS']]), 'H', 'N') === 'A',
   'a lone card of the led suit takes it against two higher off-suit cards');
let noTrumpOff = 0;
for (let i = 0; i < 200; i++){
  const led = M.SUITS[i % 4];
  const other = M.SUITS[(i+1) % 4];
  const w = M.trickWinner(T([['A','5'+led],['B','A'+other],['C','K'+other]]), led, 'N');
  if (w !== 'A') noTrumpOff++;
}
ok(noTrumpOff === 0, 'off-suit never takes a trick under no trump (' + noTrumpOff + ' did)');

head('Following suit');
ok(M.legalCards(['AS','5S','KH','2C'], 'S').join() === 'AS,5S', 'holding the led suit, only it is legal');
ok(M.legalCards(['KH','2C'], 'S').length === 2, 'holding none of it, anything goes');
ok(M.legalCards(['AS','5S'], '').length === 2, 'leading, anything goes');
let noLegal = 0;
for (let i = 0; i < 500; i++){
  const g = dealt(['A','B','C','D'], 1);
  for (const led of M.SUITS) if (!M.legalCards(g.hands.A, led).length) noLegal++;
}
ok(noLegal === 0, 'every hand always has something legal to play');

// ── 4. the live score ────────────────────────────────────────
head('The running score');
{
  const g = dealt(['A','B','C','D'], 1);
  g.highBidder = 'A'; g.highBid = 160; g.partnerCards = [];
  g.captured = { A:['AS','KS'], B:['3S'], C:[], D:[] };
  const s = M.liveScore(g);
  ok(s.inPlay === 250, '250 points in a one-deck deal');
  ok(s.us === 20, 'the bidder has taken twenty');
  ok(s.them === 30, 'the others have taken the black three');
  ok(s.out === 200, 'and two hundred are still out in hands');
  ok(s.us + s.them + s.out === s.inPlay, 'nothing is unaccounted for');
  ok(s.need === 140, 'the contract still needs 140');
}

// ── 5. open bidding ──────────────────────────────────────────
head('Bidding is open — no turn order');
{
  const g = dealt(['A','B','C','D','E','F'], 1);
  M.setG(g);
  M.setMe('D'); M.bid(150);
  M.setMe('A'); M.bid(160);
  M.setMe('F'); M.bid(150);
  ok(M.getG().highBid === 160 && M.getG().highBidder === 'A', 'a bid under the standing one is refused');
  M.setMe('F'); M.bid(170);
  ok(M.getG().highBidder === 'F', 'anybody may raise, in any order');
  M.setMe('F'); M.passBid();
  ok(!M.getG().passed.includes('F'), 'you cannot pass while you are the one in front');
  for (const p of ['A','B','C','D','E']){ M.setMe(p); M.passBid(); }
  ok(M.getG().phase === 'naming', 'the last bidder standing takes the contract');
  ok(M.getG().highBidder === 'F' && M.getG().highBid === 170, 'at their own bid');
}
{
  const g = dealt(['A','B','C','D'], 1);
  M.setG(g);
  M.setMe('A'); M.bid(120);
  ok(M.getG().highBidder === null, 'a bid below the minimum is refused');
  M.setMe('A'); M.bid(999);
  ok(M.getG().highBidder === null, 'and one above everything in the deck');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
