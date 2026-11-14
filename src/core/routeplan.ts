// Alternativele de rută pentru ecranul Traseu și verdictul onest despre confort.
import type { ComfortClass, ComfortLayer } from './aggregate';
import type { Graph } from './graph';
import { PROFILES, Router, routeStats, type ProfileKey, type RouteOptions, type RouteResult, type RouteStats } from './route';

export interface RouteOptionView {
  key: ProfileKey;
  r: RouteResult;
  s: RouteStats;
  /** procentul de metri A+B din metrii cunoscuți (null dacă nu există metri cunoscuți) */
  knownGoodPct: number | null;
  knownByClass: Record<ComfortClass, number>;
  problems: { zones: number; reports: number };
}

export type Verdict =
  | { kind: 'nodata'; text: string }
  | { kind: 'insufficient'; text: string }
  | { kind: 'same'; text: string }
  | { kind: 'better'; text: string; best: ProfileKey };

export interface PlanResult { options: RouteOptionView[]; verdict: Verdict; error?: string }

export interface PointLike { lat: number; lon: number }

function sameEdges(a: RouteResult, b: RouteResult) {
  return a.edges.length === b.edges.length && a.edges.every((e, i) => e.edge === b.edges[i].edge);
}

export function problemsNear(g: Graph, r: RouteResult, pts: PointLike[], radius = 15): number {
  if (!pts.length) return 0;
  const set = new Set(r.edges.map((e) => e.edge));
  return pts.filter((p) => g.query(p.lat, p.lon, radius).some((c) => set.has(c.edge))).length;
}

export function planRoutes(g: Graph, layer: ComfortLayer | null, router: Router, src: number, dst: number, base: RouteOptions, extra: { zones: PointLike[]; reports: PointLike[] } = { zones: [], reports: [] }): PlanResult {
  const keys: ProfileKey[] = ['shortest', 'balanced', 'courier'];
  const raw = keys.map((key) => ({ key, r: router.route(src, dst, layer, { ...base, w_c: PROFILES[key] }) }));
  if (!raw[0].r.found) return { options: [], verdict: { kind: 'nodata', text: '' }, error: 'Nu am găsit o rută pe bicicletă între aceste puncte (sens unic, trotuare sau zonă neconectată).' };
  const opts: RouteOptionView[] = raw.filter((x) => x.r.found).map(({ key, r }) => {
    const s = routeStats(g, layer, r, base);
    const known: Record<ComfortClass, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const c of ['A', 'B', 'C', 'D', 'E'] as ComfortClass[]) known[c] = s.byClass.measured[c] + s.byClass.low[c];
    const kn = Object.values(known).reduce((a, b) => a + b, 0);
    return {
      key, r, s, knownByClass: known,
      knownGoodPct: kn > 0 ? (100 * (known.A + known.B)) / kn : null,
      problems: { zones: problemsNear(g, r, extra.zones), reports: problemsNear(g, r, extra.reports) },
    };
  });
  const shortest = opts[0];
  // fără duplicate: o rută identică cu una deja listată nu mai apare
  const visible: RouteOptionView[] = [shortest];
  for (const o of opts.slice(1)) {
    if (visible.some((v) => sameEdges(v.r, o.r))) continue;
    if (o.s.insufficient) continue; // nu propunem „confort” pe o rută majoritar necunoscută
    visible.push(o);
  }
  const anyMeasured = opts.some((o) => o.s.measured_m > 0);
  let verdict: Verdict;
  if (!anyMeasured) {
    verdict = { kind: 'nodata', text: 'Nu avem încă suficiente măsurători pentru o recomandare de confort. Îți arătăm cea mai scurtă rută.' };
  } else if (visible.length === 1) {
    const alt = opts.slice(1).find((o) => !sameEdges(o.r, shortest.r));
    verdict = alt && alt.s.insufficient
      ? { kind: 'insufficient', text: 'Rutele alternative trec mai ales pe străzi nemăsurate, așa că nu putem spune care e mai confortabilă.' }
      : { kind: 'same', text: `Cea mai scurtă rută e și cea mai confortabilă după datele existente (${Math.round(shortest.s.measured_pct)}% din drum măsurat).` };
  } else {
    const best = visible[visible.length - 1];
    const dl = best.s.length - shortest.s.length;
    const dde = shortest.s.de_measured_m - best.s.de_measured_m;
    verdict = { kind: 'better', best: best.key, text: `+${Math.round(dl)} m față de cea mai scurtă, cu ${Math.max(0, Math.round(dde))} m mai puțin pe segmente măsurate ca denivelate (D–E).` };
  }
  return { options: visible, verdict };
}
