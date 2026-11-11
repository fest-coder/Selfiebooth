/* Minglo Selfie — booth-flowet: velkomst → optagelse → se → del. */
import { getSettings, saveSettings, addPhoto, newPhotoId, requestPersistence } from './store.js';
import { FILTERS, MODES, cssFilter, layoutFor, shotsFor, grabCell, compose, toJpeg, makeThumb } from './compose.js';
import { cloudEnabled, photoPageUrl, startSync, syncNow, onSync } from './cloud.js';
import { confetti, sfx, unlockAudio } from './fx.js';
import { qrSvg } from './qr.js';
import { openAdmin } from './admin.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const cam = $('cam');
const bgcam = $('bgcam');
const finder = $('finder');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const REVIEW_SECONDS = 20;
const SHARE_SECONDS = 35;
const IDLE_SECONDS = 60;
const BETWEEN_SHOTS = 3;

let settings = getSettings();
let stream = null;
let busy = false;
let adminOpen = false;
let current = null; // { canvas, blob, url, id, mode }
let timers = [];

/* ---------- Skærme og timere ---------- */

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
  for (const id of ['reviewTimer', 'shareTimer']) $(id).classList.remove('run');
}

function after(seconds, fn, barId) {
  timers.push(setTimeout(fn, seconds * 1000));
  if (barId) {
    const bar = $(barId);
    bar.style.setProperty('--dur', `${seconds}s`);
    bar.classList.remove('run');
    void bar.offsetWidth; // genstart animationen
    bar.classList.add('run');
  }
}

function go(screen) {
  clearTimers();
  app.dataset.screen = screen;
  if (screen === 'shoot') armIdle();
}

function armIdle() {
  clearTimers();
  after(IDLE_SECONDS, () => {
    if (!busy && !adminOpen && app.dataset.screen === 'shoot') go('attract');
  });
}

/* ---------- Udseende fra indstillinger ---------- */

function applySettings() {
  $('evName').textContent = settings.eventName || 'Velkommen';
  $('evDate').textContent = settings.eventDate || '';
  document.documentElement.style.setProperty('--mirror', settings.mirror ? -1 : 1);
  document.querySelectorAll('[data-brand]').forEach((el) => {
    el.classList.toggle('has-logo', Boolean(settings.logo));
    el.replaceChildren(settings.logo ? Object.assign(new Image(), { src: settings.logo, alt: 'Logo' }) : 'minglo');
  });
  renderPickers();
}

const isPortrait = () => window.innerHeight >= window.innerWidth;

function updateFinder() {
  const cell = layoutFor(settings.mode, isPortrait()).cells[0];
  finder.style.setProperty('--ar', (cell.w / cell.h).toFixed(4));
  cam.style.filter = cssFilter(settings.filter);
  renderShots(-1);
}

function renderPickers() {
  const build = (root, items, key) => {
    root.replaceChildren(
      ...items.map((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = item.label;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(settings[key] === item.id));
        b.addEventListener('click', () => {
          if (busy) return;
          settings = saveSettings({ [key]: item.id });
          renderPickers();
          armIdle();
        });
        return b;
      })
    );
  };
  build($('modeSeg'), MODES, 'mode');
  build($('filterChips'), FILTERS, 'filter');
  const n = shotsFor(settings.mode);
  $('hint').textContent = n > 1 ? `${n} billeder i træk` : 'Tryk — og smil';
  updateFinder();
}

function renderShots(active, total = shotsFor(settings.mode)) {
  const root = $('shots');
  if (total < 2) return root.replaceChildren();
  root.replaceChildren(
    ...Array.from({ length: total }, (_, n) => {
      const i = document.createElement('i');
      if (n < active) i.className = 'done';
      if (n === active) i.className = 'now';
      return i;
    })
  );
}

/* ---------- Kamera ---------- */

