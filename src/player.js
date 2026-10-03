// Plays repertoire recordings: one piece at a time, keeping every play button (in trail cards and
// the list panel) and the "now playing" pill in sync.

const AUDIO_FILE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)(\?.*)?$/i;

/** Recordings that are audio files play in the page; anything else is treated as a link. */
export const isAudioFile = (src = '') => AUDIO_FILE.test(src);

export function createPlayer(pill) {
  const audio = new Audio();
  audio.preload = 'none';
  let current = null; // { src, title }
  let failed = false;

  const toggleBtn = pill.querySelector('.np-toggle');
  const titleEl = pill.querySelector('.np-title');
  const labelEl = pill.querySelector('.np-label');
  const bar = pill.querySelector('.np-bar span');

  function sync() {
    const playing = !!current && !audio.paused;
    document.querySelectorAll('.piece-play').forEach((btn) => {
      const mine = !!current && btn.dataset.src === current.src;
      btn.classList.toggle('is-playing', mine && playing);
      btn.setAttribute('aria-pressed', String(mine && playing));
      btn.setAttribute('aria-label', `${mine && playing ? 'Pause' : 'Play'} ${btn.dataset.title}`);
      btn.closest('.piece')?.classList.toggle('is-current', mine);
    });
    pill.hidden = !current;
    if (!current) return;
    titleEl.textContent = current.title;
    labelEl.textContent = failed ? "Couldn't load recording" : playing ? 'Now playing' : 'Paused';
    toggleBtn.classList.toggle('is-playing', playing);
    toggleBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    progress();
  }

  function progress() {
    const f = audio.duration ? audio.currentTime / audio.duration : 0;
    bar.style.transform = `scaleX(${f})`;
    document.querySelectorAll('.piece.is-current .piece-progress').forEach((el) => {
      el.style.transform = `scaleX(${f})`;
    });
  }

  function toggle(src, title) {
    if (current?.src === src && !failed) {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
      return;
    }
    current = { src, title };
    failed = false;
    audio.src = src;
    audio.play().catch(() => {});
    sync();
  }

  function stop() {
    if (!current) return;
    audio.pause();
    current = null;
    audio.removeAttribute('src');
    audio.load();
    sync();
  }

  for (const ev of ['play', 'pause']) audio.addEventListener(ev, sync);
  audio.addEventListener('timeupdate', progress);
  audio.addEventListener('ended', stop);
  audio.addEventListener('error', () => {
    if (!current) return;
    failed = true;
    sync();
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.piece-play');
    if (btn) toggle(btn.dataset.src, btn.dataset.title);
  });
  toggleBtn.addEventListener('click', () => current && toggle(current.src, current.title));
  pill.querySelector('.np-close').addEventListener('click', stop);

  return { sync, stop };
}
