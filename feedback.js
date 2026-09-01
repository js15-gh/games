/* Shared end-of-game feedback panel.
 *
 * Asked AFTER the game, never before it — the moment a game is created has to
 * stay frictionless, and someone who has just enjoyed themselves is the only
 * person likely to answer honestly.
 *
 * Feedback deliberately does NOT go through the game's own Supabase RPC: a row
 * id there is guessable, and email addresses in a guessable place is a real
 * leak. Point this at a form service instead.
 *
 * To switch it on, set ONE of these:
 *   VP_FEEDBACK_ENDPOINT — a Formspree (or similar) URL; posts JSON.
 *   VP_FEEDBACK_EMAIL    — falls back to opening a pre-filled email.
 * With neither set the panel simply doesn't render, so nothing half-working
 * ships to players.
 */
window.VP_FEEDBACK_ENDPOINT = 'https://formspree.io/f/mqpkppdz';
window.VP_FEEDBACK_EMAIL    = '';          // mailto fallback, unused while the endpoint is set

(function(){
  const on = () => !!(window.VP_FEEDBACK_ENDPOINT || window.VP_FEEDBACK_EMAIL);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  window.vpFeedbackHTML = function(game){
    if (!on()) return '';
    return `
    <div class="panel" id="vpFb">
      <div class="eyebrow">Before you go</div>
      <p class="faint" style="font-size:14px;line-height:1.6;margin-top:6px">
        Two questions, both optional. We read every one.</p>

      <label class="faint" style="display:block;font-size:14px;margin-top:14px">
        What would you like to see improved?</label>
      <input id="vpImprove" placeholder="Anything that annoyed you" autocomplete="off"
             style="margin-top:6px">

      <label class="faint" style="display:block;font-size:14px;margin-top:14px">
        Any new game suggestion?</label>
      <input id="vpSuggest" placeholder="A game your family plays" autocomplete="off"
             style="margin-top:6px">

      <label class="faint" style="display:block;font-size:14px;margin-top:14px">
        Email, only if you'd like a reply or the occasional new game</label>
      <input id="vpEmail" type="email" placeholder="you@example.com" autocomplete="email"
             inputmode="email" style="margin-top:6px">

      <button class="btn-ghost full" onclick="vpSendFeedback('${esc(game)}')">Send feedback</button>
      <p class="faint center" id="vpFbMsg" style="font-size:13px;min-height:18px;margin:8px 0 0"></p>
    </div>`;
  };

  window.vpSendFeedback = async function(game){
    const val = id => (document.getElementById(id) || {}).value || '';
    const improve = val('vpImprove').trim();
    const suggest = val('vpSuggest').trim();
    const email   = val('vpEmail').trim();
    const msg = document.getElementById('vpFbMsg');
    const say = t => { if (msg) msg.textContent = t; };

    if (!improve && !suggest && !email){ say('Add a note first, or just close the page.'); return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ say('That email looks incomplete.'); return; }

    const payload = { game, improve, suggest, email,
                      page: location.pathname, at: new Date().toISOString() };

    if (window.VP_FEEDBACK_ENDPOINT){
      say('Sending…');
      try {
        const r = await fetch(window.VP_FEEDBACK_ENDPOINT, {
          method:'POST', headers:{'Content-Type':'application/json', 'Accept':'application/json'},
          body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error(r.status);
        const box = document.getElementById('vpFb');
        if (box) box.innerHTML = '<p class="center" style="margin:0;font-size:16px">' +
          'Thank you — that genuinely helps.</p>';
      } catch { say("Couldn't send that. Please try again in a moment."); }
      return;
    }

    // no endpoint configured: hand it to the mail client instead
    const body = [
      'Game: ' + game,
      '', 'What would you like to see improved?', improve || '—',
      '', 'Any new game suggestion?', suggest || '—',
      '', 'Reply to: ' + (email || '—')
    ].join('\n');
    location.href = 'mailto:' + window.VP_FEEDBACK_EMAIL +
      '?subject=' + encodeURIComponent('Feedback: ' + game) +
      '&body=' + encodeURIComponent(body);
    say('Opening your email app…');
  };
})();
