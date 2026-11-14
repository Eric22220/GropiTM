// Lanțul complet pentru o tură: semnal → ferestre → șocuri → distanță → map-matching → treceri.
import { DEFAULT_CONFIG, type VibrationConfig } from './config';
import type { Graph } from './graph';
import { GpsTrack, computeDistance } from './gpstrack';
import { assignPasses, assignWindows, matchFixes } from './mapmatch';
import { hashString, median, medianOrNull } from './stats';
import type { DeclaredSurface, ProcessedRide, RawRide, RideSummary } from './types';
import { computeSignal, computeWindows, detectShocks, downsampleSignal, type Signal } from './vibration';

export function rideIdOf(raw: RawRide): string {
  return 'r' + hashString(raw.meta.ride_key);
}

export function summarize(raw: RawRide, sig: Signal | null, dist: { total: number; method: RideSummary['distance_method'] }): Omit<RideSummary, 'n_windows' | 'n_windows_valid' | 'reasons' | 'n_shocks' | 'speed_median'> {
  const t = raw.motion.t;
  const n = t.length;
  const dts: number[] = [];
  let gaps = 0, maxGap = 0;
  for (let i = 1; i < n; i++) {
    const d = t[i] - t[i - 1];
    dts.push(d);
    if (d > 100) gaps++;
    if (d > maxGap) maxGap = d;
  }
  const dtMed = dts.length ? median(dts) : NaN;
  const accs = raw.gps.map((f) => f.acc).filter((a): a is number => a !== null);
  const dur = n > 1 ? (t[n - 1] - t[0]) / 1000 : 0;
  const gpsDur = raw.gps.length > 1 ? (raw.gps[raw.gps.length - 1].t - raw.gps[0].t) / 1000 : 0;
  return {
    duration_s: dur,
    n_motion: n,
    fs_median: Number.isFinite(dtMed) ? 1000 / dtMed : 0,
    gaps_100ms: gaps,
    max_gap_ms: maxGap,
    n_gyro: raw.gyro?.t.length ?? 0,
    n_fix: raw.gps.length,
    gps_rate_hz: gpsDur > 0 ? (raw.gps.length - 1) / gpsDur : 0,
    acc_median: medianOrNull(accs),
    n_fix_le20: accs.filter((a) => a <= 20).length,
    distance_m: dist.total,
    distance_method: dist.method,
    gravity_median: sig?.gravityMedian ?? null,
    platform: raw.meta.platform ?? null,
    unit: raw.meta.unit_detected ?? null,
    accel_file: raw.meta.accel_file ?? null,
    gyro_file: raw.meta.gyro_file ?? null,
  };
}

export interface ProcessOptions {
  cfg?: VibrationConfig;
  graph?: Graph | null;
  declaredSurface?: DeclaredSurface;
  onProgress?: (stage: string, frac: number) => void;
}

export function processRide(raw: RawRide, opts: ProcessOptions = {}): ProcessedRide {
  const cfg = opts.cfg ?? DEFAULT_CONFIG;
  const prog = opts.onProgress ?? (() => {});
  const declared = opts.declaredSurface ?? raw.meta.declared_surface ?? null;
  prog('semnal', 0.1);
  const sig = computeSignal(raw, cfg);
  const track = new GpsTrack(raw.gps);
  const dist = computeDistance(raw.gps);
  prog('ferestre', 0.35);
  const windows = computeWindows(raw, sig, cfg, track, dist.cum);
  prog('șocuri', 0.55);
  const shocks = detectShocks(raw, sig, cfg, track);
  prog('rezumat', 0.8);
  const reasons: Record<string, number> = {};
  for (const w of windows) reasons[w.reason] = (reasons[w.reason] ?? 0) + 1;
  const speeds = raw.gps.map((f) => f.speed).filter((s): s is number => s !== null && s >= 0.5);
  const summary: RideSummary = {
    ...summarize(raw, sig, dist),
    n_windows: windows.length,
    n_windows_valid: windows.filter((w) => w.valid).length,
    reasons,
    n_shocks: shocks.length,
    speed_median: medianOrNull(speeds),
  };
  const track3 = raw.gps
    .filter((f) => f.acc === null || f.acc <= 50)
    .map((f) => [Math.round(f.lat * 1e6) / 1e6, Math.round(f.lon * 1e6) / 1e6, Math.round(f.t)] as [number, number, number]);
  const p: ProcessedRide = {
    ride_id: rideIdOf(raw),
    processing_version: cfg.processing_version,
    processed_at: Date.now(),
    meta: { ...raw.meta, declared_surface: declared },
    summary,
    windows,
    shocks,
    track: track3,
    gps: raw.gps,
    signal: downsampleSignal(sig),
    match: emptyMatch(raw.gps.length, windows.filter((w) => w.lat !== null).length),
    events: raw.events,
  };
  if (opts.graph) {
    prog('potrivire pe hartă', 0.9);
    matchProcessed(p, opts.graph, cfg, declared);
  }
  return p;
}

function emptyMatch(fixes: number, withPos: number) {
  return { graph_available: false, fixes_total: fixes, fixes_used: 0, fixes_matched: 0, jumps: 0, windows_with_pos: withPos, windows_matched: 0, windows_ambiguous: 0 };
}

/** Map-matching pe o tură deja procesată (8.2); se poate repeta când apare graful sau se schimbă suprafața declarată. */
export function matchProcessed(p: ProcessedRide, graph: Graph, cfg: VibrationConfig = DEFAULT_CONFIG, declared: DeclaredSurface = p.meta.declared_surface ?? null): void {
  for (const w of p.windows) { w.edge = -1; w.amb = false; w.pass = -1; }
  for (const s of p.shocks) { s.edge = -1; s.pass = -1; }
  const m = matchFixes(p.gps, graph, cfg, declared);
  assignWindows(p.windows, p.gps, m);
  assignPasses(p.windows, cfg.pass_gap_s);
  for (const s of p.shocks) {
    const w = p.windows.find((w) => s.t >= w.t0 && s.t < w.t1 && w.edge >= 0) ?? null;
    if (w) { s.edge = w.edge; s.pass = w.pass; }
  }
  p.meta.declared_surface = declared;
  p.match = {
    graph_available: true,
    fixes_total: p.gps.length,
    fixes_used: m.used,
    fixes_matched: m.matched,
    jumps: m.jumps,
    windows_with_pos: p.windows.filter((w) => w.lat !== null).length,
    windows_matched: p.windows.filter((w) => w.edge >= 0).length,
    windows_ambiguous: p.windows.filter((w) => w.edge >= 0 && w.amb).length,
  };
}
