/*
  db.js — delt logik for Selfie Booth
  Bruges af både index.html (selve boothen) og admin.html (galleri/indstillinger)

  Ansvar:
  - Gemme billeder lokalt i IndexedDB (virker altid, også offline)
  - Læse/skrive indstillinger i localStorage (event-navn, pinkode, upload-endpoint)
  - Forsøge at synkronisere ikke-uploadede billeder til en cloud-endpoint, når enheden er online
*/

const DB_NAME = 'selfiebooth';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function addPhoto(blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = { blob, timestamp: Date.now(), synced: 0, syncedAt: null };
    const req = store.add(record);
    req.onsuccess = () => resolve({ ...record, id: req.result });
    req.onerror = () => reject(req.error);
  });
}

async function getAllPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.timestamp - a.timestamp));
    req.onerror = () => reject(req.error);
  });
}

async function getUnsyncedPhotos() {
  const all = await getAllPhotos();
  return all.filter((p) => !p.synced);
}

async function markSynced(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return resolve(null);
      record.synced = 1;
      record.syncedAt = Date.now();
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve(record);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function deletePhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteAllPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Indstillinger (localStorage) ---------- */

const DEFAULT_CONFIG = {
  eventName: 'Din Selfie Booth',
  pin: '1234',
  uploadEndpoint: '', // fx en Supabase Storage-URL — se README.md
  countdownSeconds: 3,
  reviewSeconds: 8,
  captureMode: 'single', // 'single' | 'strip' | 'grid' — se index.html
  filter: 'normal', // 'normal' | 'bw' | 'sepia' | 'warm' — se index.html
};

function getConfig() {
  try {
    const raw = localStorage.getItem('boothConfig');
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function setConfig(partial) {
  const current = getConfig();
  const next = { ...current, ...partial };
  localStorage.setItem('boothConfig', JSON.stringify(next));
  return next;
}

/* ---------- Synkronisering ---------- */

// Uploader ét billede til den konfigurerede endpoint.
// Forventer en simpel POST-endpoint der modtager en fil (multipart/form-data)
// og svarer 2xx ved succes. Tilpas denne funktion til jeres valgte cloud-løsning
// (Supabase Storage, Firebase Storage, egen server osv.) — se README.md for eksempler.
async function uploadPhoto(record, endpoint) {
  const formData = new FormData();
  const filename = `booth-${record.id}-${record.timestamp}.jpg`;
  formData.append('file', record.blob, filename);

  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload fejlede (${res.status})`);
  }
}

let syncInFlight = false;

async function trySyncQueue(onStatusChange) {
  const config = getConfig();
  if (syncInFlight) return { attempted: 0, succeeded: 0, skipped: true };
  if (!navigator.onLine) return { attempted: 0, succeeded: 0, skipped: true, reason: 'offline' };
  if (!config.uploadEndpoint) return { attempted: 0, succeeded: 0, skipped: true, reason: 'no-endpoint' };

  syncInFlight = true;
  if (onStatusChange) onStatusChange('syncing');

  const pending = await getUnsyncedPhotos();
  let succeeded = 0;

  for (const record of pending) {
    try {
      await uploadPhoto(record, config.uploadEndpoint);
      await markSynced(record.id);
      succeeded += 1;
    } catch (err) {
      console.warn('Kunne ikke uploade billede', record.id, err);
      // Stop ikke resten af køen ved én fejl — prøv videre, og forsøg denne igen senere
    }
  }

  syncInFlight = false;
  if (onStatusChange) onStatusChange('idle');
  return { attempted: pending.length, succeeded, skipped: false };
}

// Starter en baggrundsløkke der forsøger at synkronisere jævnligt,
// samt med det samme når forbindelsen kommer tilbage.
function startBackgroundSync(intervalMs = 15000, onStatusChange) {
  trySyncQueue(onStatusChange);
  window.addEventListener('online', () => trySyncQueue(onStatusChange));
  setInterval(() => trySyncQueue(onStatusChange), intervalMs);
}
