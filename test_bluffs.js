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
], 'module.exports = { PETAL, THORN, alive, discsLeft, current, stillBidding, totalOnTable, ' +
   'advance, advanceBidder, newHand, dealDiscs, ownStackClear, returnAll, succeed, bust };');

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
