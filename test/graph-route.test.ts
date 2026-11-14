import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { aggregate, type RideContribution } from '../src/core/aggregate';
import { DEFAULT_CONFIG } from '../src/core/config';
import { Graph, type GraphJson } from '../src/core/graph';
import { matchFixes } from '../src/core/mapmatch';
import { DEFAULT_ROUTE_OPTIONS, Router, bikeBlockReason, routeStats } from '../src/core/route';
import type { GpsFix } from '../src/core/types';
import { rng } from '../src/core/stats';
import { makeGraph } from './helpers';

// A(0) ─ C(1) ─ B(2) scurt; A ─ D(3) ─ B lung
const LAT = 45.75, LON = 21.22;
const dLat = (m: number) => m / 111195, dLon = (m: number) => m / 77600;
function twoRoutes() {
  return makeGraph(
    [[LAT, LON], [LAT, LON + dLon(500)], [LAT, LON + dLon(1000)], [LAT + dLat(300), LON + dLon(500)]],
    [{ f: 0, t: 1 }, { f: 1, t: 2 }, { f: 0, t: 3 }, { f: 3, t: 2 }],
  );
}

describe('rutare A*', () => {
  const g = twoRoutes();
  const rt = new Router(g);
  it('w_c = 0 dă exact drumul minim', () => {
    const r = rt.route(0, 2, null, { ...DEFAULT_ROUTE_OPTIONS, w_c: 0 });
    expect(r.found).toBe(true);
    expect(r.edges.map((e) => e.edge)).toEqual([0, 1]);
    expect(r.length).toBeCloseTo(1000, -1);
  });
  it('sensul unic e respectat', () => {
    const g2 = makeGraph([[LAT, LON], [LAT, LON + dLon(500)]], [{ f: 0, t: 1, oneway: 1 }]);
    const r2 = new Router(g2);
    expect(r2.route(0, 1, null, DEFAULT_ROUTE_OPTIONS).found).toBe(true);
    expect(r2.route(1, 0, null, DEFAULT_ROUTE_OPTIONS).found).toBe(false);
  });
  it('trotuarele obișnuite nu sunt folosite niciodată pentru bicicletă', () => {
    const g3 = makeGraph([[LAT, LON], [LAT, LON + dLon(500)]], [{ f: 0, t: 1, kind: 'trotuar', highway: 'footway' }]);
    const r3 = new Router(g3);
    expect(r3.route(0, 1, null, DEFAULT_ROUTE_OPTIONS).found).toBe(false);
    // opțiunea veche „allowSidewalks” (salvată în setări vechi) nu mai are efect
    expect(r3.route(0, 1, null, { ...DEFAULT_ROUTE_OPTIONS, allowSidewalks: true } as typeof DEFAULT_ROUTE_OPTIONS).found).toBe(false);
  });
  const one = (e: { kind?: 'trotuar' | 'alee' | 'pista' | 'carosabil'; highway?: string; bicycle?: string }) => {
    const gx = makeGraph([[LAT, LON], [LAT, LON + dLon(300)]], [{ f: 0, t: 1, ...e }]);
    return { ok: new Router(gx).route(0, 1, null, DEFAULT_ROUTE_OPTIONS).found, reason: bikeBlockReason(gx, 0) };
  };
  it.each([
    ['trotuar fără etichetă', { kind: 'trotuar', highway: 'footway' }],
    ['trotuar bicycle=no', { kind: 'trotuar', highway: 'footway', bicycle: 'no' }],
    ['trotuar bicycle=dismount', { kind: 'trotuar', highway: 'footway', bicycle: 'dismount' }],
    ['trotuar bicycle=permissive', { kind: 'trotuar', highway: 'footway', bicycle: 'permissive' }],
    ['zonă pietonală fără drept', { kind: 'alee', highway: 'pedestrian' }],
    ['path fără drept', { kind: 'alee', highway: 'path' }],
    ['track fără drept', { kind: 'alee', highway: 'track' }],
    ['trepte', { kind: 'alee', highway: 'steps', bicycle: 'yes' }],
    ['carosabil cu bicycle=use_sidepath', { kind: 'carosabil', highway: 'primary', bicycle: 'use_sidepath' }],
    ['carosabil cu bicycle=no', { kind: 'carosabil', highway: 'residential', bicycle: 'no' }],
    ['drum privat', { kind: 'carosabil', highway: 'service', bicycle: 'private' }],
    ['pistă cu bicycle=no', { kind: 'pista', highway: 'cycleway', bicycle: 'no' }],
  ] as const)('muchie interzisă bicicletelor: %s', (_n, e) => {
    const x = one(e);
    expect(x.ok).toBe(false);
    expect(x.reason).toBeTruthy();
  });
  it.each([
    ['pistă de biciclete', { kind: 'pista', highway: 'cycleway' }],
    ['footway bicycle=designated', { kind: 'pista', highway: 'footway', bicycle: 'designated' }],
    ['trotuar cu bicycle=yes (partajat, semnalizat)', { kind: 'trotuar', highway: 'footway', bicycle: 'yes' }],
    ['zonă pietonală cu bicycle=designated', { kind: 'alee', highway: 'pedestrian', bicycle: 'designated' }],
    ['path cu bicycle=permissive', { kind: 'alee', highway: 'path', bicycle: 'permissive' }],
    ['stradă rezidențială', { kind: 'carosabil', highway: 'residential' }],
    ['stradă principală fără restricție', { kind: 'carosabil', highway: 'primary' }],
  ] as const)('muchie permisă: %s', (_n, e) => {
    const x = one(e);
    expect(x.ok).toBe(true);
    expect(x.reason).toBeNull();
  });
  it('ruta ocolește trotuarul interzis pe o stradă legală, chiar dacă e mai lungă', () => {
    // A(0) ─trotuar─ B(1) 300 m; A ─ C(2) ─ B pe stradă (~520 m)
    const gx = makeGraph(
      [[LAT, LON], [LAT, LON + dLon(300)], [LAT + dLat(200), LON + dLon(150)]],
      [{ f: 0, t: 1, kind: 'trotuar', highway: 'footway' }, { f: 0, t: 2 }, { f: 2, t: 1 }],
    );
    const r = new Router(gx).route(0, 1, null, { ...DEFAULT_ROUTE_OPTIONS, w_c: 0 });
    expect(r.found).toBe(true);
    expect(r.edges.map((e) => e.edge)).toEqual([1, 2]);
  });
  it('carosabilul cu use_sidepath e evitat în favoarea pistei alăturate', () => {
    const gx = makeGraph(
      [[LAT, LON], [LAT, LON + dLon(400)], [LAT + dLat(8), LON], [LAT + dLat(8), LON + dLon(400)]],
      [{ f: 0, t: 1, highway: 'primary', bicycle: 'use_sidepath' }, { f: 0, t: 2 }, { f: 2, t: 3, kind: 'pista', highway: 'cycleway' }, { f: 3, t: 1 }],
    );
    const r = new Router(gx).route(0, 1, null, { ...DEFAULT_ROUTE_OPTIONS, w_c: 0 });
    expect(r.edges.map((e) => e.edge)).toEqual([1, 2, 3]);
  });
  it('sensul unic contează și pe pistă', () => {
    const gx = makeGraph([[LAT, LON], [LAT, LON + dLon(300)]], [{ f: 0, t: 1, kind: 'pista', highway: 'cycleway', oneway: 1 }]);
    expect(new Router(gx).route(1, 0, null, DEFAULT_ROUTE_OPTIONS).found).toBe(false);
  });
  it('regula de onestitate: > 50% UNKNOWN → date insuficiente', () => {
    const r = rt.route(0, 2, null, DEFAULT_ROUTE_OPTIONS);
    const s = routeStats(g, null, r, DEFAULT_ROUTE_OPTIONS);
    expect(s.unknown_pct).toBeCloseTo(100, 5);
    expect(s.insufficient).toBe(true);
  });
});

