// Sesiunea de tură live: un singur Recorder la nivel de aplicație, ca înregistrarea să continue când
// utilizatorul schimbă ecranul. La oprire, tura trece prin exact aceeași procesare ca un import.
import { Recorder, buildZipFromSession, recDelete, type LiveStats } from '../capture/recorder';
import { importBytes } from '../state/store';

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

export interface StopResult { rideId: string | null; zip: Uint8Array; error: string | null; shocks: number }

export async function stopRide(onProgress?: (s: string, f: number) => void): Promise<StopResult> {
  const r = rec;
  if (!r) throw new Error('Nu există o tură în curs.');
  rec = null;
  if (timer !== null) clearInterval(timer);
  timer = null;
  stats = null;
  emit();
  const zip = await r.stop();
  try {
    const { ride } = await importBytes(`${r.session}.zip`, zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, null, onProgress);
    await recDelete(r.session);
    return { rideId: ride.ride_id, zip, error: null, shocks: ride.shocks.filter((s) => s.located).length };
  } catch (e) {
    return { rideId: null, zip, error: (e as Error).message, shocks: 0 };
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
