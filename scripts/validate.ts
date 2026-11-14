// npm run validate -- rides/*.zip
// Validarea (secțiunea 11). Fișiere opționale scrise de echipă:
//   eval/ratings.json    { "<nume fișier fără .zip>": 1..5 }           — nota de confort perceput
//   eval/obstacles.json  [ { "name": "capac canal", "lat": 45.7, "lon": 21.2 } ] — obstacolele de referință (9.2c)
// Turele de referință se recunosc după nume: ref-neted-* și ref-pavaj-*; comparația A→B după AB-*.
// Rezultatul: eval/results-<data>.json și public/data/eval-latest.json (doar cifre agregate).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { aggregate, toContribution } from '../src/core/aggregate';
import { compareVerdict, traceStats } from '../src/core/compare';
import { haversine } from '../src/core/geo';
import { median, percentile, spearman } from '../src/core/stats';
import { loadGraphIfExists } from './lib';
import { expandArgs, loadRides } from './rides';

const files = expandArgs(process.argv.slice(2).filter((a) => !a.startsWith('--')));
const graph = loadGraphIfExists();
const rides = loadRides(files.length ? files : expandArgs(['rides']), graph);
const res: Record<string, unknown> = { generated_at: new Date().toISOString(), n_rides: rides.length, graph_available: !!graph };
if (!rides.length) {
  res.note = 'Nicio tură în rides/: validarea nu are date. Nu se raportează cifre.';
} else {
  // 1. Repetabilitate
  if (graph) {
    const perPass = new Map<number, { rms: number; speed: number }[]>();
    for (const r of rides) {
      const byKey = new Map<string, { rms: number[]; sp: number[]; edge: number }>();
      for (const w of r.p.windows) {
        if (!w.valid || w.edge < 0) continue;
        const k = `${w.edge}:${w.pass}`;
        const e = byKey.get(k) ?? { rms: [], sp: [], edge: w.edge };
        e.rms.push(w.rms); if (w.speed !== null) e.sp.push(w.speed);
        byKey.set(k, e);
      }
      for (const e of byKey.values()) {
        const arr = perPass.get(e.edge) ?? [];
        arr.push({ rms: median(e.rms), speed: e.sp.length ? median(e.sp) : NaN });
        perPass.set(e.edge, arr);
      }
    }
    const x: number[] = [], y: number[] = [];
    let multi = 0, excludedSpeed = 0;
    const rel: number[] = [];
    for (const passes of perPass.values()) {
      if (passes.length < 2) continue;
      multi++;
      const [a, b] = passes;
      if (!(Math.abs(a.speed - b.speed) / Math.min(a.speed, b.speed) <= 0.2)) { excludedSpeed++; continue; }
      x.push(a.rms); y.push(b.rms);
      rel.push(Math.abs(a.rms - b.rms) / ((a.rms + b.rms) / 2));
    }
    res.repeatability = {
      edges_with_2plus_passes: multi,
      edges_used: x.length,
      excluded_speed_diff_over_20pct: excludedSpeed,
      spearman: x.length >= 10 ? spearman(x, y) : null,
      median_relative_diff: rel.length ? median(rel) : null,
      note: x.length < 10 ? 'n < 10: fără coeficient, doar numerele absolute' : undefined,
    };
  }
  // 2. Referințe
  const ref = (prefix: string) => rides.filter((r) => r.name.toLowerCase().startsWith(prefix)).flatMap((r) => r.p.windows.filter((w) => w.valid).map((w) => w.rms));
  const smooth = ref('ref-neted'), paving = ref('ref-pavaj');
  const desc = (v: number[]) => (v.length ? { n_windows: v.length, median: median(v), iqr: [percentile(v, 25), percentile(v, 75)] } : { n_windows: 0 });
  res.references = { smooth: desc(smooth), paving: desc(paving) };
  // 3. Percepția
  const ratings: Record<string, number> = existsSync('eval/ratings.json') ? JSON.parse(readFileSync('eval/ratings.json', 'utf8')) : {};
  const th = aggregate({ rides: rides.map((r) => toContribution(r.p)) }).thresholds;
  const table = rides.filter((r) => ratings[r.name] !== undefined).map((r) => ({ ride: r.name, rating: ratings[r.name], vdv: traceStats(r.p, th).vdv }));
  res.perception = { table, spearman: table.length >= 6 ? spearman(table.map((t) => t.vdv ?? NaN), table.map((t) => t.rating)) : null, note: table.length < 6 ? 'sub 6 trasee: doar tabelul' : undefined };
  // 4. A→B
  const ab = rides.filter((r) => r.name.toLowerCase().startsWith('ab-'));
  res.ab_comparison = ab.map((r) => { const s = traceStats(r.p, th); return { ride: r.name, distance_m: s.distance_m, duration_s: s.duration_s, speed_median: s.speed_median, rvi: s.rvi, ci: s.ci, vdv: s.vdv, valid_pct: s.valid_pct }; });
  if (ab.length === 2) res.ab_verdict = compareVerdict(traceStats(ab[0].p, th), traceStats(ab[1].p, th)).text;
  // 5. Map-matching
  const wp = rides.reduce((a, r) => a + r.p.match.windows_with_pos, 0);
  const wm = rides.reduce((a, r) => a + r.p.match.windows_matched, 0);
  const wa = rides.reduce((a, r) => a + r.p.match.windows_ambiguous, 0);
  res.map_matching = { windows_with_position: wp, matched: wm, ambiguous: wa, matched_pct: wp ? (100 * wm) / wp : null, ambiguous_pct: wm ? (100 * wa) / wm : null };
  // 6. Șocuri vs obstacolele de referință
  const obstacles: { name: string; lat: number; lon: number }[] = existsSync('eval/obstacles.json') ? JSON.parse(readFileSync('eval/obstacles.json', 'utf8')) : [];
  const shocks = rides.flatMap((r) => r.p.shocks.filter((s) => s.located && !s.needs_review).map((s) => ({ ...s, ride: r.name })));
  const found = obstacles.map((o) => {
    const near = shocks.filter((s) => haversine(o.lat, o.lon, s.lat!, s.lon!) <= Math.max(15, s.r ?? 0));
    return { name: o.name, detections: near.length, rides_with_detection: new Set(near.map((s) => s.ride)).size, loc_err_m: near.length ? median(near.map((s) => haversine(o.lat, o.lon, s.lat!, s.lon!))) : null };
  });
  res.shocks = obstacles.length
    ? { obstacles: obstacles.length, detected: found.filter((f) => f.detections > 0).length, per_obstacle: found, unmatched_shocks: shocks.filter((s) => !obstacles.some((o) => haversine(o.lat, o.lon, s.lat!, s.lon!) <= Math.max(15, s.r ?? 0))).length }
    : { note: 'eval/obstacles.json lipsește: nu se poate valida detecția', total_located_shocks: shocks.length };
}
mkdirSync('eval', { recursive: true });
const day = new Date().toISOString().slice(0, 10);
writeFileSync(`eval/results-${day}.json`, JSON.stringify(res, null, 2));
// în aplicație ajung doar cifrele agregate, fără nume de obstacole cu coordonate
const pub = { ...res };
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/eval-latest.json', JSON.stringify(pub, null, 2));
console.log(JSON.stringify(res, null, 2));
console.log(`\nScris: eval/results-${day}.json și public/data/eval-latest.json`);
