// --- ⌚ GOOGLE HEALTH IMPORT ---
// Reads a Google Takeout "Google Health" export (the ZIP itself, several ZIP parts, or
// CSVs pulled out of it) and turns it into one record per day:
//   { date, sleepHours, deepSleepPercent, steps, caloriesBurned, activeCalories }
// then merges those into the app's sleep entries. Everything runs on the phone; the
// export is never uploaded anywhere.
//
// Facts about the export this code depends on (checked against a real Nov 2026 export):
//  - Sleep:   Health Fitness Data_GoogleData/UserSleeps_YYYY-MM-DD.csv (one file per year)
//             + UserSleepStages_YYYY-MM-DD.csv. Times are UTC with a separate utc offset.
//  - Most nights appear TWICE: algorithm sleep_session_v1 and sleep_session_v2, overlapping.
//    The Google Health app shows v2 -- every hand-entered night matched v2 to the minute,
//    using minutes_asleep for duration and DEEP minutes / minutes_asleep for deep %.
//  - Steps/Calories/Active energy: Physical Activity_GoogleData/<Folder>/<name>_YYYY-MM-01.csv
//    (one file per month), per-minute rows, timestamps in true UTC ("Z"). They are summed
//    by LOCAL calendar day -- bucketing by the UTC date would shift ~6h of every evening
//    into the next day (the same class of bug as the old UTC-midnight workout dates).
//  - Total calories INCLUDES basal burn. active_energy_burned EXCLUDES it.
//
// Arithmetic stays here in JS; nothing in this file asks the AI for numbers.

const FFLATE = 'https://esm.sh/fflate@0.8.2';

// Fields the importer may write. Sleep fields are only written when the user hasn't
// typed them in; activity fields are only ever written by the importer.
export const SLEEP_FIELDS = ['sleepHours', 'deepSleepPercent'];
export const ACTIVITY_FIELDS = ['steps', 'caloriesBurned', 'activeCalories'];

// --- which files we want ---
const KINDS = [
  { kind: 'sleeps', re: /(?:^|\/)UserSleeps_(\d{4}-\d{2}-\d{2})\.csv$/ },
  { kind: 'stages', re: /(?:^|\/)UserSleepStages_(\d{4}-\d{2}-\d{2})\.csv$/ },
  { kind: 'steps', re: /(?:^|\/)steps_(\d{4}-\d{2}-\d{2})\.csv$/ },
  { kind: 'calories', re: /(?:^|\/)calories_(\d{4}-\d{2}-\d{2})\.csv$/ },
  { kind: 'active', re: /(?:^|\/)active_energy_burned_(\d{4}-\d{2}-\d{2})\.csv$/ }
];

export const classify = (path) => {
  for (const { kind, re } of KINDS) {
    const m = path.match(re);
    if (m) return { kind, start: m[1] };
  }
  return null;
};

// Each file covers [its start date, the next file's start date). Keep the last file that
// starts on/before `from`, plus every file starting inside (from, to]. Without this, a full
// export (2019 onward, ~170 MB of per-minute CSVs) would be decompressed and parsed.
export const pickFiles = (entries, from, to) => {
  const byKind = {};
  for (const e of entries) (byKind[e.kind] ||= []).push(e);
  const out = [];
  for (const list of Object.values(byKind)) {
    list.sort((a, b) => a.start.localeCompare(b.start));
    const before = list.filter(e => e.start <= from);
    if (before.length) out.push(before[before.length - 1]);
    out.push(...list.filter(e => e.start > from && e.start <= to));
  }
  return out;
};

// --- small helpers ---
const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "2026-10-04T11:22:30Z" + "-06:00" -> "2026-10-04" (the wall-clock date where it happened).
// Uses the offset recorded with the sleep, not the phone's zone, so travel nights land right.
export const dateAtOffset = (utcIso, offset) => {
  const t = Date.parse(utcIso);
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset || '');
  const shift = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000 : 0;
  return new Date(t + shift).toISOString().slice(0, 10);
};

