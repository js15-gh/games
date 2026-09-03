/* Tests for the two bluffing games, Face Down and Fibbers.
 *
 * Both lift their real functions out of their pages, so the tests track what
 * ships rather than a copy of it.
 *
 *   node test_bluffs.js
 */
const fs = require('fs');

function loader(file){
  const src = fs.readFileSync(__dirname + '/' + file, 'utf8');
  return {
    src,
    chunk(start, end){
      const a = src.indexOf(start);
      if (a < 0) throw new Error(file + ': not found ' + start);
      const b = src.indexOf(end, a);
      return src.slice(a, b + end.length);
    },
    fn(name){
      const a = src.indexOf('function ' + name + '(');
      if (a < 0) throw new Error(file + ': no function ' + name);
      let depth = 0;
      for (let j = src.indexOf('{', a); j < src.length; j++){
        if (src[j] === '{') depth++;
        else if (src[j] === '}'){ depth--; if (!depth) return src.slice(a, j + 1); }
      }
      throw new Error(file + ': unbalanced ' + name);
    }
  };
}
function build(parts, exportsLine){
  const mod = { exports:{} };
  new Function('module', parts.concat([exportsLine]).join('\n'))(mod);
  return mod.exports;
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ════════════════════════════════════════════════════════════
//  FACE DOWN
// ════════════════════════════════════════════════════════════
const fd = loader('face-down-online.html');
const FD = build([
  "const PETAL='p', THORN='t';",
  fd.chunk('const alive =', '\n'),
  fd.chunk('const discsLeft =', '\n'),
  fd.chunk('const current =', '\n'),
  fd.chunk('const stillBidding =', '\n'),
  fd.chunk('const totalOnTable =', '\n'),
  fd.fn('advance'), fd.fn('advanceBidder'), fd.fn('newHand'), fd.fn('dealDiscs'),
  fd.fn('ownStackClear'), fd.fn('returnAll'), fd.fn('succeed'), fd.fn('bust'),
  // drive the handlers through mutate(), because every guard lives inside a
  // commit callback and reaching around it tests something that does not ship
  'let G=null, me=null, __name="";',
  'function mutate(f){ G = f(G); return G; }',
  'function setErr(){} function render(){} function vpForgetSeat(){}',
  'const GAME_ID="facedown", ROOM="TEST";',
  'function $(id){ return { value: __name, textContent:"" }; }',
  fd.fn('startGame'), fd.fn('addPlayer'), fd.fn('removePlayer'), fd.fn('setTarget'),
  fd.fn('nextHand'), fd.fn('backToSetup'),
], 'module.exports = { PETAL, THORN, alive, discsLeft, current, stillBidding, totalOnTable, ' +
   'advance, advanceBidder, newHand, dealDiscs, ownStackClear, returnAll, succeed, bust, ' +
   'startGame, removePlayer, setTarget, nextHand, backToSetup, ' +
   'addNamed:(n)=>{ __name=n; return addPlayer(); }, ' +
   'setG:(g)=>{G=g;}, getG:()=>G, setMe:(m)=>{me=m;} };');

head('Face Down — the deal');
const P4 = ['Asha','Bilal','Chetan','Devi'];
let g = FD.dealDiscs({ players:P4, hand:{}, stack:{} });
ok(P4.every(p => g.hand[p].length === 4), 'four discs each');
ok(P4.every(p => g.hand[p].filter(d=>d===FD.THORN).length === 1), 'exactly one thorn each');
ok(P4.every(p => g.hand[p].filter(d=>d===FD.PETAL).length === 3), 'and three petals');

head('Face Down — turn order');
g = { players:P4, lost:{}, turn:0, stack:{}, hand:{} };
const seq = [];
for (let i=0;i<6;i++){ seq.push(FD.current(g)); g = FD.advance(g); }
ok(seq.join() === 'Asha,Bilal,Chetan,Devi,Asha,Bilal', 'the turn goes round the table');

g = { players:P4, lost:{ Bilal:true }, turn:0, stack:{}, hand:{} };
const seq2 = [];
for (let i=0;i<4;i++){ seq2.push(FD.current(g)); g = FD.advance(g); }
ok(!seq2.includes('Bilal'), 'a player who is out is skipped');

head('Face Down — bidding order');
g = { players:P4, lost:{}, turn:0, passed:['Bilal','Chetan'] };
g = FD.advanceBidder(g);
ok(FD.current(g) === 'Devi', 'bidding skips everyone who has passed');
g = { players:P4, lost:{}, turn:3, passed:['Bilal','Chetan'] };
g = FD.advanceBidder(g);
ok(FD.current(g) === 'Asha', 'and wraps round the table');
ok(FD.stillBidding({ players:P4, lost:{}, passed:['Bilal','Chetan'] }).join() === 'Asha,Devi',
   'stillBidding lists only those who have not passed');

head('Face Down — you must clear your own pile first');
ok(!FD.ownStackClear({ bidder:'Asha', stack:{ Asha:['p'] } }), 'a disc of your own left blocks you');
ok(FD.ownStackClear({ bidder:'Asha', stack:{ Asha:[] } }), 'an empty pile of your own frees you');

head('Face Down — discs are never destroyed');
function totalDiscs(g){
  return g.players.reduce((n,p)=>n + (g.hand[p]||[]).length + (g.stack[p]||[]).length, 0)
       + (g.flips||[]).length;
}
// a bidder who has turned over three of their own and then hits a thorn
g = { players:P4, lost:{}, wins:{Asha:0}, target:2, bidder:'Asha', bid:4,
      hand:{ Asha:[], Bilal:['p','p'], Chetan:['p','p','p','t'], Devi:['p','p','p','t'] },
      stack:{ Asha:[], Bilal:['t'], Chetan:[], Devi:[] },
      flips:[ {player:'Asha',disc:'p'},{player:'Asha',disc:'p'},
              {player:'Asha',disc:'p'},{player:'Asha',disc:'t'} ],
      log:[] };
const beforeBust = totalDiscs(g);
g = FD.bust(g);
ok(totalDiscs(g) === beforeBust - 1,
   'busting costs exactly one disc, not the pile you had turned over (' +
   beforeBust + ' -> ' + totalDiscs(g) + ')');
ok((g.hand.Asha||[]).length === 3, 'the bidder comes back with three, not one');
ok(g.stack.Asha.length === 0 && g.flips.length === 0, 'the table is cleared');
ok(g.log[0].outcome === 'bust' && g.log[0].removed, 'the bust is logged with what was lost');

// four busts in a row and you are out
g = { players:P4, lost:{}, wins:{}, target:2, bidder:'Asha', bid:1,
      hand:{ Asha:['p'], Bilal:['p'], Chetan:['p'], Devi:['p'] },
      stack:{ Asha:[], Bilal:[], Chetan:[], Devi:[] }, flips:[], log:[] };
g = FD.bust(g);
ok(g.lost.Asha === true, 'losing your last disc puts you out');

g = { players:['Asha','Bilal'], lost:{ Bilal:true }, wins:{}, target:2, bidder:'Asha', bid:1,
      hand:{ Asha:['p','p'], Bilal:[] }, stack:{ Asha:[], Bilal:[] }, flips:[], log:[] };
g = FD.bust(g);
ok(g.winner === 'Asha', 'being the last one standing wins it');

head('Face Down — making the bet');
g = { players:P4, lost:{}, wins:{ Asha:1 }, target:2, bidder:'Asha', bid:3,
      hand:{ Asha:[], Bilal:['p'], Chetan:['p'], Devi:['p'] },
      stack:{ Asha:[], Bilal:['p'], Chetan:['p'], Devi:['p'] },
      flips:[ {player:'Asha',disc:'p'},{player:'Asha',disc:'p'},{player:'Asha',disc:'p'} ],
      log:[] };
const beforeWin = totalDiscs(g);
g = FD.succeed(g);
ok(g.wins.Asha === 2, 'a made bet counts');
ok(g.winner === 'Asha', 'and reaching the target wins the game');
ok(totalDiscs(g) === beforeWin, 'making a bet destroys nothing either');
ok(g.stack.Bilal.length === 0 && g.hand.Bilal.length === 2, 'everyone gets their discs back');

head('Face Down — how many are on the table');
ok(FD.totalOnTable({ players:P4, lost:{}, stack:{ Asha:['p','p'], Bilal:['p'], Chetan:[], Devi:['p'] } }) === 4,
   'only hidden discs count towards a bet');
ok(FD.totalOnTable({ players:P4, lost:{ Asha:true }, stack:{ Asha:['p','p'], Bilal:['p'], Chetan:[], Devi:[] } }) === 1,
   'and discs belonging to a player who is out do not');

head('Face Down — discs are never destroyed by a stale tap');
/* nextHand() had no phase guard anywhere, and newHand() empties every stack on
   the stated precondition that returnAll() has already handed the discs back.
   A stale tap from a phone still on the result screen ran that against a hand
   in progress and the discs on the table simply ceased to exist. This is the
   same class as the bust() fault that returnAll() was written to fix — it was
   just still open on the one path that never got a guard. */
// totalDiscs() is defined above and counts flips too, which matters here:
// a disc already turned over is in neither a hand nor a stack.
function midHand(){
  let s = { phase:'setup', players:P4.slice(), hand:{}, stack:{}, lost:{}, wins:{},
            passed:[], flips:[], log:[], turn:0, bidder:null, bid:0, target:2,
            winner:null, outcome:null };
  FD.setG(s);
  FD.startGame();
  const g = FD.getG();
  // put one disc down for everybody, then two more, as a real hand would
  for (const p of P4){ g.stack[p] = [g.hand[p].pop()]; }
  g.stack[P4[1]].push(g.hand[P4[1]].pop());
  g.stack[P4[2]].push(g.hand[P4[2]].pop());
  g.phase = 'turn';
  FD.setG(g);
  return g;
}
let mid = midHand();
const before = totalDiscs(mid);
ok(before === 16, 'sixteen discs in a four-player hand (' + before + ')');
ok(FD.totalOnTable(mid) === 6, 'six of them are on the table');
FD.nextHand();
ok(totalDiscs(FD.getG()) === before,
   'a stale "Next hand" during the turn destroys nothing (' + totalDiscs(FD.getG()) + ')');
ok(FD.getG().phase === 'turn', 'and does not drag the room out of the hand');

mid = midHand(); mid.phase = 'flip'; mid.bidder = P4[0]; mid.bid = 3;
// a turned disc LEAVES the stack and lives in g.flips — build the state the
// way the game builds it, or the test is measuring its own arithmetic
mid.flips = [{ player:P4[0], disc: mid.stack[P4[0]].pop() }];
FD.setG(mid);
FD.nextHand();
ok(totalDiscs(FD.getG()) === 16, 'nor during a flip, which used to cost half the game');
ok((FD.getG().flips||[]).length === 1, 'and the flips already turned are still there');

mid = midHand(); mid.phase = 'result';
mid.log = [{ bidder:P4[0], bid:2, outcome:'made', removed:null, flips:[] }];
FD.returnAll(mid); FD.setG(mid);
FD.nextHand();
ok(FD.getG().phase === 'place', 'from the result screen it does start the next hand');
ok(totalDiscs(FD.getG()) === 16, 'with every disc still in the game');

head('Face Down — a ghost player cannot wedge the room');
/* An Add from a phone still on the setup screen inserted a name with no discs.
   alive() counted them, the place phase can only advance when everybody has
   placed, and they could never place — so no phone in the room had any action,
   and the place screen has no way back to setup. */
mid = midHand();
mid.phase = 'place';
FD.setG(mid);
FD.addNamed('Latecomer');
ok(!FD.getG().players.includes('Latecomer'), 'no seat is added after the deal');
FD.setMe('Asha');
FD.removePlayer('Bilal');
ok(FD.getG().players.includes('Bilal'), 'and no live player is removed mid-hand');
ok(totalDiscs(FD.getG()) === 16, 'so nobody\'s discs leave with them');

head('Face Down — the setup guards hold where it counts');
FD.setG({ phase:'setup', players:['Solo','Duo'], hand:{}, stack:{}, lost:{}, wins:{},
          passed:[], flips:[], log:[], turn:0, target:2, winner:null });
FD.startGame();
ok(FD.getG().phase === 'setup', 'three is really the minimum');
FD.setG({ phase:'setup', players:[], hand:{}, stack:{}, lost:{}, wins:{},
          passed:[], flips:[], log:[], turn:0, target:2, winner:null });
for (let i = 0; i < 12; i++) FD.addNamed('P' + i);
ok(FD.getG().players.length === 8, 'and eight is really the maximum');
FD.addNamed('P0');
ok(FD.getG().players.filter(x=>x==='P0').length === 1, 'a name cannot be seated twice');

head('Face Down — leaving mid-hand hands the discs back');
mid = midHand();
FD.setMe('Asha');
FD.setG(mid);
FD.backToSetup();
ok(FD.getG().phase === 'setup', '"Change players" does return to setup');
ok(FD.totalOnTable(FD.getG()) === 0, 'with nothing abandoned on the table');
ok(totalDiscs(FD.getG()) === 16, 'and all sixteen discs back in hands');

head('Face Down — which disc you lost is yours to know');
/* The result screen told all four phones whether the busted player gave up
   their thorn or a petal. Once the table knows the thorn is gone, that
   player's stack is safe to bid on for the rest of the game and the bluffing
   stops — it is the single most valuable fact in the game, and in the game
   this is built on the discard is face down. */
const page = fs.readFileSync(__dirname + '/face-down-online.html', 'utf8');
const resultBlock = page.slice(page.indexOf("const made = l && l.outcome === 'made'"),
                               page.indexOf('tableHTML(true)', page.indexOf("const made = l")));
ok(/lost a disc/.test(resultBlock), 'everyone is told a disc was lost');
ok(/me === l\.bidder/.test(resultBlock), 'but the kind is gated on being the one who lost it');
ok(!/l\.removed===THORN\?'thorn':'petal'\)\s*:\s*''\)\s*\+\s*'\.'/.test(resultBlock),
   'and the old unconditional reveal is gone');

