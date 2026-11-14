// Sesiunea de tură live: un singur Recorder la nivel de aplicație, ca înregistrarea să continue când
// utilizatorul schimbă ecranul. La oprire, tura trece prin exact aceeași procesare ca un import.
import { Recorder, buildZipFromSession, recDelete, type LiveStats } from '../capture/recorder';
import { importBytes } from '../state/store';
import { reloadIfSafe } from './update';

let rec: Recorder | null = null;
let stats: LiveStats | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeRide(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function rideStats(): LiveStats | null { return stats; }
export function rideActive(): boolean { return rec !== null; }

export async function startRide(meta: Record<string, unknown>) {
  if (rec) return;
  rec = new Recorder(meta);
  await rec.begin();
  stats = rec.stats();
  timer = window.setInterval(() => { stats = rec?.stats() ?? null; emit(); }, 1000);
  emit();
}

export function pauseRide() { rec?.pause(); stats = rec?.stats() ?? null; emit(); }
export function resumeRide() { rec?.resume(); stats = rec?.stats() ?? null; emit(); }
export function markRide(detail?: string) { rec?.mark(detail); }

export interface StopResult { rideId: string | null; zip: Uint8Array; error: string | null; shocks: number; empty?: boolean }

/** reîncearcă sursele după ce utilizatorul a schimbat permisiunile (GPS repornit; permisiunea de mișcare
 * se cere separat, sincron, din click) */
export function retryRideSources() { rec?.watchGps(); stats = rec?.stats() ?? null; emit(); }

/** oprește tura fără să o salveze (de ex. nu s-a înregistrat nimic) */
export async function discardRide() {
  const r = rec;
  if (!r) return;
  rec = null;
  if (timer !== null) clearInterval(timer);
  timer = null;
  stats = null;
  emit();
  try { await r.stop(); } catch { /* ignorat */ }
  await recDelete(r.session).catch(() => {});
}

export async function stopRide(onProgress?: (s: string, f: number) => void): Promise<StopResult> {
  const r = rec;
  if (!r) throw new Error('Nu există o tură în curs.');
  rec = null;
  if (timer !== null) clearInterval(timer);
  timer = null;
  stats = null;
  emit();
  const empty = r.isEmpty();
  const zip = await r.stop();
  if (empty) {
    // nimic de salvat: nu creăm o tură goală care să pară reușită
    await recDelete(r.session).catch(() => {});
    setTimeout(() => reloadIfSafe(), 4000);
    return { rideId: null, zip, error: null, shocks: 0, empty: true };
  }
  try {
    const { ride } = await importBytes(`${r.session}.zip`, zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, null, onProgress);
    await recDelete(r.session);
    return { rideId: ride.ride_id, zip, error: null, shocks: ride.shocks.filter((s) => s.located).length };
  } catch (e) {
    return { rideId: null, zip, error: (e as Error).message, shocks: 0 };
  } finally {
    setTimeout(() => reloadIfSafe(), 4000); // o actualizare amânată se aplică după tură
  }
}

export async function recoverSession(session: string): Promise<StopResult> {
  const zip = await buildZipFromSession(session, { label: 'tură recuperată' });
  try {
    const { ride } = await importBytes(`${session}.zip`, zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, null);
    await recDelete(session);
    return { rideId: ride.ride_id, zip, error: null, shocks: ride.shocks.filter((s) => s.located).length };
  } catch (e) {
    return { rideId: null, zip, error: (e as Error).message, shocks: 0 };
  }
}
