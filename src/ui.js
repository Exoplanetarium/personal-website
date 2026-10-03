const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MOBILE = '(max-width: 760px)';

function renderLinks(links = []) {
  if (!links.length) return '';
  return `<div class="links">${links
    .map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} <span aria-hidden="true">↗</span></a>`)
    .join('')}</div>`;
}

function renderItem(it, heading = 'h3') {
  return `
    <div class="item-head">
      <${heading}>${esc(it.title)}</${heading}>
      ${it.meta ? `<span class="meta">${esc(it.meta)}</span>` : ''}
    </div>
    ${it.text ? `<p>${esc(it.text)}</p>` : ''}
    ${renderLinks(it.links)}`;
}

function renderSection(s) {
  return `
    <p class="kicker">${esc(s.place)}</p>
    <h2 id="panel-title">${esc(s.title)}</h2>
    <p class="intro">${esc(s.intro)}</p>
    <ul class="items">
      ${(s.items ?? []).map((it) => `<li class="item">${renderItem(it)}</li>`).join('')}
    </ul>`;
}

/** Short name for a trail stop (used for tags and the progress dots). */
function stopName(s, stop, landmark) {
  if (stop.kind === 'welcome') return 'Trailhead';
  if (stop.kind === 'finale') return landmark;
  return s.items[stop.item].title;
}

export function createUI({ profile, sections, accents, landmarks, onSelect, onClose, onHover, explore }) {
  const root = document.getElementById('ui');
  root.innerHTML = `
    <header class="brand">
      <h1>${esc(profile.name)}</h1>
      <p>${esc(profile.tagline)}</p>
      ${renderLinks(profile.links)}
    </header>
    <div class="labels" aria-hidden="true">
      ${sections
        .map(
          (s, i) => `
        <button class="label" data-i="${i}" tabindex="-1" style="--accent:${accents[i]}">
          <span class="label-place">${esc(s.place)}</span>
          <span class="label-title">${esc(s.title)}</span>
        </button>`,
        )
        .join('')}
    </div>
    <p class="hint">Drag to spin · Scroll to zoom · Click an island to land</p>
    <nav class="chips" aria-label="Sections">
      ${sections
        .map(
          (s, i) => `
        <button class="chip" data-i="${i}" aria-pressed="false" style="--accent:${accents[i]}">
          <span class="dot" aria-hidden="true"></span>${esc(s.title)}
        </button>`,
        )
        .join('')}
    </nav>
    <div class="hud" aria-hidden="true">
      <div class="tags"></div>
      <span class="card-pin"></span>
      <article class="card" aria-live="polite"><div class="card-body"></div></article>
      <button class="hud-btn hud-back"><span aria-hidden="true">↑</span> Back to orbit</button>
      <button class="hud-btn hud-list"><span aria-hidden="true">☰</span> Read as list</button>
      <p class="hud-hint">Drag to look around · <kbd>←</kbd> <kbd>→</kbd> to walk</p>
      <nav class="hud-nav" aria-label="Trail">
        <button class="hud-step hud-prev" aria-label="Previous stop">‹</button>
        <ol class="hud-dots"></ol>
        <button class="hud-step hud-next" aria-label="Next stop">›</button>
      </nav>
    </div>
    <aside class="panel" role="dialog" aria-labelledby="panel-title" aria-hidden="true">
      <div class="panel-banner" aria-hidden="true"><span></span><span></span><span></span></div>
      <button class="panel-close" aria-label="Close">✕</button>
      <div class="panel-body"></div>
    </aside>`;

  const labels = [...root.querySelectorAll('.label')];
  const chips = [...root.querySelectorAll('.chip')];
  const panel = root.querySelector('.panel');
  const body = root.querySelector('.panel-body');

  for (const el of [...labels, ...chips]) {
    const i = Number(el.dataset.i);
    el.addEventListener('click', () => onSelect(i));
    el.addEventListener('pointerenter', () => onHover(i));
    el.addEventListener('pointerleave', () => onHover(-1));
  }
  root.querySelector('.panel-close').addEventListener('click', onClose);

  // ── explore HUD ───────────────────────────────────────────
  const hud = root.querySelector('.hud');
  const tagsEl = hud.querySelector('.tags');
  const dotsEl = hud.querySelector('.hud-dots');
  const card = hud.querySelector('.card');
  const cardBody = hud.querySelector('.card-body');
  const pin = hud.querySelector('.card-pin');
  const prevBtn = hud.querySelector('.hud-prev');
  const nextBtn = hud.querySelector('.hud-next');
  let tags = [];
  let dots = [];
  let region = -1;
  let stops = [];
  let cardShown = false;

  hud.querySelector('.hud-back').addEventListener('click', explore.onExit);
  hud.querySelector('.hud-list').addEventListener('click', () => explore.onList(region));
  prevBtn.addEventListener('click', explore.onPrev);
  nextBtn.addEventListener('click', explore.onNext);
  card.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'next') explore.onNext();
    if (btn.dataset.act === 'exit') explore.onExit();
    if (btn.dataset.act === 'travel') explore.onTravel(Number(btn.dataset.i));
  });

  function renderStop(k) {
    const s = sections[region];
    const stop = stops[k];
    if (stop.kind === 'welcome') {
      return `
        <p class="kicker">${esc(s.place)}</p>
        <h2>${esc(s.title)}</h2>
        <p class="intro">${esc(s.intro)}</p>
        <button class="card-action" data-act="next">Start the trail <span aria-hidden="true">→</span></button>`;
    }
    if (stop.kind === 'finale') {
      const j = (region + 1) % sections.length;
      return `
        <p class="kicker">${esc(landmarks[region])}</p>
        <h3>End of the trail</h3>
        <p>That's everything on ${esc(s.place)}.</p>
        <div class="card-actions">
          ${j !== region ? `<button class="card-action" data-act="travel" data-i="${j}">Visit ${esc(sections[j].title)} <span aria-hidden="true">→</span></button>` : ''}
          <button class="card-action ghost" data-act="exit">Back to orbit</button>
        </div>`;
    }
    const last = stop.item === s.items.length - 1;
    return `
      <p class="kicker">Stop ${stop.item + 1} of ${s.items.length}</p>
      ${renderItem(s.items[stop.item])}
      <button class="card-action" data-act="next">${last ? 'Continue to the end' : 'Next stop'} <span aria-hidden="true">→</span></button>`;
  }

  const exploreApi = {
    enter(i, trailStops) {
      region = i;
      stops = trailStops;
      const s = sections[i];
      hud.style.setProperty('--accent', accents[i]);
      tagsEl.innerHTML = stops
        .map((st, k) => `<button class="tag" data-k="${k}" tabindex="-1"><span class="tag-dot"></span>${esc(stopName(s, st, landmarks[i]))}</button>`)
        .join('');
      dotsEl.innerHTML = stops
        .map((st, k) => `<li><button class="hud-dot" data-k="${k}" aria-label="${esc(stopName(s, st, landmarks[i]))}" title="${esc(stopName(s, st, landmarks[i]))}"></button></li>`)
        .join('');
      tags = [...tagsEl.querySelectorAll('.tag')];
      dots = [...dotsEl.querySelectorAll('.hud-dot')];
      for (const el of [...tags, ...dots]) el.addEventListener('click', () => explore.onGoto(Number(el.dataset.k)));
      document.body.classList.add('exploring');
      hud.setAttribute('aria-hidden', 'false');
      exploreApi.setStop(0, true);
      exploreApi.hideCard();
    },
    exit() {
      document.body.classList.remove('exploring');
      hud.setAttribute('aria-hidden', 'true');
      exploreApi.hideCard();
      region = -1;
    },
    setStop(k, walking) {
      dots.forEach((d, j) => {
        d.classList.toggle('is-current', j === k);
        d.classList.toggle('is-walking', j === k && walking);
        if (j === k && !walking) d.classList.add('is-visited');
        if (j === k) d.setAttribute('aria-current', 'step');
        else d.removeAttribute('aria-current');
      });
      prevBtn.disabled = k <= 0;
      nextBtn.disabled = k >= stops.length - 1;
    },
    showCard(k) {
      cardBody.innerHTML = renderStop(k);
      cardBody.scrollTop = 0;
      card.classList.toggle('is-finale', stops[k].kind === 'finale');
      cardShown = true;
      requestAnimationFrame(() => card.classList.add('open'));
    },
    hideCard() {
      cardShown = false;
      card.classList.remove('open');
      pin.classList.remove('open');
    },
    /** Pin the card next to the thing it describes (x, y = that thing on screen). */
    placeCard(x, y, inFront) {
      if (!cardShown) return;
      pin.classList.toggle('open', inFront);
      pin.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(45deg)`;
      if (matchMedia(MOBILE).matches) {
        card.style.transform = '';
        return;
      }
      const w = innerWidth, h = innerHeight;
      const cw = card.offsetWidth, ch = card.offsetHeight;
      const anchorX = inFront ? x : w * 0.4;
      // leave room so the card sits beside the exhibit rather than on top of it
      let left = anchorX < w * 0.58 ? anchorX + 110 : anchorX - 110 - cw;
      left = Math.min(Math.max(left, 24), w - cw - 24);
      const top = Math.min(Math.max((inFront ? y : h / 2) - ch * 0.4, 84), h - ch - 110);
      card.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
    },
    placeTag(k, x, y, opacity) {
      const t = tags[k];
      if (!t) return;
      t.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      t.style.opacity = opacity.toFixed(3);
      t.style.pointerEvents = opacity > 0.4 ? 'auto' : 'none';
    },
    dragged() {
      hud.classList.add('has-dragged');
    },
  };

  return {
    explore: exploreApi,
    get panelOpen() {
      return panel.classList.contains('open');
    },
    open(i) {
      panel.style.setProperty('--accent', accents[i]);
      body.innerHTML = renderSection(sections[i]);
      body.scrollTop = 0;
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      document.body.classList.add('panel-open');
      chips.forEach((c, k) => c.setAttribute('aria-pressed', String(k === i)));
    },
    close() {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('panel-open');
      chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
    },
    setHover(i) {
      labels.forEach((l, k) => l.classList.toggle('is-hover', k === i));
      chips.forEach((c, k) => c.classList.toggle('is-hover', k === i));
    },
    placeLabel(i, x, y, opacity) {
      const l = labels[i];
      l.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      l.style.opacity = opacity.toFixed(3);
      l.style.pointerEvents = opacity > 0.4 ? 'auto' : 'none';
    },
    /** How far (px) to shift the globe so the open panel doesn't cover it. */
    viewShift() {
      if (document.body.classList.contains('exploring')) {
        // on phones the card is a bottom sheet: nudge the scene up so the exhibit stays visible
        if (cardShown && matchMedia(MOBILE).matches) return { x: 0, y: card.offsetHeight * 0.4 };
        return { x: 0, y: 0 };
      }
      if (!panel.classList.contains('open')) return { x: 0, y: 0 };
      if (matchMedia(MOBILE).matches) return { x: 0, y: panel.offsetHeight * 0.42 };
      return { x: (panel.offsetWidth + 16) / 2, y: 0 };
    },
  };
}
