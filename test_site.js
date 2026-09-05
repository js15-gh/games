/* Cross-cutting checks that no single game's suite can make.
 *
 * Every bug in here is one that was found in one game and then turned out to be
 * in most of them. A per-game suite cannot catch that shape, because the game it
 * covers is usually the one that was already fixed.
 *
 *   node test_site.js
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const html = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const all = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));

// a "game" is a page that talks to the shared state
const GAMES = all.filter(f => {
  const t = html(f);
  return t.includes('const GAME_ID =') && t.includes('rpc/game_save');
});
// playable pages = the games plus the lobby and group hub
const PLAYABLE = all.filter(f => /class="howto"|id="howto"/.test(html(f)));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const head = s => console.log('\n' + s);

head('The pages this file is about');
ok(GAMES.length >= 20, GAMES.length + ' game pages found');
ok(PLAYABLE.length >= 28, PLAYABLE.length + ' pages carry a how-to');

// ── 1. the group marker survives a restart ───────────────────
head('"Play again" must not drop the group a room belongs to');
/* Every restart rebuilds the state with structuredClone(FRESH), which loses
   _group unless it is carried over by hand. A room in a group then stops
   reporting to its scoreboard from the second game onward — silently, which is
   what makes it worth a test rather than a comment. Found in Judgement, then
   Tambola, then the other eighteen. */
function bodyOf(src, name){
  const m = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(src);
  if (!m) return null;
  let d = 0;
  for (let j = src.indexOf('{', m.index); j < src.length; j++){
    if (src[j] === '{') d++;
    else if (src[j] === '}'){ d--; if (!d) return src.slice(m.index, j + 1); }
  }
  return null;
}
const RESTARTS = ['playAgain', 'restart', 'resetAll', 'newGame'];
let checked = 0, dropped = [];
for (const f of GAMES){
  const src = html(f);
  for (const name of RESTARTS){
    const body = bodyOf(src, name);
    if (!body || !body.includes('structuredClone(FRESH)') || !body.includes('mutate(')) continue;
    checked++;
    if (!body.includes('_group')) dropped.push(f + ':' + name);
  }
}
ok(checked >= 20, checked + ' restart paths examined across ' + GAMES.length + ' games');
ok(dropped.length === 0, 'every one carries _group over' +
   (dropped.length ? ' — DROPPED BY: ' + dropped.join(', ') : ''));

// ── 2. player names in inline handlers ───────────────────────
head('A name with an apostrophe must not kill the button');
/* esc() turns ' into &#39;, which the browser decodes back to ' BEFORE the JS
   in an onclick is parsed — so the string terminates early and the handler dies
   silently. O'Brien did exactly this across ten files once. jss() is the one
   that belongs inside a handler. */
