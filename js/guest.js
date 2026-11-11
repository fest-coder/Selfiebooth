/* Gæstesider: foto.html (ét billede) og galleri.html (hele festen). */
import { DEPLOY } from './config.js';
import { cloudEnabled, publicUrl, photoKey, thumbKey, listEvent } from './cloud.js';

const main = document.getElementById('main');
const params = new URLSearchParams(location.search);
const page = document.body.dataset.page;

const brandLink = document.getElementById('brandLink');
if (brandLink) {
  brandLink.href = DEPLOY.brandUrl;
  brandLink.textContent = DEPLOY.brandUrl.replace(/^https?:\/\//, '');
}

function message(title, text, eyebrow = 'Selfie booth') {
  main.innerHTML = `<div class="center"><p class="eyebrow"></p><h1 class="display"></h1><p></p></div>`;
  const [e, h, p] = main.firstChild.children;
  e.textContent = eyebrow;
  h.textContent = title;
  p.textContent = text;
}

/** Gem/del et billede. På mobil åbner det delearket ("Gem billede"), ellers hentes filen. */
async function saveImage(url, name, btn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Henter…';
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [file] });
    } else {
      const href = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
    }
  } catch (err) {
    if (err.name !== 'AbortError') window.open(url, '_blank');
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

/* ---------- Ét billede ---------- */

function photoPage() {
  const k = params.get('k') || '';
  const m = k.match(/^([a-z0-9-]{4,60})\/([a-z0-9]{6,40})$/);
  if (!m) return message('Hov', 'Linket ser ikke rigtigt ud. Prøv at scanne QR-koden igen.');
  const [, eventId, id] = m;
  const url = publicUrl(photoKey(eventId, id));

  main.innerHTML = `<div class="center"><div class="loader"></div><p>Dit billede er på vej…</p></div>`;
  let tries = 0;

  const img = new Image();
  img.className = 'photo';
  img.alt = 'Dit billede fra festen';
  img.onload = () => {
    main.innerHTML = `<div class="center">
        <p class="eyebrow">Dit billede</p>
        <span id="slot"></span>
        <div class="stack">
          <button class="btn btn-fest" id="save">Gem billede</button>
          <a class="btn btn-glass" id="all">Se alle festens billeder</a>
        </div>
      </div>`;
    main.querySelector('#slot').replaceWith(img);
    main.querySelector('#all').href = `galleri.html?e=${eventId}`;
    const btn = main.querySelector('#save');
    btn.onclick = () => saveImage(url, `minglo-${id}.jpg`, btn);
  };
  img.onerror = () => {
    // Boothen uploader i baggrunden — giv den et øjeblik, før vi giver op
    if (++tries > 40) return message('Ikke klar endnu', 'Billedet er ikke blevet sendt fra boothen endnu. Prøv igen om lidt.');
    setTimeout(() => (img.src = `${url}?t=${tries}`), 3000);
  };
  img.src = url;
}

/* ---------- Galleri ---------- */

function galleryPage() {
  const eventId = params.get('e') || '';
  if (!/^[a-z0-9-]{4,60}$/.test(eventId)) return message('Hov', 'Linket ser ikke rigtigt ud.');

  main.innerHTML = `<div class="center"><div class="loader"></div></div>`;
  let known = [];
  let built = false;

  function build() {
    main.innerHTML = `<div style="display:grid;gap:26px;width:100%;align-content:start">
        <div class="gallery-head">
          <p class="eyebrow">Selfie booth</p>
          <h1 class="display">Festens <span class="fest-text">billeder</span></h1>
          <p id="count"></p>
        </div>
        <div class="wall" id="wall"></div>
      </div>`;
    built = true;
  }

  function tile(id) {
    const b = document.createElement('button');
    b.dataset.id = id;
    const img = new Image();
    img.loading = 'lazy';
    img.alt = 'Billede fra festen';
    img.onerror = () => {
      img.onerror = null;
      img.src = publicUrl(photoKey(eventId, id));
    };
    img.src = publicUrl(thumbKey(eventId, id));
    b.append(img);
    b.onclick = () => view(id);
    return b;
  }

  function view(id) {
    const url = publicUrl(photoKey(eventId, id));
    const v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = `<img alt="Billede fra festen">
      <div class="row">
        <button class="btn btn-glass btn-s" data-a="prev" aria-label="Forrige">←</button>
        <button class="btn btn-fest btn-s" data-a="save">Gem billede</button>
        <button class="btn btn-glass btn-s" data-a="close">Luk</button>
        <button class="btn btn-glass btn-s" data-a="next" aria-label="Næste">→</button>
      </div>`;
    v.querySelector('img').src = url;
    v.onclick = (e) => {
      const btn = e.target.closest('button');
      const a = btn?.dataset.a;
      if (a === 'save') return saveImage(url, `minglo-${id}.jpg`, btn);
      if (a === 'prev' || a === 'next') {
        const i = known.indexOf(id) + (a === 'next' ? 1 : -1);
        if (!known[i]) return;
        v.remove();
        return view(known[i]);
      }
      if (a === 'close' || e.target === v) v.remove();
    };
    document.body.append(v);
  }

  async function refresh() {
    let ids;
    try {
      ids = await listEvent(eventId);
    } catch (err) {
      if (!built) message('Prøv igen om lidt', 'Vi kunne ikke hente billederne lige nu.');
      return;
    }
    if (!ids.length) {
      if (!known.length) {
        built = false;
        message('Snart klar', 'Der er ikke taget nogen billeder endnu. Siden opdaterer sig selv, når festen går i gang.');
      }
      return;
    }
    if (!built) build();
    const wall = main.querySelector('#wall');
    const fresh = ids.filter((id) => !known.includes(id));
    // ids er sorteret nyeste først — indsæt nye øverst
    wall.prepend(...fresh.map(tile));
    known = ids;
    main.querySelector('#count').textContent = `${ids.length} ${ids.length === 1 ? 'billede' : 'billeder'}`;
  }

  refresh();
  setInterval(() => document.visibilityState === 'visible' && refresh(), 20000);
}

if (!cloudEnabled()) message('Ikke sat op', 'Online-deling er ikke slået til for denne booth.');
else if (page === 'foto') photoPage();
else galleryPage();
