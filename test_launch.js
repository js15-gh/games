/* Does a game opened FROM THE LOBBY actually work?
 *
 * The lobby seats everyone once and every game opened after it reuses those
 * seats. It can only know one shape, so launch() writes
 * {phase:'setup', players:[...]} into the new room and leaves the rest to the
 * game. Most games keep their roster in `players` and are fine — but five keep
 * it in `teams` and one in `roster`, and those opened with every name INVISIBLE
 * while addPlayer still refused each one as "That name is taken", because the
 * name is in g.players. No sequence of taps reached a playable game.
 *
 * That is six of the twenty tiles the lobby offers, and no per-game suite could
 * find it: every one of them builds its own state and never sees what the lobby
 * actually writes.
 *
 *   node test_launch.js
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

// ── what the lobby actually writes ───────────────────────────
const lobby = read('lobby.html');
const seedLine = /const seeded = \{([^}]*)\}/.exec(lobby);
head('What the lobby seeds');
ok(!!seedLine, 'launch() still builds a seeded room object');
ok(/phase:\s*'setup'/.test(seedLine[1]), "it seeds phase:'setup'");
ok(/players:\s*roster/.test(seedLine[1]), 'and the roster as `players`');
ok(/_group:/.test(seedLine[1]), 'and the group marker');

// the tiles it offers
const TILES = [...lobby.matchAll(/file:\s*'([a-z0-9-]+\.html)'/g)].map(m => m[1]);
head('The games the lobby offers');
ok(TILES.length >= 18, TILES.length + ' tiles');
ok(TILES.every(f => fs.existsSync(path.join(DIR, f))), 'every tile points at a real page');

// ── lift each game's FRESH and hydrate, and launch into it ───
function gameModule(file){
  const src = read(file);
  const i = src.indexOf('const FRESH');
  if (i < 0) return null;
  const j = src.indexOf('};', i);
  const freshSrc = src.slice(src.indexOf('{', i), j + 1);

  // adoptSeeded, where the game has one, plus anything it leans on
  const parts = [];
  const teamNames = /const TEAM_NAMES = \[[^\]]*\];/.exec(src);
  if (teamNames) parts.push(teamNames[0]);
  /* FRESH is not always self-contained — START_SECONDS, START_LIVES and
     WINS_NEEDED are declared above it. Pull in any SHOUTY constant the literal
     actually mentions, rather than listing them here and finding out about the
     next one from a failure. */
  for (const id of new Set(freshSrc.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || [])){
    const decl = new RegExp('^const ' + id + ' = [^\\n]*;', 'm').exec(src);
    if (decl) parts.push(decl[0]);
  }
  const a = src.indexOf('function adoptSeeded(');
  if (a >= 0){
    let d = 0;
    for (let k = src.indexOf('{', a); k < src.length; k++){
      if (src[k] === '{') d++;
      else if (src[k] === '}'){ d--; if (!d){ parts.push(src.slice(a, k + 1)); break; } }
    }
  } else {
    parts.push('function adoptSeeded(g){ return g; }');
  }
  parts.push('const FRESH = ' + freshSrc + ';');
  parts.push('const hydrate = (s) => adoptSeeded(Object.assign(JSON.parse(JSON.stringify(FRESH)), s || {}));');
  parts.push('module.exports = { FRESH, hydrate };');
  const mod = { exports:{} };
  try { new Function('module', parts.join('\n'))(mod); } catch (e) { return { error: e.message }; }
  return mod.exports;
}

/* Where does this game keep the people? Read it off FRESH rather than from a
   list here, so a new game with a new shape is caught rather than assumed. */
function seatsOf(g){
  if (g.teams && typeof g.teams === 'object'){
    const names = Object.keys(g.teams);
    return names.reduce((n, t) => n + (g.teams[t] || []).length, 0);
  }
  if (Array.isArray(g.roster)) return g.roster.length;
  return Array.isArray(g.players) ? g.players.length : 0;
}

head('Every game the lobby offers opens with the people in it');
const ROSTER = ['Priya','Asha','Bilal','Chetan','Divya','Ekta'];
const seeded = { phase:'setup', players:ROSTER.slice(), _group:'ABC123', _stamp:1 };
const broken = [];
let checked = 0;

