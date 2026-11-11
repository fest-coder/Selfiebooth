/* Lokalt lager: indstillinger (localStorage) og billeder (IndexedDB). */

const SETTINGS_KEY = 'minglo.settings.v1';

export function newEventId(name = '') {
  const slug = name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  return slug ? `${slug}-${rand}` : rand;
}

export function newPhotoId() {
  const t = Date.now().toString(36);
  const r = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  return `${t}${r}`;
}

const DEFAULTS = {
  eventName: 'Velkommen til festen',
  eventDate: '',
  eventId: '',
  pin: '1234',
  countdown: 3,
  mirror: true,
  sound: true,
  deviceId: '',
  logo: '', // data-URL
  mode: 'single',
  filter: 'natural',
};

export function getSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    /* brug standard */
  }
  const merged = { ...DEFAULTS, ...s };
  if (!merged.eventId) {
    merged.eventId = newEventId(merged.eventName);
    saveSettings(merged);
  }
  return merged;
}

export function saveSettings(partial) {
  let current = {};
  try {
    current = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    /* overskriv */
  }
  const next = { ...DEFAULTS, ...current, ...partial };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('Kunne ikke gemme indstillinger', err);
  }
  return next;
}

/* ---------- IndexedDB ---------- */

const DB_NAME = 'minglo-selfie';
const STORE = 'photos';
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const result = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

/** record: { id, eventId, blob, thumb, ts, mode, synced } */
export const addPhoto = (record) => tx('readwrite', (s) => s.put(record));
export const getPhoto = (id) => tx('readonly', (s) => s.get(id));
export const deletePhoto = (id) => tx('readwrite', (s) => s.delete(id));
export const clearPhotos = () => tx('readwrite', (s) => s.clear());
export const allPhotos = () => tx('readonly', (s) => s.getAll()).then((list) => (list || []).sort((a, b) => b.ts - a.ts));

export async function markSynced(id) {
  const rec = await getPhoto(id);
  if (!rec) return;
  rec.synced = 1;
  await addPhoto(rec);
}

/** Bed browseren om ikke at rydde billederne ved pladsmangel. */
export function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