// Minimal CSV reader for these exports (no quoted commas in the columns we read).
export const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const head = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    head.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
};

const versionRank = (v) => {
  const m = /v(\d+)/.exec(v || '');
  return m ? Number(m[1]) : 0;
};

// --- sleep: one main sleep per wake-up date ---
// Overlapping sessions are the same night recorded twice; keep the newest algorithm.
// Of what's left, the longest sleep ending on that date is the night (naps are ignored).
export const summarizeSleep = (sleepRows, stageRows) => {
  const deepBySleep = {};
  for (const s of stageRows) {
    if (s.sleep_stage_type !== 'DEEP') continue;
    const mins = (Date.parse(s.sleep_stage_end) - Date.parse(s.sleep_stage_start)) / 60000;
    if (mins > 0) deepBySleep[s.sleep_id] = (deepBySleep[s.sleep_id] || 0) + mins;
  }

  const sessions = sleepRows
    .map(r => ({
      id: r.sleep_id,
      type: r.sleep_type,
      rank: versionRank(r.algorithm_version),
      asleep: Number(r.minutes_asleep) || 0,
      start: Date.parse(r.sleep_start),
      end: Date.parse(r.sleep_end),
      date: dateAtOffset(r.sleep_end, r.end_utc_offset)
    }))
    .filter(s => s.asleep > 0 && Number.isFinite(s.start) && Number.isFinite(s.end));

  // Newest algorithm first, then longest; keep a session only if it doesn't overlap one kept.
  sessions.sort((a, b) => (b.rank - a.rank) || (b.asleep - a.asleep));
  const kept = [];
  for (const s of sessions) {
    if (!kept.some(k => s.start < k.end && k.start < s.end)) kept.push(s);
  }

  const nights = {};
  for (const s of kept) {
    if (!nights[s.date] || s.asleep > nights[s.date].asleep) nights[s.date] = s;
  }

  const out = {};
  for (const [date, s] of Object.entries(nights)) {
    // CLASSIC sessions have no stages; a 0% deep reading would wrongly score as a terrible
    // night, so those nights are reported as missing stages rather than imported.
    if (s.type !== 'STAGES') { out[date] = { noStages: true }; continue; }
    const deep = deepBySleep[s.id] || 0;
    out[date] = {
      sleepHours: s.asleep / 60,
      deepSleepPercent: (deep / s.asleep) * 100
    };
  }
  return out;
};

// --- steps / calories: sum per LOCAL day ---
export const sumByLocalDay = (rows, column) => {
  const out = {};
  for (const r of rows) {
    const t = Date.parse(r.timestamp);
    const v = Number(r[column]);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    const d = localDate(new Date(t));
    out[d] = (out[d] || 0) + v;
  }
  return out;
};

// --- reading files ---
const decode = (chunks) => {
  let len = 0;
  chunks.forEach(c => { len += c.length; });
  const all = new Uint8Array(len);
  let o = 0;
  chunks.forEach(c => { all.set(c, o); o += c.length; });
  return new TextDecoder().decode(all);
};

// Streams a ZIP so a 180 MB export never sits in memory whole; only the wanted CSVs are
// decompressed. `want(path)` decides per file as its header goes by.
const readZip = async (file, want, fflate, onProgress) => {
  const texts = {};
  const pending = [];
  const unzipper = new fflate.Unzip();
  unzipper.register(fflate.UnzipInflate);
  unzipper.onfile = (f) => {
    if (!want(f.name)) return;
    pending.push(new Promise((resolve, reject) => {
      const chunks = [];
      f.ondata = (err, chunk, final) => {
        if (err) { reject(err); return; }
        chunks.push(chunk);
        if (final) { texts[f.name] = decode(chunks); resolve(); }
      };
      f.start();
    }));
  };
  const reader = file.stream().getReader();
  let done = 0;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) { unzipper.push(new Uint8Array(0), true); break; }
    unzipper.push(value);
    done += value.length;
    if (onProgress) onProgress(done / file.size);
  }
  await Promise.all(pending);
  return texts;
};

