// IndexedDB: turele procesate (private, doar pe dispozitiv), fișierul original, setările, înregistrarea în curs.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProcessedRide } from '../core/types';

export interface StoredRide {
  ride_id: string;
  processed: ProcessedRide;
  file_name: string;
  file: ArrayBuffer | null; // ZIP-ul original (pentru export și reprocesare)
  included: boolean; // includerea în stratul agregat: alegere explicită, pe tură
  imported_at: number;
  perceived?: number | null; // nota 1–5 a biciclistului
}

export interface RecChunk {
  id?: number;
  session: string;
  kind: 'motion' | 'gps' | 'events';
  data: unknown;
}

interface SGDB extends DBSchema {
  rides: { key: string; value: StoredRide };
  kv: { key: string; value: unknown };
  rec: { key: number; value: RecChunk; indexes: { session: string } };
}

let dbp: Promise<IDBPDatabase<SGDB>> | null = null;
export function db() {
  if (!dbp)
    dbp = openDB<SGDB>('shockgrid', 1, {
      upgrade(d) {
        d.createObjectStore('rides', { keyPath: 'ride_id' });
        d.createObjectStore('kv');
        const r = d.createObjectStore('rec', { keyPath: 'id', autoIncrement: true });
        r.createIndex('session', 'session');
      },
    });
  return dbp;
}

export async function listRides(): Promise<StoredRide[]> {
  try {
    return await (await db()).getAll('rides');
  } catch (e) {
    console.warn('IndexedDB indisponibil', e);
    return [];
  }
}
export async function putRide(r: StoredRide) { await (await db()).put('rides', r); }
export async function deleteRide(id: string) { await (await db()).delete('rides', id); }
export async function getRide(id: string) { return (await db()).get('rides', id); }
export async function kvGet<T>(k: string): Promise<T | undefined> {
  try { return (await (await db()).get('kv', k)) as T | undefined; } catch { return undefined; }
}
export async function kvSet(k: string, v: unknown) { await (await db()).put('kv', v, k); }
export async function clearAll() {
  const d = await db();
  await d.clear('rides');
  await d.clear('kv');
  await d.clear('rec');
}
export async function recAppend(c: RecChunk) { await (await db()).add('rec', c); }
export async function recGet(session: string): Promise<RecChunk[]> { return (await db()).getAllFromIndex('rec', 'session', session); }
export async function recSessions(): Promise<string[]> {
  const d = await db();
  const tx = d.transaction('rec');
  const set = new Set<string>();
  let cur = await tx.store.index('session').openKeyCursor(null, 'nextunique');
  while (cur) { set.add(cur.key as string); cur = await cur.continue(); }
  return [...set];
}
export async function recDelete(session: string) {
  const d = await db();
  const keys = await d.getAllKeysFromIndex('rec', 'session', session);
  const tx = d.transaction('rec', 'readwrite');
  await Promise.all(keys.map((k) => tx.store.delete(k)));
  await tx.done;
}