for (const file of TILES){
  const M = gameModule(file);
  if (!M){ continue; }
  if (M.error){ ok(false, file + ': ' + M.error); continue; }
  checked++;
  const g = M.hydrate(JSON.parse(JSON.stringify(seeded)));
  const seated = seatsOf(g);
  if (seated !== ROSTER.length) broken.push(file + ' (' + seated + '/' + ROSTER.length + ')');
  // and whatever shape it uses, the same six people are in it
  if (g.teams){
    const inTeams = Object.keys(g.teams).flatMap(t => g.teams[t] || []);
    if (new Set(inTeams).size !== inTeams.length) broken.push(file + ' (a name in two teams)');
    if (inTeams.some(p => !ROSTER.includes(p))) broken.push(file + ' (a name nobody added)');
  }
}
ok(checked >= 18, checked + ' games launched from a six-person lobby');
ok(broken.length === 0,
   'all six people are seated in every one' +
   (broken.length ? ' — NOT IN: ' + broken.join(', ') : ''));

head('And the group marker survives the launch');
const stillGrouped = TILES.filter(f => {
  const M = gameModule(f);
  return M && !M.error && M.hydrate(JSON.parse(JSON.stringify(seeded)))._group !== 'ABC123';
});
ok(stillGrouped.length === 0,
   'every launched room still belongs to its group' +
   (stillGrouped.length ? ' — LOST BY: ' + stillGrouped.join(', ') : ''));

head('Adopting never disturbs a game already under way');
/* The whole risk of doing this on the way in is that it fires on a room that is
   mid-game. It runs only in setup and only when the game's own roster is empty. */
let disturbed = [];
for (const file of TILES){
  const M = gameModule(file);
  if (!M || M.error) continue;
  const mid = M.hydrate({ phase:'playing', players:ROSTER.slice(),
                          teams:{ A:['Priya'], B:['Asha'] }, roster:['Priya'] });
  if (mid.teams && (mid.teams.A || []).length !== 1) disturbed.push(file + ' (teams)');
  if (Array.isArray(mid.roster) && mid.roster.length !== 1) disturbed.push(file + ' (roster)');
}
ok(disturbed.length === 0,
   'a room in play keeps the seats it has' +
   (disturbed.length ? ' — DISTURBED: ' + disturbed.join(', ') : ''));

let refilled = [];
for (const file of TILES){
  const M = gameModule(file);
  if (!M || M.error) continue;
  // setup, but the teams have already been arranged by hand
  const arranged = M.hydrate({ phase:'setup', players:ROSTER.slice(),
                               teams:{ A:['Priya','Asha','Bilal'], B:['Chetan'] } });
  if (arranged.teams && (arranged.teams.A || []).length !== 3) refilled.push(file);
}
ok(refilled.length === 0,
   'and teams somebody has already sorted are left alone' +
   (refilled.length ? ' — RESHUFFLED: ' + refilled.join(', ') : ''));

head('A table cleared on purpose stays cleared');
/* The first version of this fix guarded on "is the game's own roster empty",
   which cannot tell a table somebody has just emptied from one that was never
   seeded. adoptSeeded lives in hydrate() and runs on EVERY poll, so the lobby's
   six names came back within 2.5 seconds, with no message and no visible cause.
   It only bit The Round Table, because the five team games' removePlayer
   happens to clear g.players as well \u2014 a coincidence of those five
   implementations, not a rule. The marker records that a room has had its
   chance, once. */
let reseeded = [];
for (const file of TILES){
  const M = gameModule(file);
  if (!M || M.error) continue;
  // a room the lobby seeded, which somebody has since emptied by hand
  const cleared = M.hydrate({ phase:'setup', players:ROSTER.slice(), _seated:true,
                              teams:{A:[],B:[]}, roster:[] });
  const seats = seatsOf(cleared);
  if (seats !== 0) reseeded.push(file + ' (' + seats + ' came back)');
}
ok(reseeded.length === 0,
   'no game re-seeds a table that has already been taken up' +
   (reseeded.length ? ' \u2014 RE-SEEDED: ' + reseeded.join(', ') : ''));

let unmarked = [];
for (const file of TILES){
  const M = gameModule(file);
  if (!M || M.error) continue;
  const g = M.hydrate(JSON.parse(JSON.stringify(seeded)));
  if (seatsOf(g) && !g._seated && (g.teams || Array.isArray(g.roster))) unmarked.push(file);
}
ok(unmarked.length === 0,
   'and every game that adopts marks the room, so it happens exactly once' +
   (unmarked.length ? ' \u2014 UNMARKED: ' + unmarked.join(', ') : ''));


