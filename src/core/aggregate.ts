// Agregarea pe muchii (8.3, 6.9), clasele (6.8), zonele cu șoc (6.10) și diferența înainte/după (8.6).
import { DEFAULT_CONFIG, DEFAULT_THRESHOLDS, type VibrationConfig } from './config';
import { haversine } from './geo';
import { median, medianOrNull, percentileSorted } from './stats';
import type { ProcessedRide, RideSource, Shock, SurfaceKind } from './types';

export type EdgeStatus = 'MEASURED' | 'LOW_CONFIDENCE' | 'UNKNOWN';
export type ComfortClass = 'A' | 'B' | 'C' | 'D' | 'E';
export const CLASSES: ComfortClass[] = ['A', 'B', 'C', 'D', 'E'];
export type Thresholds = [number, number, number, number];

/** Contribuția unei ture: doar ferestrele potrivite pe muchii și șocurile, fără semnal brut. */
export interface RideContribution {
  ride_id: string;
  source: RideSource;
  processing_version: string;
  date: number; // ms, ziua turei (pentru last_seen)
  windows: { edge: number; rms: number; speed: number | null; acc: number | null; valid: boolean; amb: boolean; pass: number }[];
  shocks: Shock[];
  included_in_layer: boolean;
}

/** Muchie din snapshot: eșantioanele agregate (fără timpi individuali) pentru reagregare exactă. */
export interface SnapshotEdge {
  edge_id: number;
  rms: number[];
  speed: number[];
  acc: number[];
  n_total: number;
  n_amb: number;
  n_passes: number;
  n_rides: number;
  last_seen: string; // AAAA-LL-ZZ
  sources: RideSource[];
}

export interface SnapshotShock {
  lat: number; lon: number; r: number; peak: number; z: number; double_hit: boolean; speed: number | null;
  edge: number; needs_review: boolean; pass_key: string; snippet?: { dt: number; v: number[] }; date: string;
}

export interface Snapshot {
  meta: {
    processing_version: string;
    generated_at: string;
    thresholds: Thresholds | null;
    thresholds_source: string;
    device_note: string;
    ride_ids: string[];
    attribution: string;
    license: string;
  };
  edges: SnapshotEdge[];
  shocks: SnapshotShock[];
}

export interface EdgeAgg {
  edge_id: number;
  rms_median: number | null;
  class: ComfortClass | null;
  n_windows: number; // ferestre valide
  n_windows_total: number;
  n_passes: number;
  n_rides: number;
  speed_median: number | null;
  gps_acc_median: number | null;
  status: EdgeStatus;
  reasons: string[];
  surface_kind: SurfaceKind | null;
  ambiguous_ratio: number;
  last_seen: string | null;
  sources: RideSource[];
}

export type ZoneStatus = 'REPEATED' | 'CANDIDATE' | 'NEEDS_REVIEW' | 'REJECTED';

export interface ShockZone {
  id: string;
  lat: number;
  lon: number;
  radius_m: number;
  status: ZoneStatus;
  passes: number;
  detections: number;
  peak_median: number;
  peak_max: number;
  double_hit_ratio: number;
  speed_median: number | null;
  last_seen: string;
  edge_id: number;
  surface_kind: SurfaceKind | null;
  strongest: { peak: number; snippet?: { dt: number; v: number[] }; speed: number | null; double_hit: boolean; date: string; flags: string[] };
  members: string[]; // id-urile detectărilor
}

export interface ComfortLayer {
  version: number;
  processing_version: string;
  thresholds: Thresholds;
  thresholds_source: string;
  edges: Map<number, EdgeAgg>;
  zones: ShockZone[];
  ride_ids: string[];
  n_valid_windows: number;
}

export function classOf(rms: number, th: Thresholds): ComfortClass {
  if (rms < th[0]) return 'A';
  if (rms < th[1]) return 'B';
  if (rms < th[2]) return 'C';
  if (rms < th[3]) return 'D';
  return 'E';
}

