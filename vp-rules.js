/* A "how do you play this?" button on every page.
 *
 * Every game page already carries a full how-to — but it sits BELOW the game,
 * and a player mid-round on a phone would have to scroll past the whole live
 * board to find it, then scroll back and hope they have not lost their place.
 * In practice that means the rules might as well not be there. Somebody who
 * has forgotten what the Seer does, or whether they can follow suit, needs the
 * answer in one tap, during the round, without touching the game.
 *
 * So this lifts the page's own <section class="howto"> into an overlay. The
 * game underneath is never re-rendered and never scrolled, so reading the
 * rules cannot cost you your turn. There is nothing to keep in sync: whatever
 * the page says is what the panel shows.
 *
 * Pages opt out with <meta name="vp-no-report">, the same marker the report
 * button honours, and any page with no how-to simply gets no button.
 */
(function(){
  function source(){
    return document.querySelector('section.howto, #howto, .howto');
  }

  function css(){
    if (document.getElementById('vp-rules-css')) return;
    const s = document.createElement('style');
    s.id = 'vp-rules-css';
    s.textContent = `
      #vpRulesBtn { position:fixed; right:14px; bottom:66px; z-index:2147483000;
        width:44px; height:44px; border-radius:50%; border:1px solid rgba(128,128,128,.45);
        background:rgba(20,18,26,.86); color:#fff; font-size:19px; line-height:1;
        cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.32); }
      #vpRulesBtn:hover { background:#E08A1E; border-color:#E08A1E; }
      #vpRulesWrap { position:fixed; inset:0; z-index:2147483002; background:rgba(0,0,0,.55);
        display:flex; align-items:flex-end; justify-content:center; padding:14px; }
      #vpRulesBox { background:#FFF8EE; color:#2A2118; border-radius:14px;
        width:100%; max-width:560px; max-height:88vh; display:flex; flex-direction:column;
        font-family:system-ui,-apple-system,'Karla',sans-serif; overflow:hidden; }
      #vpRulesHead { display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:14px 16px 10px; border-bottom:1px solid #E7D9C4; flex:none; }
      #vpRulesHead b { font-size:16px; }
      #vpRulesBody { padding:4px 16px 16px; overflow:auto; -webkit-overflow-scrolling:touch; }
      #vpRulesBody h2 { font-size:17px; margin:16px 0 6px; }
      #vpRulesBody h3 { font-size:14.5px; margin:16px 0 4px; letter-spacing:.04em; }
      #vpRulesBody p, #vpRulesBody li { font-size:14.5px; line-height:1.62; color:#4A3F33; }
      #vpRulesBody ol, #vpRulesBody ul { padding-left:20px; margin:6px 0; }
      #vpRulesBody li { margin:5px 0; }
      #vpRulesBody b, #vpRulesBody strong { color:#2A2118; }
      #vpRulesBody .eg, #vpRulesBody .note { background:#fff; border:1px solid #E7D9C4;
        border-radius:10px; padding:12px 13px; margin:10px 0; }
      #vpRulesBody .facts { font-size:12.5px; color:#736451; margin-top:14px; }
      #vpRulesBody table { border-collapse:collapse; width:100%; font-size:13.5px; margin:8px 0; }
      #vpRulesBody th, #vpRulesBody td { text-align:left; padding:7px 8px;
        border-bottom:1px solid #EFE4D3; vertical-align:top; }
      #vpRulesBody th { font-size:11px; text-transform:uppercase; letter-spacing:.08em;
        color:#736451; }
      #vpRulesClose { background:#2A2118; color:#fff; border:none; border-radius:9px;
        padding:9px 14px; font-size:13.5px; font-weight:700; cursor:pointer; flex:none; }
      @media (min-width:560px){ #vpRulesWrap { align-items:center; } }
    `;
    document.head.appendChild(s);
  }

  function close(){
    const w = document.getElementById('vpRulesWrap');
    if (w) w.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e){ if (e.key === 'Escape') close(); }

  function open(){
    if (document.getElementById('vpRulesWrap')) return;
    const src = source();
    if (!src) return;
    css();
    const wrap = document.createElement('div');
    wrap.id = 'vpRulesWrap';
    wrap.innerHTML = `<div id="vpRulesBox" role="dialog" aria-modal="true" aria-label="How to play">
        <div id="vpRulesHead"><b>How to play</b>
          <button id="vpRulesClose" type="button">Back to the game</button></div>
        <div id="vpRulesBody"></div>
      </div>`;
    // the page's own rules, copied — never moved, so the page below is untouched
    const body = wrap.querySelector('#vpRulesBody');
    const copy = src.cloneNode(true);
    copy.removeAttribute('class');
    copy.removeAttribute('id');
    // the panel supplies its own heading
    const h2 = copy.querySelector('h2');
    if (h2 && /^how to play/i.test(h2.textContent.trim())){
      wrap.querySelector('#vpRulesHead b').textContent = h2.textContent.trim();
      h2.remove();
    }
    body.appendChild(copy);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('#vpRulesClose').onclick = close;
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    body.scrollTop = 0;
  }
  window.vpRulesOpen = open;

  function mount(){
    if (document.getElementById('vpRulesBtn')) return;
    if (document.querySelector('meta[name="vp-no-report"]')) return;
    if (!source()) return;                       // no rules on this page, no button
    css();
    const b = document.createElement('button');
    b.id = 'vpRulesBtn';
    b.type = 'button';
    b.title = 'How to play';
    b.setAttribute('aria-label', 'How to play');
    b.textContent = '📖';
    b.onclick = open;
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
