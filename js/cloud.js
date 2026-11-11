/* Sky-deling via Supabase Storage (valgfrit). Bruges af både booth og gæstesider. */
import { DEPLOY } from './config.js';
import { allPhotos, markSynced } from './store.js';

const base = () => DEPLOY.supabaseUrl.replace(/\/+$/, '');

export const cloudEnabled = () => Boolean(DEPLOY.supabaseUrl && DEPLOY.supabaseKey && DEPLOY.bucket);

const headers = (extra = {}) => ({
  apikey: DEPLOY.supabaseKey,
  Authorization: `Bearer ${DEPLOY.supabaseKey}`,
  ...extra,
});

export const photoKey = (eventId, id) => `${eventId}/${id}.jpg`;
export const thumbKey = (eventId, id) => `${eventId}/thumbs/${id}.jpg`;
export const publicUrl = (key) => `${base()}/storage/v1/object/public/${DEPLOY.bucket}/${key}`;

/** Links som gæsterne scanner. Peger på siderne ved siden af boothen. */
export const photoPageUrl = (eventId, id) => new URL(`foto.html?k=${eventId}/${id}`, location.href).href;
export const galleryPageUrl = (eventId) => new URL(`galleri.html?e=${eventId}`, location.href).href;

async function put(key, blob) {
  const res = await fetch(`${base()}/storage/v1/object/${DEPLOY.bucket}/${key}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=31536000' }),
    body: blob,
  });
  if (res.ok) return;
  // Findes filen allerede (fx efter et afbrudt forsøg), er vi i mål.
  const body = await res.text().catch(() => '');
  if (res.status === 409 || /Duplicate|already exists|"409"/i.test(body)) return;
  throw new Error(`Upload fejlede (${res.status}) ${body.slice(0, 120)}`);
}

export async function listEvent(eventId) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${base()}/storage/v1/object/list/${DEPLOY.bucket}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: `${eventId}/`, limit: 1000, offset, sortBy: { column: 'name', order: 'desc' } }),
    });
    if (!res.ok) throw new Error(`Kunne ikke hente galleriet (${res.status})`);
    const page = await res.json();
    for (const item of page) {
      if (/\.jpg$/i.test(item.name)) out.push(item.name.replace(/\.jpg$/i, ''));
    }
    if (page.length < 1000) break;
  }
  return out; // nyeste først (id starter med tidsstempel)
}

/* ---------- Upload-kø ---------- */

let running = false;
const listeners = new Set();
export const onSync = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (state) => listeners.forEach((fn) => fn(state));

export async function syncNow() {
  if (!cloudEnabled() || running || !navigator.onLine) return;
  running = true;
  try {
    const pending = (await allPhotos()).filter((p) => !p.synced).reverse(); // ældste først
    if (pending.length) emit({ state: 'syncing', pending: pending.length });
    let left = pending.length;
    for (const rec of pending) {
      try {
        if (rec.thumb) await put(thumbKey(rec.eventId, rec.id), rec.thumb);
        await put(photoKey(rec.eventId, rec.id), rec.blob);
        await markSynced(rec.id);
        left -= 1;
        emit({ state: 'syncing', pending: left, done: rec.id });
      } catch (err) {
        console.warn('Upload venter:', rec.id, err.message);
      }
    }
    emit({ state: left ? 'waiting' : 'idle', pending: left });
  } finally {
    running = false;
  }
}

export function startSync() {
  if (!cloudEnabled()) return;
  syncNow();
  window.addEventListener('online', syncNow);
  setInterval(syncNow, 12000);
}
