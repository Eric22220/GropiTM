import { describe, expect, it } from 'vitest';
import { aggregate, type RideContribution } from '../src/core/aggregate';
import { DEFAULT_ROUTE_OPTIONS, Router } from '../src/core/route';
import { planRoutes } from '../src/core/routeplan';
import { makeGraph } from './helpers';

const LAT = 45.75, LON = 21.22;
const dLat = (m: number) => m / 111195, dLon = (m: number) => m / 77600;
// A(0) ─ C(1) ─ B(2) scurt (1000 m); A ─ D(3) ─ B lung (~1170 m)
const g = makeGraph(
  [[LAT, LON], [LAT, LON + dLon(500)], [LAT, LON + dLon(1000)], [LAT + dLat(300), LON + dLon(500)]],
  [{ f: 0, t: 1 }, { f: 1, t: 2 }, { f: 0, t: 3 }, { f: 3, t: 2 }],
);
const th: [number, number, number, number] = [1, 1.6, 2.4, 3.6];
function contrib(id: string, edges: number[], rms: number): RideContribution {
  const windows: RideContribution['windows'] = [];
  for (const e of edges) for (let p = 0; p < 2; p++) for (let k = 0; k < 4; k++) windows.push({ edge: e, rms, speed: 5, acc: 5, valid: true, amb: false, pass: p });
  return { ride_id: id, source: 'sensorlogger', processing_version: 'x', date: 0, windows, shocks: [], included_in_layer: true };
}

describe('planificarea rutelor: onestitatea recomandării', () => {
  it('100% segmente necunoscute: fără recomandare de confort, doar cea mai scurtă', () => {
    const layer = aggregate({ rides: [], fixedThresholds: th, version: 1 });
    const r = planRoutes(g, layer, new Router(g), 0, 2, DEFAULT_ROUTE_OPTIONS);
    expect(r.verdict.kind).toBe('nodata');
    expect(r.verdict.text).toMatch(/Nu avem încă suficiente măsurători/);
    expect(r.options.map((o) => o.key)).toEqual(['shortest']);
    expect(r.options[0].s.unknown_pct).toBeCloseTo(100, 5);
    expect(r.options[0].knownGoodPct).toBeNull();
  });
  it('ruta scurtă măsurată E, alternativa măsurată A: se propune alternativa, cu diferența reală', () => {
    const layer = aggregate({ rides: [contrib('r1', [0, 1], 6), contrib('r2', [2, 3], 0.5)], fixedThresholds: th, version: 2 });
    const r = planRoutes(g, layer, new Router(g), 0, 2, DEFAULT_ROUTE_OPTIONS);
    expect(r.verdict.kind).toBe('better');
    const keys = r.options.map((o) => o.key);
    expect(keys[0]).toBe('shortest');
    expect(keys.length).toBeGreaterThan(1);
    const best = r.options[r.options.length - 1];
    expect(best.r.edges.map((e) => e.edge)).toEqual([2, 3]);
    expect(best.knownGoodPct).toBeCloseTo(100, 5);
    expect(r.verdict.text).toMatch(/\+\d+ m/);
  });
  it('alternativa trece pe străzi nemăsurate: nu o numim „mai confortabilă”', () => {
    const layer = aggregate({ rides: [contrib('r1', [0, 1], 6)], fixedThresholds: th, version: 3 });
    const r = planRoutes(g, layer, new Router(g), 0, 2, DEFAULT_ROUTE_OPTIONS);
    expect(r.options.map((o) => o.key)).toEqual(['shortest']);
    expect(r.verdict.kind).toBe('insufficient');
  });
  it('totul măsurat bine pe ruta scurtă: aceeași rută, fără dubluri', () => {
    const layer = aggregate({ rides: [contrib('r1', [0, 1], 0.5), contrib('r2', [2, 3], 0.5)], fixedThresholds: th, version: 4 });
    const r = planRoutes(g, layer, new Router(g), 0, 2, DEFAULT_ROUTE_OPTIONS);
    expect(r.options.length).toBe(1);
    expect(r.verdict.kind).toBe('same');
  });
  it('problemele cunoscute de pe rută (zone cu șoc, rapoarte locale) sunt numărate', () => {
    const layer = aggregate({ rides: [], fixedThresholds: th, version: 5 });
    const r = planRoutes(g, layer, new Router(g), 0, 2, DEFAULT_ROUTE_OPTIONS, { zones: [{ lat: LAT, lon: LON + dLon(250) }], reports: [{ lat: LAT + dLat(5), lon: LON + dLon(700) }, { lat: LAT + dLat(300), lon: LON + dLon(500) }] });
    expect(r.options[0].problems).toEqual({ zones: 1, reports: 1 });
  });
  it('fără drum între puncte: mesaj de eroare', () => {
    const g2 = makeGraph([[LAT, LON], [LAT, LON + dLon(100)], [LAT + 0.01, LON]], [{ f: 0, t: 1 }]);
    const r = planRoutes(g2, null, new Router(g2), 0, 2, DEFAULT_ROUTE_OPTIONS);
    expect(r.error).toBeTruthy();
  });
});
