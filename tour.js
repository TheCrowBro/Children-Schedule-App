'use strict';
/* The tutorial: a short tour of a screen. A highlight box glides from one button to the next while the rest of the screen dims, and a card
   says what the button does and why it's there. Each screen has its own tour behind the ? in the header; the home screen's also starts
   by itself the first time (remembered on this phone). The steps live with the screens (app.js); this file only shows them. */
const Tour = (() => {
  const KEY = 'll.tours';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  /** Remember that a screen's tour has been seen on this phone. */
  const mark = id => { try { const s = read(); s[id] = 1; localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: it may show again */ } };
  const seen = id => !!read()[id];
  const shown = el => !!el && el.getClientRects().length > 0;
  const find = sel => [...document.querySelectorAll(sel)].find(shown) || null;   // (the first one on the screen: not one folded away in a twirl-down)
  let cur = null;

  /** Put the box around the step's button and the card above or below it, clear of the screen edges. */
  function place() {
    if (!cur) return;
    const el = find(cur.steps[cur.i].sel); if (!el) return;
    const r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight, pad = 6;
    const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), w = Math.min(vw - 4, r.right + pad) - x, h = Math.min(vh - 4, r.bottom + pad) - y;
    Object.assign(cur.box.style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px' });
    const th = cur.tip.offsetHeight, below = y + h + 12, above = y - 12 - th;
    cur.tip.style.top = (below + th <= vh - 8 ? below : above >= 8 ? above : Math.max(8, vh - th - 8)) + 'px';
  }
  function go(i) {
    const { steps } = cur;
    while (i >= 0 && i < steps.length && !find(steps[i].sel)) i += i >= cur.i ? 1 : -1;   // skip what isn't on this screen
    if (i < 0) i = cur.i;
    if (i >= steps.length) return end(true);
    cur.i = i;
    const s = steps[i], el = find(s.sel);
    // a step inside a closed twirl-down (a chart on the Stats page): open it, or the card would point below the screen
    for (let d = el.closest('details:not([open])'); d; d = d.parentElement && d.parentElement.closest('details:not([open])')) d.open = true;
    const tall = el.getBoundingClientRect().height > window.innerHeight * 0.5;
    el.scrollIntoView({ block: tall ? 'start' : 'center' });
    cur.tip.querySelector('.tt-n').textContent = __('{n} of {total}', { n: i + 1, total: steps.length });
    cur.tip.querySelector('#tourT').textContent = s.title;
    cur.tip.querySelector('#tourW').textContent = s.why;
    cur.back.hidden = i === 0; cur.next.textContent = i === steps.length - 1 ? __('Done') : __('Next');
    cur.box.classList.remove('pulse'); void cur.box.offsetWidth; cur.box.classList.add('pulse');   // start the pulse again on each button
    place(); requestAnimationFrame(place);
    cur.next.focus({ preventScroll: true });
  }
  function key(e) {
    if (!cur) return;
    if (e.key === 'Escape') { e.preventDefault(); end(false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(cur.i + 1); }
    else if (e.key === 'ArrowLeft' && cur.i > 0) { e.preventDefault(); go(cur.i - 1); }
    else if (e.key === 'Tab') {   // keep the keyboard inside the card
      const f = [...cur.tip.querySelectorAll('button')].filter(b => !b.hidden), k = f.indexOf(document.activeElement);
      e.preventDefault(); f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }
  /** Start a tour of `steps` ([{ sel, title, why }]), leaving out what isn't on the screen; `onEnd(finished)` runs when it is done or
      skipped. False when there is nothing to show. */
  function start(steps, onEnd) {
    if (cur) end(false);
    steps = steps.filter(s => find(s.sel));
    if (!steps.length) return false;
    const root = document.createElement('div');
    root.className = 'tour'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'tourT'); root.setAttribute('aria-describedby', 'tourW');
    root.innerHTML = `<div class="tour-box" aria-hidden="true"></div><div class="tour-tip"><div class="tt-top"><span class="tt-n"></span><button type="button" class="tt-skip">${__h('Skip tour')}</button></div>
      <div aria-live="polite"><b id="tourT"></b><p id="tourW"></p></div>
      <div class="tt-btns"><button type="button" class="btn tt-back">${__h('Back')}</button><button type="button" class="btn p tt-next">${__h('Next')}</button></div></div>`;
    document.body.appendChild(root);
    cur = { steps, i: 0, root, box: root.querySelector('.tour-box'), tip: root.querySelector('.tour-tip'), back: root.querySelector('.tt-back'), next: root.querySelector('.tt-next'), onEnd, from: document.activeElement };
    cur.next.onclick = () => go(cur.i + 1);
    cur.back.onclick = () => go(cur.i - 1);
    root.querySelector('.tt-skip').onclick = () => end(false);
    window.addEventListener('resize', place); document.addEventListener('scroll', place, true); document.addEventListener('keydown', key, true);
    go(0);
    return true;
  }
  function end(finished) {
    if (!cur) return;
    const c = cur; cur = null;
    c.root.remove();
    window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); document.removeEventListener('keydown', key, true);
    if (c.from && c.from.focus && document.contains(c.from)) c.from.focus({ preventScroll: true });
    if (c.onEnd) c.onEnd(finished);
  }
  return { start, end, mark, seen, active: () => !!cur, step: () => (cur ? cur.i : -1) };
})();
