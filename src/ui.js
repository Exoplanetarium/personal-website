const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MOBILE = '(max-width: 760px)';

function renderLinks(links = []) {
  if (!links.length) return '';
  return `<div class="links">${links
    .map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} <span aria-hidden="true">↗</span></a>`)
    .join('')}</div>`;
}

function renderSection(s) {
  return `
    <p class="kicker">${esc(s.place)}</p>
    <h2 id="panel-title">${esc(s.title)}</h2>
    <p class="intro">${esc(s.intro)}</p>
    <ul class="items">
      ${(s.items ?? [])
        .map(
          (it) => `
        <li class="item">
          <div class="item-head">
            <h3>${esc(it.title)}</h3>
            ${it.meta ? `<span class="meta">${esc(it.meta)}</span>` : ''}
          </div>
          ${it.text ? `<p>${esc(it.text)}</p>` : ''}
          ${renderLinks(it.links)}
        </li>`,
        )
        .join('')}
    </ul>`;
}

export function createUI({ profile, sections, accents, onSelect, onClose, onHover }) {
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
    <p class="hint">Drag to spin · Scroll to zoom · Click an island</p>
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
  addEventListener('keydown', (e) => e.key === 'Escape' && onClose());

  return {
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
      if (!panel.classList.contains('open')) return { x: 0, y: 0 };
      if (matchMedia(MOBILE).matches) return { x: 0, y: panel.offsetHeight * 0.42 };
      return { x: (panel.offsetWidth + 16) / 2, y: 0 };
    },
  };
}