export function toContribution(p: ProcessedRide, included = true): RideContribution {
  return {
    ride_id: p.ride_id,
    source: p.meta.source,
    processing_version: p.processing_version,
    date: p.meta.start_ms,
    windows: p.windows.filter((w) => w.edge >= 0).map((w) => ({ edge: w.edge, rms: w.rms, speed: w.speed, acc: w.acc, valid: w.valid, amb: w.amb, pass: w.pass })),
    shocks: p.shocks.filter((s) => s.located),
    included_in_layer: included,
  };
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface AggregateInput {
  snapshot?: Snapshot | null;
  rides: RideContribution[];
  cfg?: VibrationConfig;
  surfaceKindOf?: (edge: number) => SurfaceKind | null;
  rejected?: Set<string>;
  fixedThresholds?: Thresholds | null;
  version?: number;
}

/** Agregare independentă de ordinea turelor: medianele și mulțimile nu depind de ordine. */
export function aggregate(inp: AggregateInput): ComfortLayer {
  const cfg = inp.cfg ?? DEFAULT_CONFIG;
  const snap = inp.snapshot ?? null;
  const snapIds = new Set(snap?.meta.ride_ids ?? []);
  // turele locale deja incluse în snapshot nu se numără de două ori
  // aceeași tură de două ori se numără o singură dată
  const uniq = new Map<string, RideContribution>();
  for (const r of inp.rides) if (r.included_in_layer && !snapIds.has(r.ride_id) && !uniq.has(r.ride_id)) uniq.set(r.ride_id, r);
  const rides = [...uniq.values()].sort((a, b) => (a.ride_id < b.ride_id ? -1 : 1));

  interface Acc { rms: number[]; speed: number[]; acc: number[]; total: number; amb: number; passes: number; rides: number; last: string | null; sources: Set<RideSource> }
  const edges = new Map<number, Acc>();
  const get = (e: number) => {
    let a = edges.get(e);
    if (!a) { a = { rms: [], speed: [], acc: [], total: 0, amb: 0, passes: 0, rides: 0, last: null, sources: new Set() }; edges.set(e, a); }
    return a;
  };
  for (const se of snap?.edges ?? []) {
    const a = get(se.edge_id);
    a.rms.push(...se.rms); a.speed.push(...se.speed); a.acc.push(...se.acc);
    a.total += se.n_total; a.amb += se.n_amb; a.passes += se.n_passes; a.rides += se.n_rides;
    a.last = !a.last || se.last_seen > a.last ? se.last_seen : a.last;
    se.sources.forEach((s) => a.sources.add(s));
  }
  for (const r of rides) {
    const touched = new Map<number, Set<number>>();
    for (const w of r.windows) {
      const a = get(w.edge);
      a.total++;
      if (w.amb) a.amb++;
      if (!w.valid) continue;
      a.rms.push(w.rms);
      if (w.speed !== null) a.speed.push(w.speed);
      if (w.acc !== null) a.acc.push(w.acc);
      let s = touched.get(w.edge);
      if (!s) { s = new Set(); touched.set(w.edge, s); }
      s.add(w.pass);
    }
    for (const w of r.windows) { const a = get(w.edge); a.sources.add(r.source); }
    for (const [e, passes] of touched) {
      const a = get(e);
      a.passes += passes.size;
      a.rides += 1;
      const d = day(r.date);
      a.last = !a.last || d > a.last ? d : a.last;
    }
  }

  // praguri: fixe → snapshot → percentile 20/40/60/80 (≥ 30 ferestre) → implicite
  const allRms: number[] = [];
  for (const a of edges.values()) allRms.push(...a.rms);
  allRms.sort((a, b) => a - b);
  let thresholds: Thresholds, thSrc: string;
  if (inp.fixedThresholds) { thresholds = inp.fixedThresholds; thSrc = 'setate manual'; }
  else if (snap?.meta.thresholds) { thresholds = snap.meta.thresholds; thSrc = snap.meta.thresholds_source || 'snapshot'; }
  else if (allRms.length >= 30) {
    thresholds = [20, 40, 60, 80].map((p) => percentileSorted(allRms, p)) as Thresholds;
    thSrc = `percentilele 20/40/60/80 din ${allRms.length} ferestre valide`;
  } else { thresholds = DEFAULT_THRESHOLDS; thSrc = 'implicite (prea puține ferestre pentru calibrare)'; }

  const out = new Map<number, EdgeAgg>();
  for (const [e, a] of edges) {
    const nValid = a.rms.length;
    const rmsMed = nValid ? median(a.rms) : null;
    const spMed = medianOrNull(a.speed);
    const accMed = medianOrNull(a.acc);
    const ambRatio = a.total ? a.amb / a.total : 0;
    const reasons: string[] = [];
    let status: EdgeStatus;
    if (!nValid) { status = 'UNKNOWN'; reasons.push('nicio fereastră validă'); }
    else {
      if (nValid < cfg.measured_min_windows) reasons.push(`doar ${nValid} ferestre valide`);
      if (a.passes < cfg.measured_min_passes) reasons.push(a.passes === 1 ? 'o singură trecere' : `${a.passes} treceri`);
      if (accMed === null || accMed > cfg.measured_max_acc) reasons.push('GPS slab');
      if (spMed === null || spMed < cfg.speed_min || spMed > cfg.speed_max) reasons.push('viteză în afara benzii');
      if (ambRatio > cfg.measured_max_ambiguous) reasons.push('ambiguitate carosabil/trotuar');
      status = reasons.length ? 'LOW_CONFIDENCE' : 'MEASURED';
    }
    out.set(e, {
      edge_id: e,
      rms_median: rmsMed,
      class: rmsMed !== null ? classOf(rmsMed, thresholds) : null,
      n_windows: nValid,
      n_windows_total: a.total,
      n_passes: a.passes,
      n_rides: a.rides,
      speed_median: spMed,
      gps_acc_median: accMed,
      status,
      reasons,
      surface_kind: inp.surfaceKindOf?.(e) ?? null,
      ambiguous_ratio: ambRatio,
      last_seen: a.last,
      sources: [...a.sources].sort(),
    });
  }

  const zones = aggregateShocks(snap, rides, out, inp.surfaceKindOf, inp.rejected ?? new Set());
  return {
    version: inp.version ?? 0,
    processing_version: cfg.processing_version,
    thresholds,
    thresholds_source: thSrc,
    edges: out,
    zones,
    ride_ids: [...new Set([...(snap?.meta.ride_ids ?? []), ...rides.map((r) => r.ride_id)])].sort(),
    n_valid_windows: allRms.length,
  };
}

interface Det { id: string; lat: number; lon: number; r: number; peak: number; double_hit: boolean; speed: number | null; edge: number; needs_review: boolean; pass_key: string; snippet?: { dt: number; v: number[] }; date: string; flags: string[] }

function aggregateShocks(snap: Snapshot | null, rides: RideContribution[], edges: Map<number, EdgeAgg>, kindOf: AggregateInput['surfaceKindOf'], rejected: Set<string>): ShockZone[] {
  const dets: Det[] = [];
  (snap?.shocks ?? []).forEach((s, i) => dets.push({ id: `snap${i}`, ...s, flags: s.needs_review ? ['snapshot'] : [] }));
  for (const r of rides)
    for (const s of r.shocks) {
      if (s.lat === null || s.lon === null) continue;
      dets.push({
        id: `${r.ride_id}:${s.id}`, lat: s.lat, lon: s.lon, r: s.r ?? 10, peak: s.peak, double_hit: s.double_hit, speed: s.speed,
        edge: s.edge, needs_review: s.needs_review, pass_key: `${r.ride_id}:${s.edge}:${s.pass}`, snippet: s.snippet, date: day(s.t), flags: s.flags,
      });
    }
  // ordine deterministă: vârful descrescător, apoi id
  dets.sort((a, b) => b.peak - a.peak || (a.id < b.id ? -1 : 1));
  const zones: { members: Det[]; lat: number; lon: number; r: number }[] = [];
  for (const d of dets) {
    let joined = false;
    for (const z of zones) {
      const dist = haversine(z.lat, z.lon, d.lat, d.lon);
      if (dist <= Math.max(8, Math.sqrt(z.r ** 2 + d.r ** 2))) {
        z.members.push(d);
        joined = true;
        break;
      }
    }
    if (!joined) zones.push({ members: [d], lat: d.lat, lon: d.lon, r: d.r });
  }
  return zones.map((z) => {
    const m = z.members;
    const reviewed = m.filter((d) => !d.needs_review && !rejected.has(d.id));
    const passKeys = new Set(reviewed.map((d) => d.pass_key));
    const detections = passKeys.size;
    const edgeId = m[0].edge;
    const passes = Math.max(detections, edgeId >= 0 ? edges.get(edgeId)?.n_passes ?? 0 : 0);
    let status: ZoneStatus;
    if (m.every((d) => rejected.has(d.id))) status = 'REJECTED';
    else if (!reviewed.length) status = 'NEEDS_REVIEW';
    else if (detections >= 2 && detections / Math.max(1, passes) >= 0.5) status = 'REPEATED';
    else status = 'CANDIDATE';
    const lat = m.reduce((a, d) => a + d.lat, 0) / m.length;
    const lon = m.reduce((a, d) => a + d.lon, 0) / m.length;
    const strongest = m[0];
    return {
      id: `z${Math.round(lat * 1e5)}_${Math.round(lon * 1e5)}`,
      lat, lon,
      radius_m: Math.max(...m.map((d) => d.r)),
      status,
      passes,
      detections,
      peak_median: median(m.map((d) => d.peak)),
      peak_max: strongest.peak,
      double_hit_ratio: m.filter((d) => d.double_hit).length / m.length,
      speed_median: medianOrNull(m.map((d) => d.speed).filter((s): s is number => s !== null)),
      last_seen: m.map((d) => d.date).sort().pop()!,
      edge_id: edgeId,
      surface_kind: edgeId >= 0 ? kindOf?.(edgeId) ?? null : null,
      strongest: { peak: strongest.peak, snippet: strongest.snippet, speed: strongest.speed, double_hit: strongest.double_hit, date: strongest.date, flags: strongest.flags },
      members: m.map((d) => d.id),
    };
  });
}

export interface LayerDiff {
  km_before: number;
  km_after: number;
  new_measured: number;
  new_covered: number;
  status_changed: { edge: number; from: EdgeStatus; to: EdgeStatus }[];
  class_changed: { edge: number; from: ComfortClass | null; to: ComfortClass | null }[];
  passes_added: number;
  rvi_changes: { edge: number; before: number | null; after: number | null }[];
  zones_before: number;
  zones_after: number;
  touched_edges: number[];
}

export function coveredKm(l: ComfortLayer, lengthOf: (e: number) => number): number {
  let m = 0;
  for (const e of l.edges.values()) if (e.status !== 'UNKNOWN') m += lengthOf(e.edge_id);
  return m / 1000;
}

export function diffLayers(a: ComfortLayer, b: ComfortLayer, lengthOf: (e: number) => number): LayerDiff {
  const status_changed: LayerDiff['status_changed'] = [];
  const class_changed: LayerDiff['class_changed'] = [];
  const rvi_changes: LayerDiff['rvi_changes'] = [];
  let new_measured = 0, new_covered = 0, passes = 0;
  const ids = new Set([...a.edges.keys(), ...b.edges.keys()]);
  const touched: number[] = [];
  for (const id of ids) {
    const x = a.edges.get(id), y = b.edges.get(id);
    const sx: EdgeStatus = x?.status ?? 'UNKNOWN', sy: EdgeStatus = y?.status ?? 'UNKNOWN';
    const changedSomething = (x?.n_windows_total ?? 0) !== (y?.n_windows_total ?? 0) || (x?.rms_median ?? null) !== (y?.rms_median ?? null);
    if (changedSomething) touched.push(id);
    if (sx !== sy) status_changed.push({ edge: id, from: sx, to: sy });
    if (sx !== 'MEASURED' && sy === 'MEASURED') new_measured++;
    if (sx === 'UNKNOWN' && sy !== 'UNKNOWN') new_covered++;
    if ((x?.class ?? null) !== (y?.class ?? null)) class_changed.push({ edge: id, from: x?.class ?? null, to: y?.class ?? null });
    passes += (y?.n_passes ?? 0) - (x?.n_passes ?? 0);
    if (changedSomething && (x?.rms_median ?? null) !== (y?.rms_median ?? null)) rvi_changes.push({ edge: id, before: x?.rms_median ?? null, after: y?.rms_median ?? null });
  }
  return {
    km_before: coveredKm(a, lengthOf),
    km_after: coveredKm(b, lengthOf),
    new_measured,
    new_covered,
    status_changed,
    class_changed,
    passes_added: passes,
    rvi_changes,
    zones_before: a.zones.length,
    zones_after: b.zones.length,
    touched_edges: touched,
  };
}

/** Snapshot publicabil: exclude primii și ultimii trim_m metri ai fiecărei ture, fără timpi și ID-uri de dispozitiv. */
export function buildSnapshot(rides: ProcessedRide[], cfg: VibrationConfig, deviceNote: string, thresholds: Thresholds | null, thSrc: string): Snapshot {
  const edges = new Map<number, SnapshotEdge>();
  const shocks: SnapshotShock[] = [];
  for (const p of rides) {
    const total = p.summary.distance_m;
    const keep = (d: number) => d >= cfg.publish_trim_m && d <= total - cfg.publish_trim_m;
    const passesByEdge = new Map<number, Set<number>>();
    for (const w of p.windows) {
      if (w.edge < 0 || !keep(w.dist)) continue;
      let e = edges.get(w.edge);
      if (!e) { e = { edge_id: w.edge, rms: [], speed: [], acc: [], n_total: 0, n_amb: 0, n_passes: 0, n_rides: 0, last_seen: '', sources: [] }; edges.set(w.edge, e); }
      e.n_total++;
      if (w.amb) e.n_amb++;
      if (!w.valid) continue;
      e.rms.push(Math.round(w.rms * 1000) / 1000);
      if (w.speed !== null) e.speed.push(Math.round(w.speed * 100) / 100);
      if (w.acc !== null) e.acc.push(Math.round(w.acc * 10) / 10);
      let s = passesByEdge.get(w.edge);
      if (!s) { s = new Set(); passesByEdge.set(w.edge, s); }
      s.add(w.pass);
      if (!e.sources.includes(p.meta.source)) e.sources.push(p.meta.source);
    }
    for (const [eid, s] of passesByEdge) {
      const e = edges.get(eid)!;
      e.n_passes += s.size;
      e.n_rides += 1;
      const d = day(p.meta.start_ms);
      if (d > e.last_seen) e.last_seen = d;
    }
    for (const s of p.shocks) {
      if (!s.located || s.lat === null || s.lon === null) continue;
      const w = p.windows.find((w) => s.t >= w.t0 && s.t < w.t1);
      if (!w || !keep(w.dist)) continue;
      shocks.push({
        lat: Math.round(s.lat * 1e6) / 1e6, lon: Math.round(s.lon * 1e6) / 1e6, r: Math.round((s.r ?? 10) * 10) / 10,
        peak: Math.round(s.peak * 100) / 100, z: Math.round(s.z * 10) / 10, double_hit: s.double_hit,
        speed: s.speed === null ? null : Math.round(s.speed * 100) / 100, edge: s.edge, needs_review: s.needs_review,
        pass_key: `${p.ride_id}:${s.edge}:${s.pass}`, snippet: s.snippet, date: day(s.t),
      });
    }
  }
  return {
    meta: {
      processing_version: cfg.processing_version,
      generated_at: new Date().toISOString(),
      thresholds,
      thresholds_source: thSrc,
      device_note: deviceNote,
      ride_ids: rides.map((r) => r.ride_id).sort(),
      attribution: '© OpenStreetMap contributors',
      license: 'ODbL-1.0',
    },
    edges: [...edges.values()].filter((e) => e.n_total > 0).sort((a, b) => a.edge_id - b.edge_id),
    shocks,
  };
}
