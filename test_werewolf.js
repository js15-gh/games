/* Tests for Werewolf / Mafia / Traitors.
 *
 * This game hides information for a living, so the tests are mostly about the
 * things that would quietly ruin it: a role deal that can hand the wolves an
 * unwinnable or already-won game, a shield that saves twice, a night that
 * resolves before everyone has acted, a vote that ignores the dagger, or a
 * win condition that fires a round late.
 *
 *   node test_werewolf.js
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/werewolf-mafia-traitors.html', 'utf8');

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
  chunk('const THEMES = {', '\n};'),
  'let G = null;',
  'const TH = () => THEMES[(G && G.theme) || "werewolf"];',
  chunk('const TOKENS = {', '\n};'),
  chunk('const living =', '\n'), chunk('const evils  =', '\n'), chunk('const goods  =', '\n'),
  chunk('const isEvil =', '\n'), chunk('const hasTok =', '\n'), chunk('const voteWeight =', '\n'),
  fn('recruitable'), fn('narratorSeed'),
  fn('nightActors'), fn('nightReady'),
  fn('specialsNeeded'), fn('setupProblem'),
  fn('shuffle'), fn('assignRoles'), fn('beginNight'),
  fn('resolveNight'), fn('resolveDay'), fn('checkWin'),
  'module.exports = { THEMES, TOKENS, living, evils, goods, isEvil, hasTok, voteWeight,' +
  ' nightActors, nightReady, recruitable, narratorSeed, setupProblem, shuffle, assignRoles,' +
  ' beginNight, resolveNight,' +
  ' resolveDay, checkWin, setG:(g)=>{ G=g; } };'
].join('\n'))(mod);
const M = mod.exports;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

const P8 = ['A','B','C','D','E','F','G','H'];
function base(over){
  const g = Object.assign({
    theme:'werewolf', players:P8.slice(), evilCount:2,
    use:{ dagger:false, shield:false, mask:false, lantern:false },
    seer:false, doctor:false, recruit:false, revealOnDeath:true,
    round:1, roles:{}, tokens:{}, masked:{}, alive:{}, seen:{},
    seerOf:null, doctorOf:null,
    nightPicks:{}, seerPick:null, doctorPick:null, recruitPick:null,
    victim:null, savedBy:null, attacked:null, recruited:null,
    votes:{}, banished:null, lanternShown:{}, usedShield:{}, usedLantern:{},
    log:[], winner:null
  }, over || {});
  P8.forEach(p => { if (g.alive[p] === undefined) g.alive[p] = true; });
  M.setG(g);
  return g;
}

// ── 1. the three names ───────────────────────────────────────
head('One game, three names');
const keys = Object.keys(M.THEMES);
ok(keys.length === 3, 'three themes');
ok(keys.every(k => { const t = M.THEMES[k];
  return t.game && t.evil && t.evils && t.good && t.goods && t.verb && t.place && t.night
      && Array.isArray(t.title) && t.title.length === 2; }),
  'every theme names both sides, the verb, the place and the title halves');
ok(new Set(keys.map(k=>M.THEMES[k].evil)).size === 3, 'the evil side is named differently in each');

// ── 2. setup validation ──────────────────────────────────────
head('Refusing a broken table');
ok(M.setupProblem(base({ players:['A','B','C','D'] })), 'four players is refused');
ok(!M.setupProblem(base({ players:P8.slice(0,5), evilCount:1 })), 'five with one wolf is fine');
ok(M.setupProblem(base({ evilCount:0 })), 'zero wolves is refused');
ok(M.setupProblem(base({ players:P8.slice(0,6), evilCount:3 })),
   'three wolves among six is refused — they would already have won');
ok(M.setupProblem(base({ players:P8.slice(0,5), evilCount:2 })),
   'two among five is refused — one night kill and the wolves win before anybody votes');
ok(!M.setupProblem(base({ players:P8.slice(0,6), evilCount:2 })),
   'two among six is allowed — the village still gets a vote after the first night');
ok(M.setupProblem(base({ players:P8.slice(0,7), evilCount:3 })),
   'three among seven is refused for the same reason');
ok(!M.setupProblem(base({ players:P8, evilCount:3 })), 'three among eight is allowed');
ok(!M.setupProblem(base({ players:P8.slice(0,5), evilCount:1, seer:true, doctor:true })),
   'five with one wolf, a Seer and a Doctor is allowed — two plain villagers left');
ok(M.setupProblem(base({ players:P8.slice(0,5), evilCount:2, seer:true, doctor:true })),
   'but two wolves among five is still refused whatever roles are on');

// ── 3. dealing ───────────────────────────────────────────────
head('Dealing roles and tokens');
let evilCounts = new Set(), tokensOnEvil = 0, dupTokens = 0, maskSelf = 0, allAlive = 0;
for (let i = 0; i < 400; i++){
  const g = base({ evilCount:2, use:{ dagger:true, shield:true, mask:true, lantern:true },
                   seer:true, doctor:true });
  M.assignRoles(g);
  evilCounts.add(M.evils(g).length);
  for (const p of P8) if (M.isEvil(g,p) && (g.tokens[p]||[]).length) tokensOnEvil++;
  const handed = Object.values(g.tokens).flat();
  if (new Set(handed).size !== handed.length) dupTokens++;
  for (const p of Object.keys(g.masked)) if (g.masked[p] === p) maskSelf++;
  if (P8.every(p => g.alive[p])) allAlive++;
  if (g.seerOf && M.isEvil(g, g.seerOf)) tokensOnEvil++;
  if (g.doctorOf && M.isEvil(g, g.doctorOf)) tokensOnEvil++;
  if (g.seerOf && g.seerOf === g.doctorOf) dupTokens++;
}
ok([...evilCounts].join() === '2', 'exactly the requested number of wolves, every time');
ok(tokensOnEvil === 0, 'no token, Seer or Doctor ever lands on a wolf (400 deals)');
ok(dupTokens === 0, 'no token is dealt twice, and Seer and Doctor are different people');
ok(maskSelf === 0, 'the mask never shows you yourself');
ok(allAlive === 400, 'everybody starts alive');

const spread = {};
for (let i = 0; i < 600; i++){
  const g = base(); M.assignRoles(g);
  for (const p of P8) if (M.isEvil(g,p)) spread[p] = (spread[p]||0) + 1;
}
const counts = P8.map(p => spread[p] || 0);
ok(Math.min(...counts) > 90, 'the deal is not biased towards particular seats (' +
   Math.min(...counts) + '–' + Math.max(...counts) + ' of 600)');

// ── 4. the night resolves only when everyone has acted ───────
head('The night waits for everyone');
let g = base({ roles:{A:'evil',B:'evil',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'} });
ok(!M.nightReady(g), 'not ready before either wolf has picked');
g.nightPicks = { A:'C' };
ok(!M.nightReady(g), 'not ready when only one wolf has picked');
g.nightPicks = { A:'C', B:'C' };
ok(M.nightReady(g), 'ready when both have');

g = base({ roles:{A:'evil',B:'evil',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'},
           seer:true, seerOf:'C', doctor:true, doctorOf:'D',
           nightPicks:{ A:'E', B:'E' } });
ok(!M.nightReady(g), 'not ready while the Seer and Doctor still owe an action');
g.seerPick = 'A';
ok(!M.nightReady(g), 'still not ready with only the Seer done');
g.doctorPick = 'E';
ok(M.nightReady(g), 'ready once all three have acted');
ok(M.nightActors(g).length === 4, 'four people act on this night (two wolves, Seer, Doctor)');

g = base({ roles:{A:'evil',B:'evil',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'},
           seer:true, seerOf:'C', alive:{A:true,B:true,C:false,D:true,E:true,F:true,G:true,H:true},
           nightPicks:{ A:'E', B:'E' } });
ok(M.nightReady(g), 'a dead Seer is not waited for');

// ── 5. who dies ──────────────────────────────────────────────
head('Resolving the night');
function night(over){
  const g = base(Object.assign({ roles:{A:'evil',B:'evil',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'} }, over));
  return M.resolveNight(g);
}
let r = night({ nightPicks:{ A:'E', B:'E' } });
ok(r.victim === 'E' && r.alive.E === false, 'both wolves agreeing takes that person');
ok(r.attacked === 'E', 'and the attack is recorded even so');

r = night({ nightPicks:{ A:'E', B:'F' } });
ok(['E','F'].includes(r.victim), 'a split is broken to one of the two named');
ok(r.victim !== null, 'a split never means nobody dies');

r = night({ nightPicks:{ A:'E', B:'E' }, doctor:true, doctorOf:'D', doctorPick:'E' });
ok(r.victim === null && r.savedBy === 'doctor' && r.alive.E === true,
   'the Doctor protecting the target saves them');

r = night({ nightPicks:{ A:'E', B:'E' }, doctor:true, doctorOf:'D', doctorPick:'F' });
ok(r.victim === 'E', 'protecting somebody else saves nobody');

r = night({ nightPicks:{ A:'E', B:'E' }, tokens:{ E:['shield'] } });
ok(r.victim === null && r.savedBy === 'shield', 'the shield saves');
ok(r.usedShield.E === true, 'and is spent');

r = night({ nightPicks:{ A:'E', B:'E' }, tokens:{ E:['shield'] }, usedShield:{ E:true } });
ok(r.victim === 'E', 'a spent shield saves nobody the second time');

r = night({ nightPicks:{ A:'C', B:'C' }, seer:true, seerOf:'D', seerPick:'A' });
ok(r.seerResult && r.seerResult.who === 'A' && r.seerResult.evil === true,
   'the Seer is told the truth about a wolf');
r = night({ nightPicks:{ A:'C', B:'C' }, seer:true, seerOf:'D', seerPick:'E' });
ok(r.seerResult.evil === false, 'and about a villager');

head('Recruiting');
r = night({ roles:{A:'evil',B:'good',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'},
            recruit:true, recruitPick:'D', nightPicks:{} });
ok(r.recruited === 'D' && r.roles.D === 'evil', 'the last wolf can turn somebody');
ok(r.victim === null, 'and nobody dies that night');
ok(r.alive.D === true, 'the recruit is very much alive');

/* The night gate is the one place this game can STOP. nightPick dispatches on
   isEvil FIRST, so a special who has turned can never write their pick — and a
   gate that still waits for it hangs the room with no button on any phone. The
   suite used to write g.seerPick straight into the state, which is exactly the
   step that hid this. writePick() below goes through the real dispatch. */