// Lists file names in a ZIP from its central directory (end of file) without reading it all.
const listZip = async (file) => {
  const tailSize = Math.min(file.size, 66000);
  const tail = new Uint8Array(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${file.name} doesn't look like a ZIP file`);
  const dv = new DataView(tail.buffer);
  let count = dv.getUint16(eocd + 10, true);
  let cdSize = dv.getUint32(eocd + 12, true);
  let cdOffset = dv.getUint32(eocd + 16, true);
  // ZIP64 (archives over 4 GB or 65k files) keeps the real values in a second record.
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
      const z64 = Number(dv.getBigUint64(loc + 8, true));
      const rec = new DataView(await file.slice(z64, z64 + 56).arrayBuffer());
      count = Number(rec.getBigUint64(32, true));
      cdSize = Number(rec.getBigUint64(40, true));
      cdOffset = Number(rec.getBigUint64(48, true));
    }
  }
  const cd = new Uint8Array(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const cdv = new DataView(cd.buffer);
  const names = [];
  let p = 0;
  const dec = new TextDecoder();
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    const nameLen = cdv.getUint16(p + 28, true);
    const extraLen = cdv.getUint16(p + 30, true);
    const commentLen = cdv.getUint16(p + 32, true);
    names.push(dec.decode(cd.subarray(p + 46, p + 46 + nameLen)));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
};

/**
 * Reads the chosen files and returns per-day health data for dates in [from, to].
 * @param {File[]} files - Takeout ZIP(s) and/or CSVs
 * @param {{from: string, to: string, onProgress?: Function, fflate?: object}} opts
 */
export const readHealthExport = async (files, { from, to, onProgress, fflate } = {}) => {
  const lib = fflate || await import(FFLATE);
  const sources = []; // { kind, start, path, file, zip }

  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const names = await listZip(file);
      names.forEach(path => {
        const c = classify(path);
        if (c) sources.push({ ...c, path, file, zip: true });
      });
    } else {
      const c = classify(file.name);
      if (c) sources.push({ ...c, path: file.name, file, zip: false });
    }
  }
  if (!sources.length) {
    throw new Error('No Google Health sleep, steps or calories files found. Pick the Takeout ZIP (or the CSVs inside Takeout/Google Health).');
  }

  const chosen = pickFiles(sources, from, to);
  const texts = {}; // path -> text
  const zips = [...new Set(chosen.filter(s => s.zip).map(s => s.file))];
  for (const [i, zip] of zips.entries()) {
    const wanted = new Set(chosen.filter(s => s.file === zip).map(s => s.path));
    const got = await readZip(zip, name => wanted.has(name), lib,
      onProgress ? (f) => onProgress((i + f) / zips.length) : null);
    Object.assign(texts, got);
  }
  for (const s of chosen.filter(s => !s.zip)) texts[s.path] = await s.file.text();

  const rowsOf = (kind) => chosen.filter(s => s.kind === kind).flatMap(s => parseCsv(texts[s.path] || ''));
  const sleep = summarizeSleep(rowsOf('sleeps'), rowsOf('stages'));
  const steps = sumByLocalDay(rowsOf('steps'), 'steps');
  const calories = sumByLocalDay(rowsOf('calories'), 'calories');
  const active = sumByLocalDay(rowsOf('active'), 'Kilocalories');

  const days = {};
  const inRange = (d) => d >= from && d <= to;
  const put = (d, patch) => { if (inRange(d)) days[d] = { ...(days[d] || {}), ...patch }; };
  Object.entries(sleep).forEach(([d, s]) => put(d, s));
  Object.entries(steps).forEach(([d, v]) => put(d, { steps: Math.round(v) }));
  Object.entries(calories).forEach(([d, v]) => put(d, { caloriesBurned: Math.round(v) }));
  Object.entries(active).forEach(([d, v]) => put(d, { activeCalories: Math.round(v) }));

  const kinds = [...new Set(chosen.map(s => s.kind))];
  return { days, kinds };
};