let escInHandler = [];
for (const f of all){
  const src = html(f);
  // ${esc( appearing between onclick=" and the closing quote
  const re = /on(?:click|change|input|keydown)="[^"]*\$\{\s*esc\s*\(/g;
  if (re.test(src)) escInHandler.push(f);
}
ok(escInHandler.length === 0,
   'no inline handler interpolates with esc()' +
   (escInHandler.length ? ' — FOUND IN: ' + escInHandler.join(', ') : ''));

/* The real rule is not "every game defines jss" — The Outsider passes a seat
   INDEX into its handlers (pickSeat(3)), which needs no escaping at all and is
   the more robust choice. The rule is that any value interpolated INSIDE the
   quotes of an inline handler must go through jss(). */
let rawInHandler = [];
/* Flagging every interpolation is too blunt — `nextLetter('${L}')` is a letter
   and `award('${t}')` is a team key, neither of which can hold an apostrophe.
   The bug class is specifically a PLAYER-SUPPLIED NAME reaching a handler, so
   look for the identifiers that actually carry one. */
const NAMEY = /\('\$\{\s*(p|n|name|player|who|nm|seat)\s*\}/;
// only the multiplayer pages: a solo puzzle has no player-supplied names, and
// its keypad renders key('${n}') where n is a digit from a literal array
for (const f of GAMES){
  const src = html(f);
  const re = /on(?:click|change|input|keydown)="[^"]{0,200}?\('\$\{[^}]*\}/g;
  let m;
  while ((m = re.exec(src)) !== null){
    const frag = m[0];
    if (!NAMEY.test(frag)) continue;          // a constant, not a typed name
    if (/\$\{\s*jss\s*\(/.test(frag)) continue;
    rawInHandler.push(f + ' -> ' + frag.slice(0, 70));
  }
}
ok(rawInHandler.length === 0,
   'every player name reaching an inline handler goes through jss()' +
   (rawInHandler.length ? ' — RAW: ' + rawInHandler.slice(0,4).join(' | ') : ''));

const withNames = GAMES.filter(f => /\('\$\{\s*jss\s*\(/.test(html(f)));
ok(withNames.every(f => html(f).includes('const jss =')),
   withNames.length + ' games pass a name into a handler, and every one defines jss()');

// ── 2b. backing out of a seat has to stick ──────────────────
head('"Not you?" must not put the phone straight back in that seat');
/* poll() re-seats from the remembered seat whenever `me` is falsy, so a handler
   that only clears `me` is undone within one poll — about a second. Tap the
   wrong name, see that player's private screen, tap "not you?", and a second
   later you are back in their seat reading their secret. The seat has to be
   forgotten, not just dropped. */
let seatNotForgotten = [];
for (const f of GAMES){
  const src = html(f);
  if (!/vpRecallSeat/.test(src)) continue;        // this game does not remember seats
  const re = /onclick="(me\s*=\s*null;[^"]*)"/g;
  let m;
  while ((m = re.exec(src)) !== null){
    if (!/vpForgetSeat/.test(m[1])) seatNotForgotten.push(f + ' -> ' + m[1].slice(0, 46));
  }
}
ok(seatNotForgotten.length === 0,
   'every "not you?" handler forgets the remembered seat' +
   (seatNotForgotten.length ? ' — DOES NOT: ' + seatNotForgotten.slice(0,4).join(' | ') : ''));

let leaveKeepsSeat = [];
for (const f of GAMES){
  const src = html(f);
  if (!/vpRecallSeat/.test(src)) continue;
  const body = bodyOf(src, 'leaveRoom');
  if (body && !/vpForgetSeat/.test(body)) leaveKeepsSeat.push(f);
}
ok(leaveKeepsSeat.length === 0,
   'and so does leaving the room' +
   (leaveKeepsSeat.length ? ' — DOES NOT: ' + leaveKeepsSeat.join(', ') : ''));

// ── 2c. a private card must not draw itself ─────────────────
head('A device-local reveal flag must be cleared when the phase moves remotely');
/* `peeked` means "I have looked at my own card" and lives on one phone. It is
   cleared by handlers that run on the phone that TAPPED — so when somebody else
   taps "Next round", every OTHER phone still had it set and drew the new
   round's secret unbidden, with no shoulder-check, while the phones were lying
   face-up on the table. */
let flagNotCleared = [];
for (const f of GAMES){
  const src = html(f);
  const flag = /\blet peeked\b/.test(src) ? 'peeked' : (/\blet peek\b/.test(src) ? 'peek' : null);
  if (!flag) continue;
  /* Check the PROPERTY, not one spelling of it. Inside poll(), the game must
     capture something about the state it is replacing and set the flag false
     when it differs. What it keys on is its own business: werewolf and the
     outsider use the phase, ito uses phase plus theme, fibbers uses the card in
     flight — all four correct for their game. My first version of this check
     matched three literal expressions and called the fourth a bug. */
  const poll = bodyOf(src, 'poll');
  // squash the whitespace so this needs no escaping and no guess about spacing
  const tight = poll ? poll.replace(/\s+/g, '') : '';
  const clears = !!poll
    && /\bconst was/.test(poll)
    && tight.includes(flag + '=false');
  if (!clears) flagNotCleared.push(f + ' (' + flag + ')');
}
ok(flagNotCleared.length === 0,
   'every game with a peek flag clears it on a remote change' +
   (flagNotCleared.length ? ' — DOES NOT: ' + flagNotCleared.join(', ') : ''));

// ── 3. the rules are reachable ───────────────────────────────
head('Rules must be reachable during a round, not just present on the page');
/* Every page carried a full how-to and not one had a link to it. It sits below
   the game, so mid-round on a phone you would scroll past the whole live board
   to find it. */
const noRules = PLAYABLE.filter(f => !html(f).includes('vp-rules.js'));
ok(noRules.length === 0,
   'every page with a how-to loads vp-rules.js' +
   (noRules.length ? ' — MISSING: ' + noRules.join(', ') : ''));
const noReport = PLAYABLE.filter(f => !html(f).includes('vp-report.js'));
ok(noReport.length === 0,
   'and every one loads vp-report.js' +
   (noReport.length ? ' — MISSING: ' + noReport.join(', ') : ''));

const noExample = PLAYABLE.filter(f => !/class="eg"/.test(html(f)));
ok(noExample.length === 0,
   'and every one carries a worked example' +
   (noExample.length ? ' — MISSING: ' + noExample.join(', ') : ''));

// ── 4. the pages that must never be indexed ──────────────────
head('Private pages stay out of search');
for (const f of ['feedback/index.html', 'admin/index.html']){
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { ok(false, f + ' is missing'); continue; }
  const src = fs.readFileSync(p, 'utf8');
  ok(/noindex/.test(src), f + ' is noindex');
  ok(/vp-no-report/.test(src), f + ' suppresses its own report button');
}
const robots = fs.readFileSync(path.join(DIR, 'robots.txt'), 'utf8');
for (const d of ['/feedback/', '/admin/', '/lobby.html'])
  ok(robots.includes('Disallow: ' + d), 'robots.txt disallows ' + d);
const sitemap = fs.readFileSync(path.join(DIR, 'sitemap.xml'), 'utf8');
ok(!/\/admin|\/feedback/.test(sitemap), 'and neither is in the sitemap');

// ── 5. every game is reachable from the front page ───────────
head('Every game is listed on the front page and in the sitemap');
const index = html('index.html');
const missingFromIndex = GAMES.filter(f => !index.includes("slug:'" + f + "'"));
ok(missingFromIndex.length === 0,
   'every game has an entry in the GAMES list' +
   (missingFromIndex.length ? ' — MISSING: ' + missingFromIndex.join(', ') : ''));
const missingFromSitemap = GAMES.filter(f => !sitemap.includes('/' + f));
ok(missingFromSitemap.length === 0,
   'and a sitemap entry' +
   (missingFromSitemap.length ? ' — MISSING: ' + missingFromSitemap.join(', ') : ''));

// ── 6. canonical and description on everything public ────────
head('Every public page has a canonical URL and a description');
const publicPages = all.filter(f => !/noindex/.test(html(f)));
const noCanon = publicPages.filter(f => !/rel="canonical"/.test(html(f)));
const noDesc = publicPages.filter(f => !/name="description"/.test(html(f)));
ok(noCanon.length === 0, 'canonical on all ' + publicPages.length +
   (noCanon.length ? ' — MISSING: ' + noCanon.join(', ') : ''));
ok(noDesc.length === 0, 'description on all of them' +
   (noDesc.length ? ' — MISSING: ' + noDesc.join(', ') : ''));

// ── 7. the anon key is the publishable one, everywhere ───────
head('No service key has ever been pasted into a page');
/* The pages ship their Supabase key in source on purpose — it is the
   publishable one and anon can call exactly two functions. A service_role key
   here would hand over the whole database. */
const leaked = all.filter(f => /service_role|"eyJ[A-Za-z0-9_-]{20,}/.test(html(f)));
ok(leaked.length === 0,
   'no page carries a service key or a raw JWT' +
   (leaked.length ? ' — FOUND IN: ' + leaked.join(', ') : ''));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
