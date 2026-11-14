// Date SINTETICE, doar pentru teste unitare.
import { existsSync, readFileSync } from 'node:fs';
import { encodePolyline, haversine } from '../src/core/geo';
import { Graph, type EdgeTuple, type GraphJson } from '../src/core/graph';
import type { GpsFix, RawRide, SurfaceKind } from '../src/core/types';

export const SAMPLE_IOS = 'sample-data/sensorlogger/iphone14-2026-11-13_23-23-49.zip';
export const SAMPLE_ANDROID = 'sample-data/sensorlogger/samsung-2026-11-14_00-10-08.zip';
export const hasFile = (p: string) => existsSync(p);
export const readBytes = (p: string) => new Uint8Array(readFileSync(p));

/** graf sintetic: noduri [lat, lon], muchii [from, to, kind?, oneway?, extra puncte] */
export function makeGraph(nodes: [number, number][], edges: { f: number; t: number; kind?: SurfaceKind; oneway?: number; via?: [number, number][]; highway?: string; bicycle?: string }[]): Graph {
  const json: GraphJson = {
    meta: { source: 'sintetic', attribution: '', license: '', downloaded_at: '', generated_at: '', area: 'test', format: '' },
    nodes: nodes.map(([lat, lon], i) => [i, lat, lon]),
    edges: edges.map((e, i) => {
      const coords: [number, number][] = [nodes[e.f], ...(e.via ?? []), nodes[e.t]];
      let len = 0;
      for (let k = 1; k < coords.length; k++) len += haversine(coords[k - 1][0], coords[k - 1][1], coords[k][0], coords[k][1]);
      return [i, e.f, e.t, len, encodePolyline(coords), e.highway ?? 'residential', '', '', 'shared', e.oneway ?? 0, 1000 + i, e.kind ?? 'carosabil', e.bicycle ?? '', `e${i}`] as EdgeTuple;
    }),
  };
  return new Graph(json);
}

/** funcție de poziție de-a lungul unei polilinii, la viteză constantă (+ zgomot GPS determinist) */
export function pathAlong(pts: [number, number][], speed: number, noiseM = 0, seed = 3): { path: (s: number) => [number, number]; seconds: number } {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const total = cum[cum.length - 1];
  let st = seed;
  const rnd = () => ((st = (st * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  let nx = 0, ny = 0;
  const path = (s: number): [number, number] => {
    const d = Math.min(total, s * speed);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const w = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    nx = 0.8 * nx + rnd() * noiseM * 0.6; ny = 0.8 * ny + rnd() * noiseM * 0.6;
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * w + ny / 111195, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * w + nx / 77600];
  };
  return { path, seconds: total / speed };
}

/** tură sintetică: telefon cu gravitația pe axa `axis`, vibrație verticală sinusoidală + zgomot determinist */
export function syntheticRide(opts: {
  seconds: number;
  fs: number;
  vibAmp: number;
  vibHz?: number;
  gravityDir?: [number, number, number];
  speed?: number | null;
  path?: (t: number) => [number, number];
  gpsHz?: number;
  acc?: number;
  gapAt?: [number, number];
  gyroDeg?: (t: number) => number;
}): RawRide {
  const { seconds, fs, vibAmp } = opts;
  const vibHz = opts.vibHz ?? 12;
  const gd = opts.gravityDir ?? [0, 0, 1];
  const gn = Math.hypot(...gd);
  const u = gd.map((v) => v / gn) as [number, number, number];
  const n = Math.floor(seconds * fs);
  const T: number[] = [], X: number[] = [], Y: number[] = [], Z: number[] = [];
  const t0 = 1_800_000_000_000;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / fs;
    const s = i / fs;
    if (opts.gapAt && s >= opts.gapAt[0] && s < opts.gapAt[1]) continue;
    const v = vibAmp * Math.SQRT2 * Math.sin(2 * Math.PI * vibHz * s);
    const a = 9.81 + v;
    T.push(t); X.push(u[0] * a); Y.push(u[1] * a); Z.push(u[2] * a);
  }
  const gps: GpsFix[] = [];
  const gpsHz = opts.gpsHz ?? 1;
  const path = opts.path ?? ((s: number) => [45.75 + (s * (opts.speed ?? 5)) / 111000, 21.22] as [number, number]);
  for (let k = 0; k <= seconds * gpsHz; k++) {
    const s = k / gpsHz;
    const [lat, lon] = path(s);
    const prev = gps[gps.length - 1];
    let heading = 0;
    if (prev) { heading = (Math.atan2((lon - prev.lon) * 77600, (lat - prev.lat) * 111195) * 180) / Math.PI; if (heading < 0) heading += 360; }
    gps.push({ t: t0 + s * 1000, lat, lon, acc: opts.acc ?? 5, alt: null, speed: opts.speed === undefined ? 5 : opts.speed, heading, speedAcc: null });
  }
  const gyroT: number[] = [], gyroM: number[] = [];
  for (let i = 0; i < T.length; i++) { gyroT.push(T[i]); gyroM.push(opts.gyroDeg ? opts.gyroDeg((T[i] - t0) / 1000) : 5); }
  return {
    meta: { source: 'shockgrid', ride_key: `synthetic:${seconds}:${fs}:${vibAmp}:${gd.join(',')}`, start_ms: t0, stop_ms: T[T.length - 1], orientation_aware: true, warnings: [], extra: {} },
    motion: { t: Float64Array.from(T), x: Float32Array.from(X), y: Float32Array.from(Y), z: Float32Array.from(Z), withGravity: true },
    gyro: { t: Float64Array.from(gyroT), mag: Float32Array.from(gyroM) },
    gps,
    events: [],
  };
}
