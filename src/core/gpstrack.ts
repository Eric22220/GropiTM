import type { GpsFix } from './types';
import { haversine } from './geo';

export interface GpsAt {
  lat: number;
  lon: number;
  acc: number | null; // max(acc1, acc2)
  speed: number | null;
  heading: number | null;
}

/** Acces după timp la fixurile GPS: interpolare liniară între fixul anterior și cel următor. */
export class GpsTrack {
  readonly t: Float64Array;
  constructor(readonly fixes: GpsFix[]) {
    this.t = Float64Array.from(fixes.map((f) => f.t));
  }
  /** indexul ultimului fix cu t ≤ tq (−1 dacă niciunul) */
  idx(tq: number): number {
    let lo = 0, hi = this.t.length - 1, ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (this.t[m] <= tq) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    return ans;
  }
  /** poziția la tq; null dacă niciun fix la ≤ maxGapMs */
  at(tq: number, maxGapMs = 3000): GpsAt | null {
    const n = this.fixes.length;
    if (!n) return null;
    const i = this.idx(tq);
    const a = i >= 0 ? this.fixes[i] : null;
    const b = i + 1 < n ? this.fixes[i + 1] : null;
    const okA = a && tq - a.t <= maxGapMs;
    const okB = b && b.t - tq <= maxGapMs;
    const accMax = (x: number | null, y: number | null) => (x === null ? y : y === null ? x : Math.max(x, y));
    if (okA && okB && a && b) {
      const w = b.t > a.t ? (tq - a.t) / (b.t - a.t) : 0;
      return {
        lat: a.lat + (b.lat - a.lat) * w,
        lon: a.lon + (b.lon - a.lon) * w,
        acc: accMax(a.acc, b.acc),
        speed: a.speed !== null && b.speed !== null ? a.speed + (b.speed - a.speed) * w : null,
        heading: w < 0.5 ? a.heading : b.heading,
      };
    }
    const f = okA ? a : okB ? b : null;
    if (!f) return null;
    return { lat: f.lat, lon: f.lon, acc: f.acc, speed: f.speed, heading: f.heading };
  }
}

export interface DistanceResult {
  total: number;
  method: 'speed' | 'positions' | 'none';
  /** distanța cumulată la fiecare fix */
  cum: Float64Array;
}

/**
 * Distanța (6.6). Principal: Σ v·dt din câmpul speed, doar cu ambele viteze prezente, v ≥ 0,5 m/s, dt ≤ 3 s.
 * Rezervă (fără speed): poziții mediate pe ferestre de 5 s, pași < 2 m ignorați.
 */
export function computeDistance(fixes: GpsFix[]): DistanceResult {
  const n = fixes.length;
  const cum = new Float64Array(n);
  if (n < 2) return { total: 0, method: 'none', cum };
  const withSpeed = fixes.filter((f) => f.speed !== null).length;
  if (withSpeed >= n * 0.5) {
    let d = 0;
    for (let i = 1; i < n; i++) {
      const a = fixes[i - 1], b = fixes[i];
      const dt = (b.t - a.t) / 1000;
      if (a.speed !== null && b.speed !== null && dt > 0 && dt <= 3) {
        const v = (a.speed + b.speed) / 2;
        if (v >= 0.5) d += v * dt;
      }
      cum[i] = d;
    }
    return { total: d, method: 'speed', cum };
  }
  // rezervă pe poziții
  const t0 = fixes[0].t;
  const bins = new Map<number, { lat: number; lon: number; k: number; idx: number[] }>();
  fixes.forEach((f, i) => {
    const b = Math.floor((f.t - t0) / 5000);
    const e = bins.get(b) ?? { lat: 0, lon: 0, k: 0, idx: [] };
    e.lat += f.lat; e.lon += f.lon; e.k++; e.idx.push(i);
    bins.set(b, e);
  });
  const keys = [...bins.keys()].sort((a, b) => a - b);
  let d = 0;
  let prev: { lat: number; lon: number } | null = null;
  for (const k of keys) {
    const e = bins.get(k)!;
    const p = { lat: e.lat / e.k, lon: e.lon / e.k };
    if (prev) {
      const step = haversine(prev.lat, prev.lon, p.lat, p.lon);
      if (step >= 2) { d += step; prev = p; }
    } else prev = p;
    for (const i of e.idx) cum[i] = d;
  }
  return { total: d, method: 'positions', cum };
}

export function distanceAt(track: GpsTrack, cum: Float64Array, tq: number): number {
  const n = track.t.length;
  if (!n) return 0;
  const i = track.idx(tq);
  if (i < 0) return 0;
  if (i >= n - 1) return cum[n - 1];
  const w = (tq - track.t[i]) / (track.t[i + 1] - track.t[i]);
  return cum[i] + (cum[i + 1] - cum[i]) * Math.max(0, Math.min(1, w));
}
