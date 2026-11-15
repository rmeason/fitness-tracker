// --- ☁️ CLOUD SYNC (Supabase) ---
// localStorage stays the app's working copy, so nothing in app.js changes how it reads
// or writes data. This module watches the seven data keys, pushes changes to Supabase
// a couple of seconds after they happen, and pulls cloud data on startup, before the
// app renders, so a wiped phone comes back with everything on it.
//
// Safety rules, in order of importance:
//  1. A push that would wipe or gut a data set already in the cloud (e.g. 88 workouts
//     -> 0) is blocked and shown in Settings instead of sent. That is exactly what a
//     cache wipe looks like, so it can never silently overwrite the cloud.
//  2. When cloud data lands on this phone, migrations V2/V3 are marked done. That data
//     is already migrated, and V3 re-run on it would strip carbs/fat from nutrition.
//  3. Supabase stamps updated_at itself, so a phone clock can't make old data look new.
//  4. With no config, or offline, the app behaves exactly as before.

import { SUPABASE_URL, SUPABASE_KEY } from './sync-config.js';

const SUPABASE_JS = 'https://esm.sh/@supabase/supabase-js@2';

// Export-file name -> localStorage key. The names match exportData() in app.js, so a
// daily snapshot of the cloud table is a normal backup file that Import accepts.
export const SYNC_KEYS = {
  entries: 'hypertrophyApp.entries.v1',
  trainingCycle: 'hypertrophyApp.cycle.v1',
  customCycles: 'hypertrophyApp.customCycles.v1',
  nutrition: 'hypertrophyApp.nutrition.v1',
  sleep: 'hypertrophyApp.sleep.v1',
  dietGoals: 'hypertrophyApp.dietGoals.v1',
  profile: 'hypertrophyApp.profile.v1'
};
const NAMES = Object.keys(SYNC_KEYS);
const NAME_FOR_STORAGE_KEY = Object.fromEntries(NAMES.map(n => [SYNC_KEYS[n], n]));

const META_KEY = 'hypertrophyApp.sync.meta.v1';
const ALREADY_MIGRATED_FLAGS = ['hypertrophyApp.migrationV2.done', 'hypertrophyApp.migrationV3.done'];

const PUSH_DELAY_MS = 2000;
const BOOT_WAIT_MS = 5000;
const RETRY_EVERY_MS = 60000;
// Shrink guard: block a push that removes more than this many items AND leaves less
// than this share of what the cloud has. Deleting a workout or two passes; a wipe doesn't.
const SHRINK_MAX_ITEMS = 3;
const SHRINK_MIN_SHARE = 0.8;

// --- helpers (exported for tests) ---

// Stable stringify: Postgres jsonb reorders object keys, so plain JSON.stringify of
// the same data can differ between phone and cloud. Sorting keys makes them comparable.
export const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
};

