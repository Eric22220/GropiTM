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

/** Verdictul despre confort. Reguli (fără excepții):
 * - o rută cu < MIN_COVERAGE_PCT% din lungime măsurată are confort NECUNOSCUT;
 * - nu spunem niciodată că o rută e „mai confortabilă”, „optimă” sau „la fel de confortabilă” decât dacă
 *   ambele rute comparate sunt măsurate suficient și diferența măsurată e reală. */
export type Verdict =
  | { kind: 'nodata'; text: string } // nicio măsurătoare pe nicio variantă
  | { kind: 'insufficient'; text: string } // câteva măsurători, prea puține pentru o comparație
  | { kind: 'partial'; text: string } // cea mai scurtă e necunoscută, o alternativă e măsurată: informăm, nu recomandăm
  | { kind: 'same'; text: string } // cea mai scurtă e măsurată suficient și nu am găsit o alternativă măsurată mai bună
  | { kind: 'better'; text: string; best: ProfileKey }; // ambele măsurate suficient, alternativa are mai puține vibrații măsurate

/** procentul minim din lungimea rutei care trebuie măsurat ca să vorbim despre confortul ei */
export const MIN_COVERAGE_PCT = 50;
/** diferențe minime ca o alternativă să fie numită „cu mai puține vibrații” */
const MIN_DE_GAIN_M = 10;
const MIN_GOOD_GAIN_PCT = 10;

/** procent afișabil: o valoare între 0 și 1 nu devine „0%” */
export const fmtPct = (p: number) => (p > 0 && p < 1 ? 'sub 1%' : `${Math.round(p)}%`);
export const isCovered = (o: RouteOptionView) => o.s.length > 0 && o.s.measured_pct >= MIN_COVERAGE_PCT;

/** Eticheta de dovezi pentru o rută: verde DOAR pentru o rută recomandată pe baza măsurătorilor. */
export function routeEvidence(o: RouteOptionView, recommended: boolean): { tone: 'warn' | 'neutral' | 'comfort'; text: string } {
  if (o.s.measured_m <= 0) return { tone: 'warn', text: 'Confort necunoscut · nemăsurat' };
  if (!isCovered(o)) return { tone: 'warn', text: `Confort necunoscut · măsurat ${fmtPct(o.s.measured_pct)}` };
  const good = o.knownGoodPct !== null ? ` · ${Math.round(o.knownGoodPct)}% confortabil` : '';
  return { tone: recommended ? 'comfort' : 'neutral', text: `Măsurat ${fmtPct(o.s.measured_pct)}${good}` };
}

function isBetter(a: RouteOptionView, s: RouteOptionView): boolean {
  if (a.s.de_measured_m > s.s.de_measured_m) return false;
  const de = s.s.de_measured_m - a.s.de_measured_m;
  const good = (a.knownGoodPct ?? 0) - (s.knownGoodPct ?? 0);
  return de >= MIN_DE_GAIN_M || good >= MIN_GOOD_GAIN_PCT;
}

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
  // alternative distincte (fără dubluri)
  const alts: RouteOptionView[] = [];
  for (const o of opts.slice(1)) if (!sameEdges(o.r, shortest.r) && !alts.some((v) => sameEdges(v.r, o.r))) alts.push(o);
  const coveredAlts = alts.filter(isCovered);
  let visible: RouteOptionView[] = [shortest];
  let verdict: Verdict;
  if (!isCovered(shortest)) {
    if (coveredAlts.length) {
      const a = coveredAlts[0];
      visible = [shortest, a];
      verdict = { kind: 'partial', text: `Cea mai scurtă rută e măsurată ${fmtPct(shortest.s.measured_pct)}, deci confortul ei e necunoscut. Alternativa (+${Math.round(a.s.length - shortest.s.length)} m) e măsurată ${fmtPct(a.s.measured_pct)}${a.knownGoodPct !== null ? `, ${Math.round(a.knownGoodPct)}% confortabil` : ''}. Nu le putem compara.` };
    } else if (opts.every((o) => o.s.measured_m <= 0)) {
      verdict = { kind: 'nodata', text: 'Confort necunoscut: nu avem măsurători pe această rută. Îți arătăm cea mai scurtă rută, fără optimizare după confort.' };
    } else {
      verdict = { kind: 'insufficient', text: `Confort necunoscut: doar ${fmtPct(shortest.s.measured_pct)} din rută e măsurat, prea puțin pentru a compara confortul. Îți arătăm cea mai scurtă rută.` };
    }
  } else {
    const better = coveredAlts.filter((a) => isBetter(a, shortest));
    if (better.length) {
      const best = better.reduce((x, y) => (y.s.de_measured_m < x.s.de_measured_m || (y.s.de_measured_m === x.s.de_measured_m && y.s.length < x.s.length) ? y : x));
      visible = [shortest, best];
      const dl = Math.round(best.s.length - shortest.s.length);
      const dde = Math.round(shortest.s.de_measured_m - best.s.de_measured_m);
      verdict = {
        kind: 'better', best: best.key,
        text: dde >= MIN_DE_GAIN_M
          ? `${dl >= 0 ? '+' : ''}${dl} m față de cea mai scurtă, cu ${dde} m mai puțin pe segmente măsurate ca denivelate (D–E).`
          : `${dl >= 0 ? '+' : ''}${dl} m față de cea mai scurtă; ${Math.round(best.knownGoodPct ?? 0)}% confortabil (A–B) față de ${Math.round(shortest.knownGoodPct ?? 0)}% pe porțiunile măsurate.`,
      };
    } else {
      verdict = { kind: 'same', text: `Nu am găsit o alternativă măsurată cu mai puține vibrații. Ruta e măsurată ${fmtPct(shortest.s.measured_pct)}${shortest.knownGoodPct !== null ? `, ${Math.round(shortest.knownGoodPct)}% confortabil (A–B)` : ''}.` };
    }
  }
  return { options: visible, verdict };
}