head('The night can always finish — recruiting must never hang the room');

function writePick(g, who, target){          // mirrors nightPick's ordering
  if (M.isEvil(g, who)) g.nightPicks[who] = target;
  else if (g.seerOf === who) g.seerPick = target;
  else if (g.doctorOf === who) g.doctorPick = target;
}

let g2 = base({ seer:true, doctor:true, recruit:true, seerOf:'C', doctorOf:'D',
                roles:{A:'evil',B:'good',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'} });
const rec = M.recruitable(g2);
ok(!rec.includes('C'), 'the Seer cannot be turned');
ok(!rec.includes('D'), 'nor the Doctor');
ok(!rec.includes('A'), 'nor another wolf');
ok(rec.length === 5 && rec.every(p => g2.roles[p] === 'good'),
   'everyone else is fair game (' + rec.join(',') + ')');

// the deadlock itself: force the state the grid now refuses to produce, and
// prove the gate no longer waits on somebody who cannot answer
g2 = base({ seer:true, doctor:true, seerOf:'C', doctorOf:'D',
            roles:{A:'evil',B:'evil',C:'evil',D:'good',E:'good',F:'good',G:'good',H:'good'} });
for (const p of M.living(g2)) writePick(g2, p, 'E');
ok(M.nightReady(g2), 'a turned Seer is not waited on — this used to hang forever');
g2 = base({ seer:true, doctor:true, seerOf:'C', doctorOf:'D',
            roles:{A:'evil',B:'evil',C:'good',D:'evil',E:'good',F:'good',G:'good',H:'good'} });
for (const p of M.living(g2)) writePick(g2, p, 'E');
ok(M.nightReady(g2), 'and neither is a turned Doctor');
const acts = M.nightActors(g2);
ok(acts.filter(p => p === 'D').length === 1,
   'a turned Doctor is listed once — as a wolf, never twice and never as the Doctor');
ok(M.nightReady(base(Object.assign(JSON.parse(JSON.stringify(g2)), { nightPicks:{} }))) === false,
   'and the night still waits for that wolf to choose');

// and resolveNight repairs the binding even if a state arrives holding one
g2 = base({ seer:true, seerOf:'D', recruit:true, recruitPick:'D',
            roles:{A:'evil',B:'good',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'} });
g2 = M.resolveNight(g2);
ok(g2.roles.D === 'evil' && g2.seerOf === null,
   'recruiting the Seer through a hand-made state unbinds the role rather than hanging');

head('Two hundred games that all use recruiting, played through the real dispatch');
let hung = 0, finished = 0, recruits = 0;
for (let s = 0; s < 200; s++){
  let g = base({ evilCount:1, recruit:true, seer: s % 2 === 0, doctor: s % 3 === 0,
                 use:{ dagger:true, shield:true, mask:true, lantern:true } });
  M.assignRoles(g);
  g = M.beginNight(g);
  let guard = 0;
  while (!g.winner && guard++ < 60){
    const wolves = M.evils(g);
    // the last wolf recruits whenever it can, which is the path that used to hang
    const canRecruit = wolves.length === 1 && M.recruitable(g).length;
    if (canRecruit && guard % 2 === 1){
      g.recruitPick = M.recruitable(g)[0];
      recruits++;
      for (const p of wolves) g.nightPicks[p] = null;
    } else {
      const targets = M.goods(g);
      if (!targets.length) break;
      for (const p of wolves) writePick(g, p, targets[0]);
    }
    for (const p of M.living(g)) if (!M.isEvil(g, p)) writePick(g, p, M.living(g)[0]);
    if (!M.nightReady(g)){ hung++; break; }
    g = M.resolveNight(g);
    if (g.winner) break;
    g.votes = {};
    const alive = M.living(g);
    for (const p of alive) g.votes[p] = alive[(alive.indexOf(p) + 1) % alive.length];
    g = M.resolveDay(g);
    if (g.winner) break;
    g = M.beginNight(g);
  }
  if (g.winner) finished++;
}
ok(hung === 0, 'no game ever reached a night that could not be resolved (' + hung + ' hung)');
ok(recruits > 100, 'and recruiting really was exercised (' + recruits + ' recruits)');
ok(finished > 190, 'nearly all of them reached a winner (' + finished + '/200)');

head('The narrator is drawn the same way every time the callback runs');
/* commit() re-runs its callback against fresh state when a concurrent write
   lands. Math.random() here handed the round to a second phone after the first
   had started speaking. */
const up = ['A','B','C','D','E'];
ok(M.narratorSeed(3, up) === M.narratorSeed(3, up), 'same round and same table, same draw');
ok(M.narratorSeed(3, up) !== M.narratorSeed(4, up), 'a new round draws again');
ok(M.narratorSeed(3, up) !== M.narratorSeed(3, ['A','B','C','D']),
   'and so does a table that has lost somebody');
const drawn = {};
for (let r = 1; r <= 400; r++) drawn[up[M.narratorSeed(r, up) % up.length]] = 1;
ok(Object.keys(drawn).length === 5, 'over 400 rounds every seat gets the job');

let same = 0;
for (let r = 1; r <= 200; r++){
  let g = base({ round:r });
  g.alive = {}; up.forEach(p => g.alive[p] = true); g.players = up.slice();
  const a = M.beginNight(Object.assign({}, g, { round:r - 1 })).narrator;
  const b = M.beginNight(Object.assign({}, g, { round:r - 1 })).narrator;
  if (a !== b) same++;
}
ok(same === 0, 'beginNight run twice on the same state names the same narrator');

// ── 6. the day vote ──────────────────────────────────────────
head('The day vote');
function day(over){
  const g = base(Object.assign({ roles:{A:'evil',B:'evil',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'} }, over));
  return M.resolveDay(g);
}
r = day({ votes:{ A:'C', B:'C', C:'A', D:'C', E:'A', F:'A', G:'C', H:'C' } });
ok(r.banished === 'C', 'a clear plurality is banished — five for C against three for A');
r = day({ votes:{ A:'C', B:'C', C:'C', D:'C', E:'A', F:'A', G:'A', H:'B' } });
ok(r.banished === 'C' && r.alive.C === false, 'the most-voted goes out');

r = day({ votes:{ A:'C', B:'C', C:'A', D:'A', E:'B', F:'B', G:'D', H:'D' } });
ok(r.banished === null, 'a four-way tie banishes nobody');

r = day({ tokens:{ E:['dagger'] },
          votes:{ A:'C', B:'C', C:'F', D:'F', E:'F', F:'A', G:'A', H:'A' } });
ok(r.banished === 'F', 'the dagger turns a three-all-three into a win for F (' +
   JSON.stringify(r.log[0].tally) + ')');
ok(M.voteWeight({tokens:{E:['dagger']}}, 'E') === 2, 'a dagger holder is worth two');
ok(M.voteWeight({tokens:{}}, 'E') === 1, 'everybody else is worth one');

r = day({ votes:{ A:'C', B:'C', C:'A', D:'C', E:'A', F:'A', G:'C', H:'A' },
          alive:{A:true,B:true,C:true,D:true,E:true,F:true,G:true,H:false} });
const cast = Object.values(r.log[0].tally).reduce((a,b)=>a+b,0);
ok(cast === 7, 'a dead player’s vote is not counted — seven cast, not eight (' + cast + ')');
ok(M.living(r).length + (r.banished?1:0) === 7, 'and only seven were ever in the room');

// ── 7. winning ───────────────────────────────────────────────
head('When it ends');
function win(roles, alive){
  const g = base({ roles, alive });
  return M.checkWin(g);
}
r = win({A:'evil',B:'good',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'},
        {A:false,B:true,C:true,D:true,E:true,F:true,G:true,H:true});
ok(r.winner === 'good' && r.phase === 'gameover', 'the last wolf going out ends it for the village');

r = win({A:'evil',B:'evil',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'},
        {A:true,B:true,C:true,D:true,E:false,F:false,G:false,H:false});
ok(r.winner === 'evil', 'two wolves and two villagers is a wolf win — they cannot be outvoted');

r = win({A:'evil',B:'evil',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'},
        {A:true,B:true,C:true,D:true,E:true,F:false,G:false,H:false});
ok(r.winner === null, 'two against three is still a game');

r = win({A:'evil',B:'good',C:'good',D:'good',E:'good',F:'good',G:'good',H:'good'},
        {A:true,B:true,C:false,D:false,E:false,F:false,G:false,H:false});
ok(r.winner === 'evil', 'one against one is a wolf win');

// ── 8. a whole game, many times over ─────────────────────────
head('Two hundred games played to a finish');
let stuck = 0, ended = 0, badState = 0, evilWins = 0, goodWins = 0, rounds = 0;
for (let s = 0; s < 200; s++){
  let g = base({ evilCount: 1 + (s % 2), use:{ dagger:true, shield:true, mask:true, lantern:false },
                 seer: s % 3 === 0, doctor: s % 4 === 0, recruit: s % 5 === 0 });
  M.assignRoles(g);
  g = M.beginNight(g);
  let guard = 0;
  while (!g.winner && guard++ < 60){
    // wolves all pick the same living villager
    const targets = M.goods(g);
    const pick = targets[Math.floor(Math.random()*targets.length)];
    for (const p of M.evils(g)) g.nightPicks[p] = pick;
    if (g.seer && g.seerOf && g.alive[g.seerOf]) g.seerPick = M.living(g)[0];
    if (g.doctor && g.doctorOf && g.alive[g.doctorOf]) g.doctorPick = M.living(g)[0];
    if (!M.nightReady(g)){ badState++; break; }
    g = M.resolveNight(g);
    if (g.winner) break;
    // everybody votes for a random living player
    g.votes = {};
    for (const p of M.living(g)){
      const opts = M.living(g);
      g.votes[p] = opts[Math.floor(Math.random()*opts.length)];
    }
    g = M.resolveDay(g);
    if (g.winner) break;
    g = M.beginNight(g);
  }
  if (!g.winner) stuck++; else { ended++; rounds += g.round; }
  if (g.winner === 'evil') evilWins++;
  if (g.winner === 'good') goodWins++;
  // the state must stay coherent whatever happened
  if (M.living(g).some(p => g.alive[p] === false)) badState++;
  if (Object.keys(g.roles).length !== 8) badState++;
  if (g.winner === 'good' && M.evils(g).length) badState++;
  if (g.winner === 'evil' && M.evils(g).length < M.goods(g).length) badState++;
}
ok(stuck === 0, 'every one of 200 games reached a winner (' + stuck + ' stuck)');
ok(badState === 0, 'the state stayed coherent throughout (' + badState + ' problems)');
ok(evilWins > 0 && goodWins > 0,
   'both sides win sometimes — village ' + goodWins + ', wolves ' + evilWins);
ok(rounds / ended < 12, 'games finish in a sane number of rounds (' + (rounds/ended).toFixed(1) + ')');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