export const hashOf = (v) => {
  const s = canon(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ':' + s.length;
};

export const isEmpty = (v) =>
  v === null || v === undefined ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

const isIdArray = (v) => Array.isArray(v) && v.every(x => x && typeof x === 'object' && 'id' in x);

// Union by id. Local wins for an id both sides have; cloud-only items are appended.
export const mergeById = (local, cloud) => {
  const ids = new Set(local.map(x => String(x.id)));
  return [...local, ...cloud.filter(x => !ids.has(String(x.id)))];
};

const timeOf = (iso) => (iso ? Date.parse(iso) : 0);

// Decides what to do with one data set. `local` is { present, value }, `cloud` is the
// app_state row or undefined, `m` is this phone's sync record for the key.
export const reconcile = (local, cloud, m) => {
  if (!cloud) {
    return local.present && !isEmpty(local.value) ? { action: 'push', value: local.value } : { action: 'none' };
  }
  if (!local.present) return { action: 'take-cloud' };
  if (hashOf(local.value) === hashOf(cloud.value)) return { action: 'in-sync' };

  const cloudChanged = !m.syncedAt || timeOf(cloud.updated_at) > timeOf(m.syncedAt);
  const localChanged = !m.syncedAt || m.dirty;

  if (!localChanged) return cloudChanged ? { action: 'take-cloud' } : { action: 'in-sync' };
  if (!cloudChanged) return { action: 'push', value: local.value };

  // Both sides changed (or this phone has never synced this key).
  if (isEmpty(local.value)) return { action: 'take-cloud' };
  if (isIdArray(local.value) && isIdArray(cloud.value)) {
    const merged = mergeById(local.value, cloud.value);
    return hashOf(merged) === hashOf(cloud.value) ? { action: 'take-cloud' } : { action: 'push', value: merged };
  }
  // Settings-type data (cycle, goals, profile): on a phone that has never synced, its
  // values are just defaults, so the cloud wins. Otherwise the edit made here wins.
  return m.syncedAt ? { action: 'push', value: local.value } : { action: 'take-cloud' };
};

export const shrinkBlocked = (pushValue, cloudValue) => {
  if (!cloudValue || isEmpty(cloudValue)) return false;
  if (isEmpty(pushValue)) return true;
  if (Array.isArray(pushValue) && Array.isArray(cloudValue)) {
    const lost = cloudValue.length - pushValue.length;
    return lost > SHRINK_MAX_ITEMS && pushValue.length < cloudValue.length * SHRINK_MIN_SHARE;
  }
  return false;
};

// --- state ---

let storage = null;
let rawSet = null;
let rawRemove = null;
let client = null;
let clientPromise = null;
let createClientOverride = null;
let session = null;
let meta = { keys: {} };
let booted = false;
let flushing = null;
let flushAgain = false;
let pushTimer = null;
const writeCount = {};
const allowShrinkFor = new Set();
const forceCloudFor = new Set();
const listeners = new Set();

let status = {
  enabled: false,
  signedIn: false,
  email: null,
  state: 'disabled', // disabled | signed-out | syncing | idle | offline | blocked | error
  lastSyncAt: null,
  pendingKeys: [],
  blockedKeys: [],
  needsReload: false,
  error: null
};

const setStatus = (patch) => {
  status = { ...status, ...patch, pendingKeys: NAMES.filter(n => meta.keys[n]?.dirty) };
  listeners.forEach(fn => { try { fn(status); } catch (e) { /* a bad listener must not stop sync */ } });
};

const loadMeta = () => {
  try { meta = JSON.parse(storage.getItem(META_KEY)) || { keys: {} }; } catch (e) { meta = { keys: {} }; }
  if (!meta.keys) meta.keys = {};
};
const saveMeta = () => rawSet.call(storage, META_KEY, JSON.stringify(meta));
const metaFor = (name) => (meta.keys[name] ||= { syncedAt: null, hash: null, dirty: false });

const readLocal = (name) => {
  const raw = storage.getItem(SYNC_KEYS[name]);
  if (raw === null) return { present: false, value: null };
  try { return { present: true, value: JSON.parse(raw) }; } catch (e) { return { present: true, value: raw }; }
};

// Writes cloud data into localStorage without it counting as a local edit.
const writeLocalSilently = (name, value) => {
  rawSet.call(storage, SYNC_KEYS[name], JSON.stringify(value));
};

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

// Catch every write to the data keys -- the save effects, migrations, Import, Delete
// All -- without touching any of those call sites.
const onLocalWrite = (storageKey) => {
  const name = NAME_FOR_STORAGE_KEY[storageKey];
  if (!name) return;
  writeCount[name] = (writeCount[name] || 0) + 1;
  const m = metaFor(name);
  const { present, value } = readLocal(name);
  const h = present ? hashOf(value) : null;
  if (h !== m.hash && !m.dirty) {
    m.dirty = true;
    saveMeta();
    setStatus({});
  }
  if (m.dirty) schedulePush();
};

const installInterceptor = () => {
  const target = (typeof Storage !== 'undefined' && storage instanceof Storage) ? Storage.prototype : storage;
  rawSet = target.setItem;
  rawRemove = target.removeItem;
  target.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === storage) onLocalWrite(k);
  };
  target.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === storage) onLocalWrite(k);
  };
};

const schedulePush = () => {
  if (!status.enabled) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { flush(); }, PUSH_DELAY_MS);
};

