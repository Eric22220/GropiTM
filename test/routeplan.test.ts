import { describe, expect, it } from 'vitest';
import { aggregate, type RideContribution } from '../src/core/aggregate';
import { DEFAULT_ROUTE_OPTIONS, Router } from '../src/core/route';
import { fmtPct, planRoutes, routeEvidence } from '../src/core/routeplan';
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

// formulări interzise când acoperirea nu permite o comparație
const CLAIM = /cea mai confortabil|\boptim[ăa]?\b|la fel de confortabil|e mai confortabil/i;
const plan = (layer: ReturnType<typeof aggregate> | null, gr = g) => planRoutes(gr, layer, new Router(gr), 0, 2, DEFAULT_ROUTE_OPTIONS);
// variantă: A(0) ─ C(1) la 400 m ─ B(2) la 1000 m; A ─ D(3) ─ B ~1170 m
const g40 = makeGraph(
  [[LAT, LON], [LAT, LON + dLon(400)], [LAT, LON + dLon(1000)], [LAT + dLat(300), LON + dLon(500)]],
  [{ f: 0, t: 1 }, { f: 1, t: 2 }, { f: 0, t: 3 }, { f: 3, t: 2 }],
);
// variantă: un singur drum, primii 5 m măsurați
const gTiny = makeGraph([[LAT, LON], [LAT, LON + dLon(5)], [LAT, LON + dLon(1005)]], [{ f: 0, t: 1 }, { f: 1, t: 2 }]);

describe('planificarea rutelor: onestitatea recomandării', () => {
  it('0% măsurat: confort necunoscut, doar cea mai scurtă, fără insignă verde', () => {
    const layer = aggregate({ rides: [], fixedThresholds: th, version: 1 });
    const r = plan(layer);
    expect(r.verdict.kind).toBe('nodata');
    expect(r.verdict.text).toMatch(/Confort necunoscut/);
    expect(r.verdict.text).toMatch(/fără optimizare după confort/);
    expect(r.verdict.text).not.toMatch(CLAIM);
    expect(r.options.map((o) => o.key)).toEqual(['shortest']);
    expect(r.options[0].s.unknown_pct).toBeCloseTo(100, 5);
    expect(r.options[0].knownGoodPct).toBeNull();
    const ev = routeEvidence(r.options[0], false);
    expect(ev.tone).toBe('warn');
    expect(ev.text).toMatch(/necunoscut/);
  });
  it('sub 1% măsurat (ex. 5 m din 1 km): nu e „același confort”, nu se afișează „0%”', () => {
    const layer = aggregate({ rides: [contrib('r1', [0], 0.5)], fixedThresholds: th, version: 2 });
    const r = plan(layer, gTiny);
    expect(r.options[0].s.measured_m).toBeGreaterThan(0);
    expect(r.verdict.kind).toBe('insufficient');
    expect(r.verdict.text).toMatch(/Confort necunoscut: doar sub 1%/);
    expect(r.verdict.text).not.toMatch(CLAIM);
    expect(r.verdict.text).not.toMatch(/\b0%/);
    expect(routeEvidence(r.options[0], false)).toEqual({ tone: 'warn', text: 'Confort necunoscut · măsurat sub 1%' });
  });
  it('acoperire parțială (40%) pe cea mai scurtă, alternativa nemăsurată: necunoscut, fără recomandare', () => {
    const layer = aggregate({ rides: [contrib('r1', [0], 6)], fixedThresholds: th, version: 3 });
    const r = plan(layer, g40);
    expect(Math.round(r.options[0].s.measured_pct)).toBe(40);
    expect(r.verdict.kind).toBe('insufficient');
    expect(r.verdict.text).toMatch(/doar 40% din rută e măsurat/);
    expect(r.verdict.text).not.toMatch(CLAIM);
    expect(r.options.map((o) => o.key)).toEqual(['shortest']);
    expect(routeEvidence(r.options[0], false).tone).toBe('warn');
  });
  it('cea mai scurtă nemăsurată, alternativa măsurată: informăm, NU recomandăm', () => {
    const layer = aggregate({ rides: [contrib('r1', [2, 3], 0.5)], fixedThresholds: th, version: 4 });
    const r = plan(layer);
    expect(r.verdict.kind).toBe('partial');
    expect(r.options.length).toBe(2);
    expect(r.verdict.text).toMatch(/confortul ei e necunoscut/);
    expect(r.verdict.text).toMatch(/Nu le putem compara/);
    expect(r.verdict.text).not.toMatch(CLAIM);
    for (const o of r.options) expect(routeEvidence(o, false).tone).not.toBe('comfort');
  });
  it('acoperire suficientă, scurtă măsurată E, alternativa măsurată A: se recomandă alternativa, cu diferența reală', () => {
    const layer = aggregate({ rides: [contrib('r1', [0, 1], 6), contrib('r2', [2, 3], 0.5)], fixedThresholds: th, version: 5 });
    const r = plan(layer);
    expect(r.verdict.kind).toBe('better');
    const keys = r.options.map((o) => o.key);
    expect(keys[0]).toBe('shortest');
    expect(keys.length).toBe(2);
    const best = r.options[1];
    expect(best.r.edges.map((e) => e.edge)).toEqual([2, 3]);
    expect(best.knownGoodPct).toBeCloseTo(100, 5);
    expect(r.verdict.text).toMatch(/^\+\d+ m față de cea mai scurtă, cu \d+ m mai puțin pe segmente măsurate ca denivelate/);
    expect(routeEvidence(best, true).tone).toBe('comfort');
    expect(routeEvidence(r.options[0], false).tone).toBe('neutral');
  });
  it('acoperire suficientă pe cea mai scurtă, alternativa nemăsurată: fără afirmația „cea mai confortabilă”', () => {
    const layer = aggregate({ rides: [contrib('r1', [0, 1], 6)], fixedThresholds: th, version: 6 });
    const r = plan(layer);
    expect(r.options.map((o) => o.key)).toEqual(['shortest']);
    expect(r.verdict.kind).toBe('same');
    expect(r.verdict.text).toMatch(/Nu am găsit o alternativă măsurată cu mai puține vibrații/);
    expect(r.verdict.text).not.toMatch(CLAIM);
  });
  it('ambele rute măsurate la fel de bine: aceeași rută, fără dubluri și fără recomandare', () => {
    const layer = aggregate({ rides: [contrib('r1', [0, 1], 0.5), contrib('r2', [2, 3], 0.5)], fixedThresholds: th, version: 7 });
    const r = plan(layer);
    expect(r.options.length).toBe(1);
    expect(r.verdict.kind).toBe('same');
    expect(r.verdict.text).not.toMatch(CLAIM);
  });
  it('alternativa măsurată mai proastă nu e propusă', () => {
    const layer = aggregate({ rides: [contrib('r1', [0, 1], 0.5), contrib('r2', [2, 3], 6)], fixedThresholds: th, version: 8 });
    const r = plan(layer);
    expect(r.verdict.kind).toBe('same');
    expect(r.options.map((o) => o.key)).toEqual(['shortest']);
  });
  it('fmtPct: valorile între 0 și 1 nu devin „0%”', () => {
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(0.4)).toBe('sub 1%');
    expect(fmtPct(49.6)).toBe('50%');
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