async function startCamera() {
  $('camError').hidden = true;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  const video = {
    width: { ideal: 2560 },
    height: { ideal: 1920 },
    ...(settings.deviceId ? { deviceId: { exact: settings.deviceId } } : { facingMode: 'user' }),
  };
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      if (!settings.deviceId) throw err;
      // Det valgte kamera findes ikke længere — fald tilbage til frontkameraet
      settings = saveSettings({ deviceId: '' });
      stream = await navigator.mediaDevices.getUserMedia({ video: { ...video, deviceId: undefined, facingMode: 'user' }, audio: false });
    }
    for (const v of [cam, bgcam]) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
    stream.getVideoTracks()[0].addEventListener('ended', () => startCamera());
  } catch (err) {
    console.warn('Kamera', err);
    stream = null;
    const text = {
      NotAllowedError: 'Boothen har ikke adgang til kameraet. Tillad kamera for denne side i browserens indstillinger, og prøv igen.',
      NotFoundError: 'Vi kan ikke finde et kamera på denne enhed.',
      NotReadableError: 'Kameraet er optaget af en anden app. Luk den, og prøv igen.',
      InsecureContext: 'Kameraet kræver en sikker forbindelse. Åbn boothen via https:// (eller localhost).',
    };
    $('camErrorText').textContent = text[err.name] || 'Kameraet kunne ikke startes. Prøv igen.';
    $('camError').hidden = false;
  }
}

const cameraReady = () => Boolean(stream && cam.videoWidth);

