/* Admin: PIN → event, billeder og opsætning. Åbnes med langt tryk på logoet. */
import { allPhotos, deletePhoto, clearPhotos, newEventId } from './store.js';
import { cloudEnabled, galleryPageUrl, syncNow, onSync } from './cloud.js';
import { makeZip } from './zip.js';
import { qrSvg } from './qr.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const stamp = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function openAdmin(ctx) {
  const { root } = ctx;
  const el = document.createElement('div');
  el.className = 'admin';
  root.replaceChildren(el);
  let urls = [];
  let offSync = null;

  function close() {
    urls.forEach(URL.revokeObjectURL);
    offSync?.();
    root.replaceChildren();
    ctx.onClose();
  }

  /* ----- PIN ----- */
  function pinScreen() {
    let entry = '';
    const pin = String(ctx.getSettings().pin || '1234');
    el.innerHTML = `
      <div class="pin">
        <p class="eyebrow">Kun for værten</p>
        <h2 class="display">Indtast kode</h2>
        <div class="pin-dots">${'<i></i>'.repeat(pin.length)}</div>
        <div class="pin-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
          <button class="ghost" data-x="close">Luk</button>
          <button data-n="0">0</button>
          <button class="ghost" data-x="del">Slet</button>
        </div>
      </div>`;
    const dots = el.querySelector('.pin-dots');
    const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < entry.length));
    const press = (key) => {
      if (key === 'close') return close();
      if (key === 'del') entry = entry.slice(0, -1);
      else if (entry.length < pin.length) entry += key;
      paint();
      if (entry.length === pin.length) {
        if (entry === pin) return panel();
        dots.classList.add('bad');
        setTimeout(() => {
          entry = '';
          paint();
          dots.classList.remove('bad');
        }, 420);
      }
    };
    el.querySelector('.pin-pad').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) press(b.dataset.n ?? b.dataset.x);
    });
    el.tabIndex = -1;
    el.focus();
    el.onkeydown = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Escape') press('close');
    };
  }

  /* ----- Panel ----- */
  async function panel() {
    el.onkeydown = null;
    const s = ctx.getSettings();
    const cloud = cloudEnabled();
    const galleryUrl = cloud ? galleryPageUrl(s.eventId) : '';
    el.innerHTML = `
      <div class="admin-inner">
        <div class="admin-head">
          <h2 class="display">Opsætning</h2>
          <button class="btn btn-fest btn-s" data-act="close">Tilbage til booth</button>
        </div>

        <section>
          <h3>Event</h3>
          <div class="grid-2">
            <label class="field">Navn på festen
              <input id="aName" maxlength="60" value="${esc(s.eventName)}" placeholder="Sofie &amp; Mads">
            </label>
            <label class="field">Dato / undertekst
              <input id="aDate" maxlength="40" value="${esc(s.eventDate)}" placeholder="14. juni 2026">
            </label>
          </div>
          <div class="row">
            <button class="btn btn-glass btn-s" data-act="saveEvent">Gem</button>
            <button class="btn btn-glass btn-s" data-act="newEvent">Start nyt event</button>
          </div>
          <p>Navn og dato vises på velkomstskærmen og trykkes på hvert billede. "Start nyt event" giver et nyt, tomt online-galleri.</p>
        </section>

        <section>
          <h3>Online-galleri</h3>
          ${
            cloud
              ? `<div class="link-box">
                   <div class="qr">${qrSvg(galleryUrl)}</div>
                   <div style="flex:1;min-width:220px;display:grid;gap:10px">
                     <code>${esc(galleryUrl)}</code>
                     <div class="row">
                       <button class="btn btn-glass btn-s" data-act="copyLink">Kopiér link</button>
                       <span class="pill" id="aSync">…</span>
                     </div>
                   </div>
                 </div>
                 <p>Send linket til kunden — her ligger alle festens billeder. Gæsterne får desuden en QR-kode til deres eget billede direkte på skærmen.</p>`
              : `<span class="pill warn">Ikke sat op</span>
                 <p>Billederne gemmes kun på denne enhed. Udfyld <b>js/config.js</b> med jeres Supabase-oplysninger for at få QR-deling og online-galleri (se README).</p>`
          }
        </section>

        <section>
          <h3>Billeder på denne enhed</h3>
          <div class="stat">
            <div><b id="aCount">0</b><span>Billeder</span></div>
            ${cloud ? '<div><b id="aPending">0</b><span>Venter på upload</span></div>' : ''}
          </div>
          <div class="row">
            <button class="btn btn-glass btn-s" data-act="zip">Download alle (.zip)</button>
            ${cloud ? '<button class="btn btn-glass btn-s" data-act="sync">Upload nu</button>' : ''}
            <button class="btn btn-danger btn-s" data-act="clear">Slet alle</button>
          </div>
          <div class="thumbs" id="aThumbs"></div>
        </section>

        <section>
          <h3>Booth</h3>
          <div class="grid-2">
            <label class="field">Nedtælling
              <select id="aCountdown">
                ${[3, 5, 10].map((n) => `<option value="${n}" ${s.countdown === n ? 'selected' : ''}>${n} sekunder</option>`).join('')}
              </select>
            </label>
            <label class="field">Kamera
              <select id="aCamera"><option value="">Frontkamera (standard)</option></select>
            </label>
            <label class="toggle">Spejlvend billedet <input type="checkbox" id="aMirror" ${s.mirror ? 'checked' : ''}></label>
            <label class="toggle">Lyd <input type="checkbox" id="aSound" ${s.sound ? 'checked' : ''}></label>
          </div>
          <p id="aCamInfo"></p>
        </section>

        <section>
          <h3>Logo</h3>
          <p>Upload jeres logo (helst PNG/SVG med gennemsigtig baggrund, lys udgave). Det vises i boothen og på billederne i stedet for teksten "minglo".</p>
          <div class="row">
            <label class="btn btn-glass btn-s">Vælg fil<input type="file" id="aLogo" accept="image/png,image/svg+xml,image/webp" hidden></label>
            <button class="btn btn-glass btn-s" data-act="noLogo" ${s.logo ? '' : 'hidden'}>Fjern logo</button>
          </div>
        </section>

        <section>
          <h3>Sikkerhed og app</h3>
          <div class="grid-2">
            <label class="field">Admin-kode (4–6 cifre)
              <input id="aPin" inputmode="numeric" pattern="[0-9]*" maxlength="6" value="${esc(s.pin)}">
            </label>
          </div>
          <div class="row">
            <button class="btn btn-glass btn-s" data-act="savePin">Gem kode</button>
            <button class="btn btn-glass btn-s" data-act="fullscreen">Fuld skærm</button>
            <button class="btn btn-glass btn-s" data-act="reload">Opdater app</button>
          </div>
        </section>
      </div>`;

    const q = (sel) => el.querySelector(sel);
    const flashBtn = (btn, text) => {
      const old = btn.textContent;
      btn.textContent = text;
      setTimeout(() => (btn.textContent = old), 1400);
    };

    async function refreshPhotos() {
      const photos = await allPhotos();
      urls.forEach(URL.revokeObjectURL);
      urls = [];
      q('#aCount').textContent = photos.length;
      const pending = photos.filter((p) => !p.synced).length;
      if (cloud) {
        q('#aPending').textContent = pending;
        const pill = q('#aSync');
        pill.className = `pill ${pending ? 'warn' : 'ok'}`;
        pill.textContent = pending ? `${pending} venter på upload` : navigator.onLine ? 'Alt er uploadet' : 'Offline';
      }
      q('#aThumbs').replaceChildren(
        ...photos.slice(0, 300).map((p) => {
          const b = document.createElement('button');
          const url = URL.createObjectURL(p.thumb || p.blob);
          urls.push(url);
          b.innerHTML = `<img src="${url}" alt="" loading="lazy">${cloud ? `<i class="dot ${p.synced ? 'ok' : ''}"></i>` : ''}`;
          b.addEventListener('click', () => lightbox(p));
          return b;
        })
      );
      return photos;
    }

    function lightbox(p) {
      const box = document.createElement('div');
      box.className = 'lightbox';
      const url = URL.createObjectURL(p.blob);
      box.innerHTML = `<img src="${url}" alt="">
        <div class="row">
          <button class="btn btn-glass btn-s" data-b="close">Luk</button>
          <button class="btn btn-glass btn-s" data-b="save">Download</button>
          <button class="btn btn-danger btn-s" data-b="del">Slet</button>
        </div>`;
      box.addEventListener('click', async (e) => {
        const act = e.target.closest('button')?.dataset.b;
        if (!act) return;
        if (act === 'save') return download(p.blob, `minglo-${stamp(p.ts)}.jpg`);
        if (act === 'del') {
          if (!confirm('Slet dette billede fra enheden?')) return;
          await deletePhoto(p.id);
          await refreshPhotos();
        }
        URL.revokeObjectURL(url);
        box.remove();
      });
      el.append(box);
    }

    // Kameraliste
    ctx.camera.devices().then((list) => {
      const sel = q('#aCamera');
      list.forEach((d, i) => {
        if (!d.deviceId) return;
        sel.add(new Option(d.label || `Kamera ${i + 1}`, d.deviceId, false, d.deviceId === s.deviceId));
      });
    });
    const camInfo = () => {
      const i = ctx.camera.info();
      q('#aCamInfo').textContent = i.width ? `Kameraet leverer ${i.width} × ${i.height} px${i.label ? ` · ${i.label}` : ''}` : 'Kameraet er ikke startet.';
    };
    camInfo();

    q('#aCountdown').onchange = (e) => ctx.update({ countdown: Number(e.target.value) });
    q('#aMirror').onchange = (e) => ctx.update({ mirror: e.target.checked });
    q('#aSound').onchange = (e) => ctx.update({ sound: e.target.checked });
    q('#aCamera').onchange = async (e) => {
      ctx.update({ deviceId: e.target.value });
      await ctx.camera.restart();
      setTimeout(camInfo, 800);
    };
    q('#aLogo').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 600 * 1024) return alert('Logoet er for stort (maks. 600 KB).');
      const reader = new FileReader();
      reader.onload = () => {
        ctx.update({ logo: reader.result });
        panel();
      };
      reader.readAsDataURL(file);
    };

    const readEvent = () => ({ eventName: q('#aName').value.trim() || 'Velkommen', eventDate: q('#aDate').value.trim() });

    el.onclick = async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      switch (btn.dataset.act) {
        case 'close':
          ctx.update(readEvent());
          return close();
        case 'saveEvent':
          ctx.update(readEvent());
          return flashBtn(btn, 'Gemt ✓');
        case 'newEvent': {
          if (!confirm('Start et nyt event? Der oprettes et nyt, tomt online-galleri. Billeder på enheden slettes ikke.')) return;
          const ev = readEvent();
          ctx.update({ ...ev, eventId: newEventId(ev.eventName) });
          return panel();
        }
        case 'copyLink':
          try {
            await navigator.clipboard.writeText(galleryUrl);
            flashBtn(btn, 'Kopieret ✓');
          } catch {
            prompt('Kopiér linket:', galleryUrl);
          }
          return;
        case 'sync':
          flashBtn(btn, 'Uploader…');
          await syncNow();
          return refreshPhotos();
        case 'zip': {
          const photos = await allPhotos();
          if (!photos.length) return flashBtn(btn, 'Ingen billeder');
          btn.disabled = true;
          btn.textContent = 'Pakker…';
          try {
            const zip = await makeZip(photos.map((p) => ({ name: `minglo-${stamp(p.ts)}-${p.id.slice(-4)}.jpg`, blob: p.blob, date: new Date(p.ts) })));
            download(zip, `minglo-selfie-${stamp(Date.now())}.zip`);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Download alle (.zip)';
          }
          return;
        }
        case 'clear': {
          const photos = await allPhotos();
          if (!photos.length) return;
          const pending = photos.filter((p) => !p.synced).length;
          const warn = cloud && pending ? `\n\nOBS: ${pending} billede(r) er IKKE uploadet endnu og går tabt.` : !cloud ? '\n\nHusk at downloade dem først — de findes kun her.' : '';
          if (!confirm(`Slet alle ${photos.length} billeder fra denne enhed?${warn}`)) return;
          await clearPhotos();
          return refreshPhotos();
        }
        case 'noLogo':
          ctx.update({ logo: '' });
          return panel();
        case 'savePin': {
          const pin = q('#aPin').value.trim();
          if (!/^\d{4,6}$/.test(pin)) return alert('Koden skal være 4–6 cifre.');
          ctx.update({ pin });
          return flashBtn(btn, 'Gemt ✓');
        }
        case 'fullscreen':
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen?.().catch(() => {});
          return;
        case 'reload':
          try {
            const regs = (await navigator.serviceWorker?.getRegistrations()) || [];
            await Promise.all(regs.map((r) => r.update()));
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          } catch {
            /* fortsæt til genindlæsning */
          }
          return location.reload();
      }
    };

    offSync?.();
    offSync = onSync(() => refreshPhotos());
    await refreshPhotos();
  }

  pinScreen();
}
