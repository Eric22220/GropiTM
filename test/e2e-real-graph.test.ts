// Cap-coadă pe graful REAL al Timișoarei, cu ture SINTETICE (doar pentru test, nu se publică).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { aggregate, toContribution } from '../src/core/aggregate';
import { Graph, type GraphJson } from '../src/core/graph';
import { processRide } from '../src/core/process';
import { DEFAULT_ROUTE_OPTIONS, Router, bikeBlockReason, mainComponent, routeStats } from '../src/core/route';
import { planRoutes } from '../src/core/routeplan';
import { pathAlong, syntheticRide } from './helpers';

const GRAPH = 'public/data/graph-timisoara.json';

describe.skipIf(!existsSync(GRAPH))('tură sintetică pe străzile reale', () => {
  const g = new Graph(JSON.parse(readFileSync(GRAPH, 'utf8')) as GraphJson);
  const rt = new Router(g);
  const comp = mainComponent(g);
  // Piața Victoriei → Piața 700 (aprox.), lipite de rețeaua rutabilă
  const a = g.nearestNode(45.7522, 21.2257, (n) => comp[n] === 1);
  const b = g.nearestNode(45.7600, 21.2210, (n) => comp[n] === 1);
  const r = rt.route(a, b, null, { ...DEFAULT_ROUTE_OPTIONS, w_c: 0 });
  const pts: [number, number][] = [];
  for (const { edge, forward } of r.edges) {
    const geo = g.geometry(edge);
    const seq = forward ? geo : [...geo].reverse();
    pts.push(...(pts.length ? seq.slice(1) : seq));
  }

  it('ruta există și are câteva sute de metri', () => {
    expect(r.found).toBe(true);
    expect(r.length).toBeGreaterThan(300);
  });

  it('map-matching: > 80% din ferestrele cu poziție sunt potrivite; 2 treceri → MEASURED', () => {
    const { path, seconds } = pathAlong(pts, 5, 3);
    const ride1 = syntheticRide({ seconds: Math.floor(seconds), fs: 100, vibAmp: 1.5, speed: 5, path, acc: 5 });
    const { path: p2 } = pathAlong(pts, 5, 3, 11);
    const ride2 = syntheticRide({ seconds: Math.floor(seconds), fs: 100, vibAmp: 1.5, speed: 5, path: p2, acc: 5 });
    ride2.meta.ride_key += ':2';
    const t0 = performance.now();
    const p1 = processRide(ride1, { graph: g });
    const pr2 = processRide(ride2, { graph: g });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(20000);
    const pct = p1.match.windows_matched / p1.match.windows_with_pos;
    expect(pct).toBeGreaterThan(0.8);
    const routeEdges = new Set(r.edges.map((e) => e.edge));
    const onRoute = p1.windows.filter((w) => w.edge >= 0 && routeEdges.has(w.edge)).length / Math.max(1, p1.match.windows_matched);
    expect(onRoute).toBeGreaterThan(0.6);
    const layer = aggregate({ rides: [toContribution(p1), toContribution(pr2)], surfaceKindOf: (e) => g.kind[e] });
    const statuses = [...layer.edges.values()].map((e) => e.status);
    expect(statuses.includes('MEASURED') || statuses.includes('LOW_CONFIDENCE')).toBe(true);
    console.log(`[e2e] ruta ${Math.round(r.length)} m, ${r.edges.length} muchii; potrivite ${(100 * pct).toFixed(0)}%, pe rută ${(100 * onRoute).toFixed(0)}%; MEASURED ${statuses.filter((s) => s === 'MEASURED').length}, LOW ${statuses.filter((s) => s === 'LOW_CONFIDENCE').length}; ${ms.toFixed(0)} ms`);
  });

  it('pe graful real, 150 de rute aleatorii nu folosesc nicio muchie interzisă bicicletelor', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let found = 0;
    const bad: string[] = [];
    for (let i = 0; i < 150; i++) {
      const x = g.nearestNode(45.735 + rnd() * 0.035, 21.2 + rnd() * 0.05, (n) => comp[n] === 1);
      const y = g.nearestNode(45.735 + rnd() * 0.035, 21.2 + rnd() * 0.05, (n) => comp[n] === 1);
      for (const w of [0, 1, 3]) {
        const rr = rt.route(x, y, null, { ...DEFAULT_ROUTE_OPTIONS, w_c: w });
        if (!rr.found) continue;
        if (w === 0) {
          found++;
          // regresie: fără date, o rută reală are EXACT 0 m măsurați (nu reziduuri de virgulă mobilă)
          const st = routeStats(g, null, rr, DEFAULT_ROUTE_OPTIONS);
          if (st.measured_m !== 0) bad.push(`măsurat fantomă ${st.measured_m}`);
          if (i < 20 && planRoutes(g, null, rt, x, y, DEFAULT_ROUTE_OPTIONS).verdict.kind !== 'nodata') bad.push('verdict greșit fără date');
        }
        for (const { edge } of rr.edges) { const why = bikeBlockReason(g, edge); if (why) bad.push(`${g.osmWay[edge]}: ${why}`); }
      }
    }
    expect(bad).toEqual([]);
    expect(found).toBeGreaterThan(140); // aceeași conectivitate ca înainte (rutele legale nu s-au pierdut)
  });
});