// ── the lobby's own behaviour ────────────────────────────────
function lobbyFn(name){
  let a = lobby.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('no ' + name);
  if (lobby.slice(a - 6, a) === 'async ') a -= 6;
  let d = 0;
  for (let j = lobby.indexOf('{', a); j < lobby.length; j++){
    if (lobby[j] === '{') d++;
    else if (lobby[j] === '}'){ d--; if (!d) return lobby.slice(a, j + 1); }
  }
}
const L = (() => {
  const mod = { exports:{} };
  new Function('module', [
    /const HOST_QUIET = \d+;/.exec(lobby)[0],
    lobbyFn('hostIsQuiet'),
    'module.exports = { hostIsQuiet };'
  ].join('\n'))(mod);
  return mod.exports;
})();

head('The chair cannot be taken from a host who is sitting right there');
/* hostIsQuiet read "no heartbeat yet" as "gone quiet". vp.js beats every thirty
   seconds, so somebody who had just created a lobby had not had time to beat —
   and every other phone showed "has gone quiet, take over" from the first
   second. Falling back to when the chair was taken fixes it without weakening
   the escape hatch, which is the thing that makes host-authority safe here. */
const now = Date.now();
ok(L.hostIsQuiet({}) === true, 'a lobby with no host at all is open');
ok(L.hostIsQuiet({ host:'Asha', _hostAt: now }) === false,
   'a host who has just taken the chair is NOT quiet');
ok(L.hostIsQuiet({ host:'Asha', _seen:{ Asha: now } }) === false,
   'nor one that is beating normally');
ok(L.hostIsQuiet({ host:'Asha', _seen:{ Asha: now - 180000 } }) === true,
   'but three minutes of silence does open the chair');
ok(L.hostIsQuiet({ host:'Asha', _hostAt: now - 180000 }) === true,
   'and so does taking it and then vanishing');

head('The lobby keeps what you are in the middle of');
/* render() replaces the whole of #app, and with six phones each beating every
   thirty seconds that is every few seconds — on the one screen where every name
   on the site gets typed. Every game page already preserved this; the lobby was
   the single file that did not. */
ok(/id="nameInput"[^>]*value=/.test(lobby),
   'the name box carries its value across a re-render');
ok(/oninput="nameDraft=/.test(lobby), 'and records what is typed as it is typed');
const detailsTags = lobby.match(/<details[^>]*>/g) || [];
ok(detailsTags.length > 0 && detailsTags.every(d => /ontoggle=/.test(d)),
   'and every panel remembers whether it was open (' + detailsTags.length + ')');

head('Every way into the lobby leaves a usable page');
/* boot() sends a URL code straight into joinLobby, whose failures drew nothing
   at all — so a code truncated in a group chat, or last week's link after the
   nightly purge, left the visitor on "Reading the lobby…" for ever with no way
   to start one or type a code by hand. */
const join = lobbyFn('joinLobby');
const returns = (join.match(/return;/g) || []).length;
const recovers = (join.match(/renderStart\(\);/g) || []).length;
ok(returns > 0 && recovers === returns,
   'every early return from joinLobby draws the start screen first (' +
   recovers + '/' + returns + ')');

head('Host and roster changes belong to somebody at the table');
for (const name of ['removePlayer', 'claimHost']){
  const body = lobbyFn(name);
  ok(/if \(!me\)/.test(body), name + ' refuses a phone with no seat');
  ok(/roster \|\| \[\]\)\.includes\(me\)/.test(body),
     name + ' refuses a phone whose name has left the table');
}
ok(/_hostAt = Date\.now\(\)/.test(lobbyFn('claimHost')),
   'claiming the chair stamps when it changed hands, so it cannot be taken straight back');

head('The lobby does not promise things it cannot do');
/* It said the host's pick "opens on your phone too". location.href appears once
   in the file and runs only on the launching phone. */
ok(!/opens on your phone too/.test(lobby),
   'the false claim that a launch navigates every phone is gone');
ok((lobby.match(/location\.href/g) || []).length <= 1,
   'and there is still only one navigation in the file, on the phone that launched');


console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
