// Comparația a două trasee parcurse efectiv (8.5).
import type { ComfortClass, Thresholds } from './aggregate';
import { CLASSES, classOf } from './aggregate';
import { median, percentile, rng } from './stats';
import type { ProcessedRide, VibWindow } from './types';

export interface TraceStats {
  ride_id: string;
  distance_m: number;
  duration_s: number;
  speed_mean: number | null;
  speed_median: number | null;
  rvi: number | null; // mediana ponderată cu distanța
  ci: [number, number] | null;
  vdv: number | null;
  valid_pct: number;
  n_windows: number;
  n_valid: number;
  time_by_class: Record<ComfortClass, number>;
  series: { dist: number[]; rms: (number | null)[] };
}

/** mediana ponderată (ponderi = distanța parcursă în fereastră) */
export function weightedMedian(vals: number[], w: number[]): number | null {
  if (!vals.length) return null;
  const idx = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
  const tot = w.reduce((a, b) => a + b, 0);
  if (tot <= 0) return median(vals);
  let acc = 0;
  for (const i of idx) { acc += w[i]; if (acc >= tot / 2) return vals[i]; }
  return vals[idx[idx.length - 1]];
}

/** bootstrap pe blocuri de `block` ferestre consecutive (ferestrele vecine se suprapun și sunt corelate) */
export function blockBootstrap(vals: number[], w: number[], block = 10, B = 1000, seed = 42): [number, number] | null {
  const n = vals.length;
  if (n < block) return null;
  const r = rng(seed);
  const nb = Math.ceil(n / block);
  const stats: number[] = [];
  for (let b = 0; b < B; b++) {
    const sv: number[] = [], sw: number[] = [];
    for (let k = 0; k < nb; k++) {
      const s = Math.floor(r() * (n - block + 1));
      for (let j = s; j < s + block; j++) { sv.push(vals[j]); sw.push(w[j]); }
    }
    const m = weightedMedian(sv, sw);
    if (m !== null) stats.push(m);
  }
  return [percentile(stats, 2.5), percentile(stats, 97.5)];
}

export function traceStats(p: ProcessedRide, th: Thresholds, range?: [number, number]): TraceStats {
  const inRange = (w: VibWindow) => !range || (w.dist >= range[0] && w.dist <= range[1]);
  const ws = p.windows.filter(inRange);
  const valid = ws.filter((w) => w.valid);
  const vals = valid.map((w) => w.rms);
  const wts = valid.map((w) => (w.speed ?? 0) * ((w.t1 - w.t0) / 1000));
  const time_by_class: Record<ComfortClass, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const w of valid) time_by_class[classOf(w.rms, th)] += 1; // pas de 1 s
  const vdvSum = valid.reduce((a, w) => a + w.vdv, 0) / 2; // ferestrele de 2 s se suprapun pe jumătate
  const speeds = ws.map((w) => w.speed).filter((s): s is number => s !== null);
  const d0 = ws.length ? ws[0].dist : 0, d1 = ws.length ? ws[ws.length - 1].dist : 0;
  const dur = ws.length ? (ws[ws.length - 1].t1 - ws[0].t0) / 1000 : 0;
  return {
    ride_id: p.ride_id,
    distance_m: d1 - d0,
    duration_s: dur,
    speed_mean: dur > 0 ? (d1 - d0) / dur : null,
    speed_median: speeds.length ? median(speeds) : null,
    rvi: weightedMedian(vals, wts),
    ci: blockBootstrap(vals, wts),
    vdv: valid.length ? Math.pow(vdvSum, 0.25) : null,
    valid_pct: ws.length ? (100 * valid.length) / ws.length : 0,
    n_windows: ws.length,
    n_valid: valid.length,
    time_by_class,
    series: { dist: ws.map((w) => w.dist - d0), rms: ws.map((w) => (w.valid ? w.rms : null)) },
  };
}

export type Verdict = { kind: 'winner'; better: 0 | 1; text: string } | { kind: 'inconclusive'; text: string } | { kind: 'speed'; text: string } | { kind: 'nodata'; text: string };

export function compareVerdict(a: TraceStats, b: TraceStats): Verdict {
  if (a.rvi === null || b.rvi === null || !a.ci || !b.ci) return { kind: 'nodata', text: 'Prea puține ferestre valide pentru o comparație (minimum 10 pe traseu).' };
  if (a.speed_median && b.speed_median) {
    const diff = Math.abs(a.speed_median - b.speed_median) / Math.min(a.speed_median, b.speed_median);
    if (diff > 0.2) return { kind: 'speed', text: 'Comparație afectată de diferența de viteză (> 20% între vitezele mediane); nu se afișează un câștigător.' };
  }
  const overlap = a.ci[0] <= b.ci[1] && b.ci[0] <= a.ci[1];
  if (overlap) return { kind: 'inconclusive', text: 'Diferență neconcludentă: intervalele RVI se suprapun.' };
  const better = a.rvi < b.rvi ? 0 : 1;
  return { kind: 'winner', better, text: `Traseul ${better === 0 ? '1' : '2'} are vibrații mai mici (intervalele RVI nu se suprapun).` };
}

export { CLASSES };
