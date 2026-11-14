// Fluxul de import din aplicație (store), cu worker-ul înlocuit de procesarea sincronă și graful sintetic.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRideFile } from '../src/core/io';
import { buildShockGridZip, type RecorderMotionRow } from '../src/core/io/shockgrid';
import { processRide } from '../src/core/process';
import { DEFAULT_ROUTE_OPTIONS, Router } from '../src/core/route';
import { planRoutes } from '../src/core/routeplan';
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

describe('scenariul demo: două rute între aceleași A și B, fiecare parcursă de două ori', () => {
  // A(0) ─ C(1) ─ B(2): dreaptă, 1000 m; A ─ D(3) ─ E(4) ─ B: ocol prin nord, ~1600 m
  const dLat = (m: number) => m / 111195;
  const N: [number, number][] = [[LAT, LON], [LAT, LON + dLon(500)], [LAT, LON + dLon(1000)], [LAT + dLat(300), LON], [LAT + dLat(300), LON + dLon(1000)]];
  const g2 = makeGraph(N, [{ f: 0, t: 1 }, { f: 1, t: 2 }, { f: 0, t: 3 }, { f: 3, t: 4 }, { f: 4, t: 2 }]);
  const R1 = [N[0], N[1], N[2]], R2 = [N[0], N[3], N[4], N[2]];
  function rideOn(pts: [number, number][], uuid: string, vib: number, seed: number) {
    const { path, seconds } = pathAlong(pts, 5, 2, seed);
    return toZip(syntheticRide({ seconds: Math.floor(seconds), fs: 100, vibAmp: vib, speed: 5, path, acc: 5 }), uuid);
  }
  const plan = () => planRoutes(g2, store.getState().layer, new Router(g2), 0, 2, DEFAULT_ROUTE_OPTIONS);
  const statusOf = (e: number) => store.getState().layer.edges.get(e)?.status ?? 'UNKNOWN';

  it('fără ture: confort necunoscut; după ture: comparație reală; ștergerea revine exact', async () => {
    store._testSetGraph(g2);
    // praguri fixe DOAR în test: vibrația sintetică e o sinusoidă pură (RMS identic pe toate ferestrele),
    // iar percentilele echipei ar degenera; nu calibrăm aplicația pe date sintetice
    await store.updateSettings({ fixedThresholds: [1, 1.6, 2.4, 3.6] });
    expect(plan().verdict.kind).toBe('nodata');

    // ruta 1 (scurtă) denivelată, de două ori
    await store.importBytes('r1a.zip', rideOn(R1, 'r1-a', 3.2, 3), null);
    await store.importBytes('r1b.zip', rideOn(R1, 'r1-b', 3.2, 5), null);
    // reimportul aceleiași ture nu dublează trecerile
    await expect(store.importBytes('r1a-copie.zip', rideOn(R1, 'r1-a', 3.2, 3), null)).rejects.toThrow(/deja importată/);
    expect([0, 1].map(statusOf)).toEqual(['MEASURED', 'MEASURED']);
    expect(store.getState().layer.edges.get(0)!.n_passes).toBe(2);
    expect([2, 3, 4].map(statusOf)).toEqual(['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
    // doar ruta scurtă e măsurată: nu se inventează o alternativă „mai confortabilă”
    const p1 = plan();
    expect(p1.verdict.kind).toBe('same');
    expect(p1.options).toHaveLength(1);

    // ruta 2 (ocol) netedă, de două ori
    const r2a = await store.importBytes('r2a.zip', rideOn(R2, 'r2-a', 0.6, 7), null);
    const before2b = new Map([...store.getState().layer.edges].map(([k, e]) => [k, { ...e }]));
    const r2b = await store.importBytes('r2b.zip', rideOn(R2, 'r2-b', 0.6, 9), null);
    expect([2, 3, 4].map(statusOf)).toEqual(['MEASURED', 'MEASURED', 'MEASURED']);
    const p2 = plan();
    expect(p2.verdict.kind).toBe('better');
    expect(p2.options).toHaveLength(2);
    const alt = p2.options[1];
    expect(alt.r.edges.map((e) => e.edge)).toEqual([2, 3, 4]);
    expect(alt.knownGoodPct!).toBeGreaterThan(p2.options[0].knownGoodPct!);
    expect(p2.verdict.text).toMatch(/față de cea mai scurtă/);

    // ștergerea unei ture scoate exact contribuția ei
    await store.removeRide(r2b.ride.ride_id);
    const now = store.getState().layer.edges;
    for (const [k, e] of before2b) expect({ ...now.get(k)! }).toEqual(e);
    await store.removeRide(r2a.ride.ride_id);
    expect([2, 3, 4].map(statusOf)).toEqual(['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
    expect(plan().verdict.kind).toBe('same');
  }, 60000);
});