const getClient = async () => {
  if (client) return client;
  if (!clientPromise) {
    clientPromise = (async () => {
      const createClient = createClientOverride || (await import(SUPABASE_JS)).createClient;
      client = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      const { data } = await client.auth.getSession();
      session = data?.session || null;
      client.auth.onAuthStateChange((_event, s) => {
        session = s || null;
        setStatus({ signedIn: !!session, email: session?.user?.email || null });
      });
      setStatus({ signedIn: !!session, email: session?.user?.email || null, state: session ? 'idle' : 'signed-out' });
      return client;
    })().catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
};

// --- the sync pass: pull, reconcile each key, push what needs pushing ---
const runFlush = async () => {
  if (!status.enabled) return { changedLocal: false };
  if (!online()) { setStatus({ state: 'offline' }); return { changedLocal: false }; }
  try { await getClient(); } catch (e) { setStatus({ state: 'offline', error: 'Could not load sync library' }); return { changedLocal: false }; }
  if (!session) { setStatus({ state: 'signed-out' }); return { changedLocal: false }; }

  setStatus({ state: 'syncing', error: null });
  const { data: rows, error } = await client.from('app_state').select('key,value,updated_at');
  if (error) { setStatus({ state: 'error', error: error.message }); return { changedLocal: false }; }
  const cloud = Object.fromEntries((rows || []).map(r => [r.key, r]));

  let changedLocal = false;
  const blocked = [];
  const toPush = [];
  const countsAtRead = {};

  for (const name of NAMES) {
    countsAtRead[name] = writeCount[name] || 0;
    const m = metaFor(name);
    const local = readLocal(name);
    const row = cloud[name];
    const decision = (forceCloudFor.has(name) && row) ? { action: 'take-cloud' } : reconcile(local, row, m);
    forceCloudFor.delete(name);

    if (decision.action === 'take-cloud') {
      writeLocalSilently(name, row.value);
      Object.assign(m, { syncedAt: row.updated_at, hash: hashOf(row.value), dirty: false });
      changedLocal = true;
    } else if (decision.action === 'in-sync') {
      if (row) Object.assign(m, { syncedAt: row.updated_at, hash: hashOf(row.value), dirty: false });
    } else if (decision.action === 'push') {
      if (!allowShrinkFor.has(name) && shrinkBlocked(decision.value, row?.value)) {
        blocked.push(name);
        m.dirty = true;
      } else {
        toPush.push({ name, value: decision.value, mergedFromCloud: hashOf(decision.value) !== hashOf(local.value) });
      }
    }
  }

  if (toPush.length > 0) {
    const { data: pushed, error: pushError } = await client
      .from('app_state')
      .upsert(toPush.map(p => ({ user_id: session.user.id, key: p.name, value: p.value })), { onConflict: 'user_id,key' })
      .select('key,updated_at');
    if (pushError) {
      saveMeta();
      setStatus({ state: 'error', error: pushError.message });
      return { changedLocal };
    }
    const stamp = Object.fromEntries((pushed || []).map(r => [r.key, r.updated_at]));
    for (const p of toPush) {
      const m = metaFor(p.name);
      // An edit made while this pass was running stays dirty for the next pass.
      if ((writeCount[p.name] || 0) !== countsAtRead[p.name]) continue;
      if (p.mergedFromCloud) { writeLocalSilently(p.name, p.value); changedLocal = true; }
      Object.assign(m, { syncedAt: stamp[p.name] || new Date().toISOString(), hash: hashOf(p.value), dirty: false });
      allowShrinkFor.delete(p.name);
    }
  }

  if (changedLocal) {
    // Cloud data is already migrated; don't let V2/V3 run over it.
    ALREADY_MIGRATED_FLAGS.forEach(k => rawSet.call(storage, k, 'true'));
  }
  saveMeta();
  setStatus({
    state: blocked.length ? 'blocked' : 'idle',
    blockedKeys: blocked,
    lastSyncAt: new Date().toISOString(),
    needsReload: status.needsReload || (changedLocal && booted)
  });
  return { changedLocal };
};

export const flush = async () => {
  if (flushing) { flushAgain = true; return flushing; }
  flushing = (async () => {
    let result;
    try {
      do {
        flushAgain = false;
        result = await runFlush();
      } while (flushAgain);
    } catch (e) {
      setStatus({ state: 'error', error: e.message || String(e) });
      result = { changedLocal: false };
    } finally {
      flushing = null;
    }
    return result;
  })();
  return flushing;
};

// --- public API ---

export const initSync = async (options = {}) => {
  storage = options.storage || globalThis.localStorage;
  createClientOverride = options.createClient || null;
  loadMeta();
  installInterceptor();

  if (!SUPABASE_URL && !options.createClient) {
    setStatus({ enabled: false, state: 'disabled' });
    booted = true;
    return status;
  }
  setStatus({ enabled: true, state: 'syncing' });

  // Wait for the first pull, but never hold the app hostage to a slow network.
  const waitMs = options.bootWaitMs ?? BOOT_WAIT_MS;
  await Promise.race([flush(), new Promise(r => setTimeout(r, waitMs))]);
  booted = true;

  if (typeof window !== 'undefined' && !options.noTimers) {
    window.addEventListener('online', () => flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && status.pendingKeys.length) flush();
    });
    setInterval(() => { if (status.pendingKeys.length && status.state !== 'blocked') flush(); }, RETRY_EVERY_MS);
  }
  return status;
};

export const getStatus = () => status;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const syncNow = () => flush();

export const signIn = async (email, password) => {
  await getClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  session = data.session;
  setStatus({ signedIn: true, email: session.user.email });
  return flush(); // { changedLocal } -- the caller reloads if cloud data came down
};

export const signOut = async () => {
  if (!client) return;
  await client.auth.signOut();
  session = null;
  setStatus({ signedIn: false, email: null, state: 'signed-out' });
};

// The "yes, I meant to shrink it" escape hatch for a blocked push.
export const overwriteCloud = (names = status.blockedKeys) => {
  names.forEach(n => allowShrinkFor.add(n));
  return flush();
};

// The opposite: throw away this phone's blocked changes and take the cloud copy.
export const keepCloud = (names = status.blockedKeys) => {
  names.forEach(n => forceCloudFor.add(n));
  return flush();
};

export const listBackups = async () => {
  await getClient();
  const { data, error } = await client
    .from('daily_backups').select('id,taken_at').order('taken_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data || [];
};

export const downloadBackup = async (id) => {
  await getClient();
  const { data, error } = await client.from('daily_backups').select('taken_at,snapshot').eq('id', id).single();
  if (error) throw error;
  const day = new Date(data.taken_at);
  const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const blob = new Blob([JSON.stringify(data.snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hypertrophy-backup-v8-cloud-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

if (typeof window !== 'undefined') {
  window.HypertrophySync = { getStatus, syncNow, overwriteCloud, keepCloud, listBackups };
}