// ════════════════════════════════════════════════════════════
//  FIBBERS
// ════════════════════════════════════════════════════════════
const fb = loader('fibbers-online.html');
const FB = build([
  fb.chunk('const KINDS = [', '\n];'),
  'const COPIES = 6;', 'const LOSE_AT = 4;',
  fb.chunk('const kindOf =', '\n'),
  fb.chunk('const counts =', '\n'),
  fb.chunk('const worst =', '\n'),
  fb.chunk('const kindsHeld =', '\n'),
  fb.fn('checkOut'),
], 'module.exports = { KINDS, COPIES, LOSE_AT, kindOf, counts, worst, kindsHeld, checkOut };');

head('Fibbers — the deck');
ok(FB.KINDS.length === 8, 'eight kinds');
ok(new Set(FB.KINDS.map(k=>k.k)).size === 8, 'with unique keys');
ok(FB.KINDS.every(k => k.name && k.em), 'each has a name and a face');
ok(FB.KINDS.length * FB.COPIES === 48, '48 cards in the deck');

head('Fibbers — counting a pile');
ok(FB.worst({ pile:{ A:['rat','rat','crow'] } }, 'A') === 2, 'worst() finds the biggest stack');
ok(FB.worst({ pile:{ A:[] } }, 'A') === 0, 'an empty pile is zero, not -Infinity');
ok(FB.kindsHeld({ pile:{ A:['rat','rat','crow'] } }, 'A') === 2, 'kindsHeld counts distinct kinds');

