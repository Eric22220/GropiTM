// Fluxul de import din aplicație (store), cu worker-ul înlocuit de procesarea sincronă și graful sintetic.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRideFile } from '../src/core/io';
import { buildShockGridZip, type RecorderMotionRow } from '../src/core/io/shockgrid';
import { processRide } from '../src/core/process';
import type { RawRide } from '../src/core/types';
import * as idb from '../src/storage/idb';
import { makeGraph, pathAlong, syntheticRide } from './helpers';

vi.mock('../src/worker/client', () => ({
  warmWorker: () => {},
  processInWorker: async (name: string, bytes: ArrayBuffer, cfg: never, declared: never) => processRide(parseRideFile(name, new Uint8Array(bytes)), { cfg, declaredSurface: declared }),
}));
const store = await import('../src/state/store');

const LAT = 45.75, LON = 21.22;
const dLon = (m: number) => m / 77600;
// o stradă dreaptă de 1,2 km, în 4 muchii
const g = makeGraph([0, 300, 600, 900, 1200].map((m) => [LAT, LON + dLon(m)] as [number, number]), [{ f: 0, t: 1 }, { f: 1, t: 2 }, { f: 2, t: 3 }, { f: 3, t: 4 }]);

function toZip(raw: RawRide, uuid: string): ArrayBuffer {
  const motion: RecorderMotionRow[] = Array.from(raw.motion.t, (t, i) => ({ t, interval: 10, agx: raw.motion.x[i], agy: raw.motion.y[i], agz: raw.motion.z[i], ax: null, ay: null, az: null, ra: 1, rb: 1, rg: 1 }));
  const gps = raw.gps.map((f) => ({ fix_t: f.t, recv_t: f.t, lat: f.lat, lon: f.lon, acc: f.acc, alt: null, alt_acc: null, speed: f.speed, heading: f.heading }));
  const z = buildShockGridZip({ meta: { ride_uuid: uuid, label: uuid }, motion, gps, events: [] });
  return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}
function ride(uuid: string, opts: { speed?: number; acc?: number; vib?: number } = {}) {
  const speed = opts.speed ?? 5;
  const { path } = pathAlong([[LAT, LON], [LAT, LON + dLon(1200)]], Math.max(speed, 0.01), 2, uuid.length);
  const raw = syntheticRide({ seconds: 200, fs: 100, vibAmp: opts.vib ?? 1.5, speed, path, acc: opts.acc ?? 5 });
  return toZip(raw, uuid);
}
const covered = () => [...store.getState().layer.edges.values()].filter((e) => e.status !== 'UNKNOWN');

beforeEach(async () => {
  await idb._resetDb();
  await new Promise<void>((r) => { const q = indexedDB.deleteDatabase('shockgrid'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  await store.wipeAll();
  store._testSetGraph(g);
});

describe('import → hartă → ștergere (ca în aplicație)', () => {
  it('harta se actualizează imediat; reimportul e refuzat; ștergerea scoate exact contribuția turei', async () => {
    expect(covered()).toHaveLength(0);
    const v0 = store.getState().layer.version;
    const a = await store.importBytes('a.zip', ride('tura-A'), null);
    expect(store.getState().layer.version).toBeGreaterThan(v0);
    const afterA = new Map([...store.getState().layer.edges].map(([k, e]) => [k, { ...e }]));
    expect(covered().length).toBeGreaterThan(0);
    expect(a.report.diff.new_covered).toBeGreaterThan(0);
    await expect(store.importBytes('a-copie.zip', ride('tura-A'), null)).rejects.toThrow(/deja importată/);
    const b = await store.importBytes('b.zip', ride('tura-B', { vib: 3 }), null);
    expect([...store.getState().layer.edges.values()].some((e) => e.n_passes >= 2)).toBe(true);
    await store.removeRide(b.ride.ride_id);
    const now = store.getState().layer.edges;
    expect([...now.keys()].sort()).toEqual([...afterA.keys()].sort());
    for (const [k, e] of afterA) expect({ ...now.get(k)! }).toEqual(e);
    await store.removeRide(a.ride.ride_id);
    expect(covered()).toHaveLength(0);
    expect(await idb.listRides()).toHaveLength(0);
  });
  it('o înregistrare staționară nu produce RVI și nu colorează nicio stradă', async () => {
    const r = await store.importBytes('stat.zip', ride('stationar', { speed: 0.2 }), null);
    expect(r.ride.summary.n_windows_valid).toBe(0);
    expect(covered()).toHaveLength(0);
  });
  it('GPS slab (> 20 m) nu e potrivit pe străzi: străzile rămân necunoscute', async () => {
    const r = await store.importBytes('gps.zip', ride('gps-slab', { acc: 35 }), null);
    expect(r.ride.match.fixes_used).toBe(0);
    expect(covered()).toHaveLength(0);
  });
});