export const cameraApi = {
  restart: startCamera,
  info() {
    const s = stream?.getVideoTracks()[0]?.getSettings?.() || {};
    return { width: s.width, height: s.height, label: stream?.getVideoTracks()[0]?.label || '' };
  },
  async devices() {
    try {
      return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch {
      return [];
    }
  },
};

/* ---------- Optagelse ---------- */

async function countdown(seconds) {
  const el = $('count');
  for (let n = seconds; n > 0; n--) {
    const span = document.createElement('span');
    span.textContent = n;
    el.replaceChildren(span);
    if (settings.sound) (n === 1 ? sfx.go : sfx.tick)();
    await wait(1000);
  }
  el.replaceChildren();
}

async function flashAndGrab(cell) {
  const flash = $('flash');
  flash.classList.add('on');
  if (settings.sound) sfx.shutter();
  await wait(130); // lad skærmens lys ramme ansigterne, før billedet tages
  const canvas = grabCell(cam, cell, settings);
  flash.classList.remove('on');
  return canvas;
}

async function shoot() {
  if (busy || !cameraReady()) return;
  busy = true;
  clearTimers();
  app.dataset.busy = '1';
  unlockAudio();
  const mode = settings.mode;
  const portrait = isPortrait();
  const layout = layoutFor(mode, portrait);
  const total = layout.cells.length;
  const msg = $('finderMsg');
  const lines = ['Gør jer klar', 'Ny positur', 'Skru helt op', 'Sidste — giv den gas'];

  try {
    const cells = [];
    for (let n = 0; n < total; n++) {
      renderShots(n, total);
      msg.textContent = total > 1 ? (n === total - 1 ? lines[3] : lines[n]) : '';
      await countdown(n === 0 ? settings.countdown : BETWEEN_SHOTS);
      msg.textContent = '';
      cells.push(await flashAndGrab(layout.cells[n]));
      renderShots(n + 1, total);
      if (n < total - 1) await wait(500);
    }
    await document.fonts.ready;
    const canvas = await compose(mode, portrait, cells, settings);
    const blob = await toJpeg(canvas);
    if (current?.url) URL.revokeObjectURL(current.url);
    current = { canvas, blob, url: URL.createObjectURL(blob), mode, ar: canvas.width / canvas.height };
    showReview();
  } catch (err) {
    console.error('Optagelse fejlede', err);
    go('shoot');
  } finally {
    busy = false;
    delete app.dataset.busy;
    renderShots(-1);
  }
}

function showReview() {
  const img = $('reviewImg');
  img.style.setProperty('--ar', current.ar.toFixed(4));
  img.src = current.url;
  go('review');
  after(REVIEW_SECONDS, keep, 'reviewTimer');
}

async function keep() {
  if (!current || current.id) return;
  clearTimers();
  const id = (current.id = newPhotoId());
  const thumb = await makeThumb(current.canvas);
  try {
    await addPhoto({ id, eventId: settings.eventId, blob: current.blob, thumb, ts: Date.now(), mode: current.mode, synced: 0 });
  } catch (err) {
    console.error('Kunne ikke gemme billedet', err);
  }
  current.canvas = null; // frigiv hukommelse
  syncNow();
  showShare(id);
}

function showShare(id) {
  const img = $('shareImg');
  img.style.setProperty('--ar', current.ar.toFixed(4));
  img.src = current.url;
  const withQr = cloudEnabled();
  $('qrCard').hidden = !withQr;
  $('shareTitle').textContent = withQr ? 'Tag det med hjem' : 'Det er i kassen';
  if (withQr) {
    $('qr').innerHTML = qrSvg(photoPageUrl(settings.eventId, id));
    $('shareNote').textContent = navigator.onLine ? '' : 'Ingen forbindelse lige nu — linket virker, så snart billedet er sendt afsted.';
  } else {
    $('shareNote').textContent = 'Billedet er gemt. Værten deler alle festens billeder bagefter.';
  }
  go('share');
  confetti($('confetti'));
  if (settings.sound) sfx.yay();
  after(SHARE_SECONDS, finish, 'shareTimer');
}

function finish() {
  go('attract');
}

/* ---------- Hændelser ---------- */

$('s-attract').addEventListener('click', () => {
  if (adminOpen) return;
  unlockAudio();
  if (!cameraReady() && !stream) startCamera();
  go('shoot');
});
$('backBtn').addEventListener('click', () => !busy && go('attract'));
$('shutter').addEventListener('click', shoot);
$('retake').addEventListener('click', () => go('shoot'));
$('keep').addEventListener('click', keep);
$('done').addEventListener('click', finish);
$('camRetry').addEventListener('click', startCamera);
$('s-shoot').addEventListener('pointerdown', () => !busy && app.dataset.screen === 'shoot' && armIdle());

window.addEventListener('resize', updateFinder);
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Mellemrum/Enter virker som udløser — praktisk med fjernbetjening eller tastatur
document.addEventListener('keydown', (e) => {
  if (adminOpen || (e.key !== ' ' && e.key !== 'Enter') || e.target.closest('button, input, select')) return;
  e.preventDefault();
  const screen = app.dataset.screen;
  if (screen === 'attract') go('shoot');
  else if (screen === 'shoot') shoot();
  else if (screen === 'review') keep();
  else if (screen === 'share') finish();
});

// Admin: langt tryk på logoet på velkomstskærmen
{
  const brand = $('brand');
  let hold = null;
  const cancel = () => clearTimeout(hold);
  brand.addEventListener('pointerdown', () => {
    cancel();
    hold = setTimeout(showAdmin, 1200);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) brand.addEventListener(ev, cancel);
  brand.addEventListener('click', (e) => e.stopPropagation());
}

function showAdmin() {
  if (adminOpen) return;
  adminOpen = true;
  clearTimers();
  go('attract');
  openAdmin({
    root: $('adminRoot'),
    camera: cameraApi,
    getSettings: () => settings,
    update(partial) {
      settings = saveSettings(partial);
      applySettings();
      return settings;
    },
    onClose() {
      adminOpen = false;
    },
  });
}

/* ---------- Hold skærmen vågen ---------- */

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    /* ikke understøttet / ikke tilladt */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  keepAwake();
  const track = stream?.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') startCamera();
  else cam.play().catch(() => {});
});

/* ---------- Start ---------- */

applySettings();
requestPersistence();
keepAwake();
startCamera();
startSync();
onSync(({ done }) => {
  if (done && current?.id === done && app.dataset.screen === 'share') $('shareNote').textContent = '';
});
document.fonts.load('italic 40px "Instrument Serif"');
document.fonts.load('600 20px Outfit');

if (new URLSearchParams(location.search).has('admin')) showAdmin();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW', err));
}