head('Fibbers — the three ways out');
function out(pile, hand){
  const g = { players:['A','B','C'], pile:{ A:pile }, hands:{ A:hand||['rat'] },
              loser:null, reason:'', phase:'result' };
  return FB.checkOut(g, 'A');
}
let r = out(['rat','rat','rat','rat']);
ok(r.loser === 'A' && /4 . Rat/.test(r.reason), 'four of a kind is out: ' + r.reason);
ok(r.phase === 'gameover', 'and ends the game');

r = out(['rat','rat','rat']);
ok(r.loser === null, 'three of a kind is survivable');
ok(r.phase === 'result', 'and leaves the phase alone — this is what broke the first draft');

r = out(FB.KINDS.map(k=>k.k));
ok(r.loser === 'A' && r.reason === 'one of every kind', 'one of every kind is out');

r = out(['rat'], []);
ok(r.loser === 'A' && r.reason === 'no cards left to play', 'an empty hand on your turn is out');

r = out([], ['rat','crow']);
ok(r.loser === null && r.phase === 'result', 'a clean player is not out');

head('Fibbers — calling');
// mirrors what call() does, which is a single boolean either way
function resolve(card, claim, saysTrue){
  const actuallyTrue = card === claim;
  return (saysTrue === actuallyTrue) ? 'giver' : 'caller';
}
ok(resolve('rat','rat',true)  === 'giver',  'truth called true: the giver takes it');
ok(resolve('rat','rat',false) === 'caller', 'truth called a lie: the caller takes it');
ok(resolve('rat','crow',false)=== 'giver',  'a lie called a lie: the giver takes it');
ok(resolve('rat','crow',true) === 'caller', 'a lie called true: the caller takes it');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