function contrib(id: string, edges: number[], rms: number, passes = 2): RideContribution {
  const windows: RideContribution['windows'] = [];
  for (const e of edges) for (let p = 0; p < passes; p++) for (let k = 0; k < 4; k++) windows.push({ edge: e, rms: rms + k * 0.01, speed: 5, acc: 5, valid: true, amb: false, pass: p });
  return { ride_id: id, source: 'sensorlogger', processing_version: 'x', date: Date.UTC(2026, 10, 14), windows, shocks: [], included_in_layer: true };
}

describe('actualizarea reactivă după import (8.6)', () => {
  const g = twoRoutes();
  const th: [number, number, number, number] = [1, 1.6, 2.4, 3.6];
  const opt = { ...DEFAULT_ROUTE_OPTIONS, w_c: 3 };
  it('o tură care face ruta scurtă MEASURED clasa E schimbă recomandarea; ștergerea o readuce', () => {
    const rt = new Router(g);
    const before = aggregate({ rides: [], fixedThresholds: th, version: 1 });
    expect(rt.route(0, 2, before, opt).edges.map((e) => e.edge)).toEqual([0, 1]);
    const ride = contrib('r1', [0, 1], 6);
    const after = aggregate({ rides: [ride], fixedThresholds: th, version: 2 });
    expect(after.edges.get(0)!.status).toBe('MEASURED');
    expect(after.edges.get(0)!.class).toBe('E');
    expect(rt.route(0, 2, after, opt).edges.map((e) => e.edge)).toEqual([2, 3]);
    const removed = aggregate({ rides: [], fixedThresholds: th, version: 3 });
    expect(rt.route(0, 2, removed, opt).edges.map((e) => e.edge)).toEqual([0, 1]);
  });
  it('aceeași tură de două ori nu schimbă stratul', () => {
    const r = contrib('r1', [0, 1], 2);
    const a = aggregate({ rides: [r], fixedThresholds: th });
    const b = aggregate({ rides: [r, r], fixedThresholds: th });
    expect([...b.edges.values()]).toEqual([...a.edges.values()]);
  });
  it('ordinea 1-2-3 și 3-1-2 dă același strat', () => {
    const r1 = contrib('r1', [0, 1], 2), r2 = contrib('r2', [1, 2], 3, 1), r3 = contrib('r3', [2, 3], 1.2);
    const a = aggregate({ rides: [r1, r2, r3] });
    const b = aggregate({ rides: [r3, r1, r2] });
    expect([...b.edges.entries()].sort()).toEqual([...a.edges.entries()].sort());
    expect(b.thresholds).toEqual(a.thresholds);
  });
  it('versiunea nouă invalidează cache-ul: traseul cu versiunea veche se recalculează', () => {
    const rt = new Router(g);
    const v1 = aggregate({ rides: [], fixedThresholds: th, version: 1 });
    rt.route(0, 2, v1, opt);
    const v2 = aggregate({ rides: [contrib('r1', [0, 1], 6)], fixedThresholds: th, version: 2 });
    expect(v2.version).toBeGreaterThan(v1.version);
    const r = rt.route(0, 2, v2, opt);
    expect(r.edges.map((e) => e.edge)).toEqual([2, 3]);
    expect(rt.cachedVersions().some((k) => k.startsWith('2|'))).toBe(true);
  });
  it('o singură trecere → LOW_CONFIDENCE cu motivul; creșterea lui w_c nu crește Σ length·P', () => {
    const l = aggregate({ rides: [contrib('r1', [0], 2, 1)], fixedThresholds: th });
    expect(l.edges.get(0)!.status).toBe('LOW_CONFIDENCE');
    expect(l.edges.get(0)!.reasons).toContain('o singură trecere');
    const layer = aggregate({ rides: [contrib('r1', [0, 1], 3), contrib('r2', [2, 3], 1.2)], fixedThresholds: th });
    const rt = new Router(g);
    let prev = Infinity;
    for (const w of [0, 0.5, 1, 2, 3, 5]) {
      const o = { ...DEFAULT_ROUTE_OPTIONS, w_c: w };
      const s = routeStats(g, layer, rt.route(0, 2, layer, o), o).comfort_sum;
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });
});

describe('map-matching (8.2)', () => {
  // stradă (carosabil) și trotuar paralel la 4 m, plus o stradă perpendiculară
  const g = makeGraph(
    [[LAT, LON], [LAT + dLat(400), LON], [LAT, LON + dLon(4)], [LAT + dLat(400), LON + dLon(4)], [LAT + dLat(200), LON + dLon(300)], [LAT + dLat(200), LON]],
    [{ f: 0, t: 5, kind: 'carosabil' }, { f: 5, t: 1, kind: 'carosabil' }, { f: 2, t: 3, kind: 'trotuar', highway: 'footway' }, { f: 5, t: 4, kind: 'carosabil' }],
  );
  const fixes = (dx: number): GpsFix[] => Array.from({ length: 30 }, (_, i) => ({ t: i * 1000, lat: LAT + dLat(10 + i * 5), lon: LON + dLon(dx), acc: 5, alt: null, speed: 5, heading: 0, speedAcc: null }));
  it('potrivește pe stradă, marchează ambiguitatea carosabil/trotuar', () => {
    const m = matchFixes(fixes(1.5), g, DEFAULT_CONFIG, null);
    expect(m.matched).toBe(30);
    expect(m.amb.reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
  });
  it('suprafața declarată rezolvă ambiguitatea', () => {
    const m = matchFixes(fixes(1.5), g, DEFAULT_CONFIG, 'trotuar');
    expect([...m.edge].every((e) => e === 2)).toBe(true);
    expect(m.amb.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it('fixurile cu precizie > 20 m sunt ignorate', () => {
    const m = matchFixes(fixes(1.5).map((f) => ({ ...f, acc: 35 })), g, DEFAULT_CONFIG, null);
    expect(m.used).toBe(0);
  });
});

const GRAPH = 'public/data/graph-timisoara.json';
describe.skipIf(!existsSync(GRAPH))('graful real al Timișoarei', () => {
  const json = existsSync(GRAPH) ? (JSON.parse(readFileSync(GRAPH, 'utf8')) as GraphJson) : null;
  it('schema JSON', () => {
    expect(json!.meta.license).toBe('ODbL-1.0');
    expect(json!.meta.attribution).toContain('OpenStreetMap');
    for (const n of json!.nodes.slice(0, 50)) { expect(n).toHaveLength(3); expect(n[1]).toBeGreaterThan(45.6); expect(n[2]).toBeGreaterThan(21.0); }
    for (const e of json!.edges.slice(0, 200)) { expect(e).toHaveLength(14); expect(typeof e[4]).toBe('string'); expect(e[3]).toBeGreaterThan(0); }
    json!.edges.forEach((e, i) => expect(e[0]).toBe(i));
  });
  it('A* și Dijkstra dau același cost pe 100 de perechi aleatoare', () => {
    const g = new Graph(json!);
    const rt = new Router(g);
    const r = rng(1);
    let checked = 0;
    for (let k = 0; k < 400 && checked < 100; k++) {
      const a = Math.floor(r() * g.nNodes), b = Math.floor(r() * g.nNodes);
      const x = rt.route(a, b, null, DEFAULT_ROUTE_OPTIONS, true);
      const y = rt.route(a, b, null, DEFAULT_ROUTE_OPTIONS, false);
      expect(x.found).toBe(y.found);
      if (!x.found) continue;
      expect(Math.abs(x.cost - y.cost)).toBeLessThan(1e-6 * Math.max(1, y.cost));
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });
});