/**
 * Merges imported days into sleep entries. Never touches what the user typed:
 *  - sleepHours/deepSleepPercent are written only if the entry has no sleep yet, or if
 *    they came from an earlier import (listed in entry.importedFields).
 *  - steps/calories are written if missing or previously imported (so re-importing a
 *    month later refreshes them).
 *  - A new entry is created only for a night with sleep data. Activity alone never creates
 *    an entry: an entry with no sleep would feed 0h into the recovery math.
 *  - Imported nights get no recoveryRating; recovery.js already treats a missing rating
 *    as neutral rather than as 0.
 * @returns {{ next: Array, stats: object, changes: Array }}
 */
export const mergeHealthImport = (sleepEntries, days, { makeId } = {}) => {
  const newId = makeId || (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const byDate = new Map(sleepEntries.map(e => [e.date, e]));
  const stats = { created: 0, updated: 0, unchanged: 0, keptManualSleep: 0, skippedNoSleep: 0, noStages: 0 };
  const changes = [];
  const replaced = new Map();
  const added = [];

  for (const date of Object.keys(days).sort()) {
    const day = days[date];
    const existing = byDate.get(date);
    if (day.noStages) stats.noStages++;
    const hasSleep = Number(day.sleepHours) > 0;

    if (!existing) {
      if (!hasSleep) { stats.skippedNoSleep++; continue; }
      const entry = { id: newId(), date, importedFields: [] };
      for (const f of [...SLEEP_FIELDS, ...ACTIVITY_FIELDS]) {
        if (day[f] !== undefined) { entry[f] = day[f]; entry.importedFields.push(f); }
      }
      added.push(entry);
      stats.created++;
      changes.push({ date, action: 'new', entry });
      continue;
    }

    const imported = new Set(existing.importedFields || []);
    const userTypedSleep = Number(existing.sleepHours) > 0 && !imported.has('sleepHours');
    const next = { ...existing };
    let changed = false;
    const set = (f) => {
      if (day[f] === undefined) return;
      if (next[f] !== day[f]) changed = true;
      next[f] = day[f];
      imported.add(f);
    };
    if (hasSleep) {
      if (userTypedSleep) stats.keptManualSleep++;
      else SLEEP_FIELDS.forEach(set);
    }
    ACTIVITY_FIELDS.forEach(f => {
      const userTyped = existing[f] !== undefined && existing[f] !== null && !imported.has(f);
      if (!userTyped) set(f);
    });
    next.importedFields = [...imported];
    if (changed || next.importedFields.length !== (existing.importedFields || []).length) {
      replaced.set(existing.id, next);
      stats.updated++;
      changes.push({ date, action: 'update', entry: next });
    } else {
      stats.unchanged++;
    }
  }

  const next = [...sleepEntries.map(e => replaced.get(e.id) || e), ...added];
  return { next, stats, changes };
};

// When the sleep form saves, it rebuilds the entry from scratch. This carries the imported
// activity numbers over so editing a night's sleep doesn't silently erase its steps.
// The edited sleep fields now count as typed by the user.
export const keepActivityFields = (newEntry, oldEntry) => {
  if (!oldEntry) return newEntry;
  const out = { ...newEntry };
  for (const f of ACTIVITY_FIELDS) {
    if (out[f] === undefined && oldEntry[f] !== undefined) out[f] = oldEntry[f];
  }
  const keptImported = (oldEntry.importedFields || []).filter(f => ACTIVITY_FIELDS.includes(f));
  if (keptImported.length) out.importedFields = keptImported;
  return out;
};
