// Local leaderboard (Ticket-04 §3): top 10, score desc, ties -> earlier achieved_at first. Stored on local disk.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export const MAX_ENTRIES = 10;
// 3-12 characters: ASCII letters, digits, underscore — plus Vietnamese letters with diacritics (bonus).
const NAME_RE = /^[\p{Script=Latin}\p{M}0-9_]{3,12}$/u;
const LETTER_OK = /^[A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF\u0300-\u036F]+$/u;

export function validateName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim();
  const len = [...name].length;
  if (len < 3 || len > 12 || !NAME_RE.test(name) || !LETTER_OK.test(name)) return null;
  return name;
}

/** ISO 8601 with the local UTC offset, e.g. 2026-11-20T15:31:02+07:00 */
export function isoWithOffset(d = new Date()) {
  const pad = (n) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    + `${off >= 0 ? '+' : '-'}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

export function sortEntries(entries) {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || Date.parse(a.e.achieved_at) - Date.parse(b.e.achieved_at) || a.i - b.i)
    .map((x) => x.e);
}

/** Returns the new top-10 list, or throws on invalid input. */
export function addEntry(entries, { name, score, nights_won, seed }, now = new Date()) {
  const n = validateName(name);
  if (!n) throw new Error('name must be 3-12 characters: letters, digits or _');
  if (!Number.isInteger(score) || score < 0) throw new Error('score must be a non-negative integer');
  if (!Number.isInteger(nights_won) || nights_won < 0 || nights_won > 3) throw new Error('nights_won must be 0-3');
  if (!Number.isInteger(seed)) throw new Error('seed must be an integer');
  const entry = { name: n, score, nights_won, achieved_at: isoWithOffset(now), seed };
  return sortEntries([...entries, entry]).slice(0, MAX_ENTRIES);
}

export function load(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data.entries) ? sortEntries(data.entries).slice(0, MAX_ENTRIES) : [];
  } catch { return []; }
}

export function save(file, entries) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify({ entries }, null, 2) + '\n');
  renameSync(tmp, file); // atomic replace: a crash never leaves a half-written leaderboard
}
