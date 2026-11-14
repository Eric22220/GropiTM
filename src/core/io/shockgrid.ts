// Formatul propriu de export (7.1): meta.json, motion.csv, gps.csv, events.csv într-un ZIP.
import type { GpsFix, RawRide, RideEvent, RideMeta } from '../types';
import { colIndex, decodeText, num, numOrNull, parseCsv, toCsv } from './csv';
import { findFile, makeZip, type FileMap } from './zip';
import { ImportError } from './sensorlogger';

export const FORMAT_VERSION = 1;

export function looksLikeShockGrid(files: FileMap): boolean {
  return !!(findFile(files, 'meta.json') && findFile(files, 'motion.csv'));
}

export interface RecorderMotionRow {
  t: number;
  interval: number | null;
  agx: number | null;
  agy: number | null;
  agz: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  ra: number | null;
  rb: number | null;
  rg: number | null;
}

export function parseShockGrid(files: FileMap): RawRide {
  const metaJson = JSON.parse(decodeText(findFile(files, 'meta.json')!));
  const mt = parseCsv(decodeText(findFile(files, 'motion.csv')!));
  const c = {
    t: colIndex(mt, 't'),
    agx: colIndex(mt, 'agx'), agy: colIndex(mt, 'agy'), agz: colIndex(mt, 'agz'),
    ax: colIndex(mt, 'ax'), ay: colIndex(mt, 'ay'), az: colIndex(mt, 'az'),
    ra: colIndex(mt, 'ra'), rb: colIndex(mt, 'rb'), rg: colIndex(mt, 'rg'),
  };
  const n = mt.rows.length;
  const T = new Float64Array(n), X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  const GT = new Float64Array(n), GM = new Float32Array(n);
  let withGravity = true;
  // dacă lipsește accelerationIncludingGravity, folosim |acceleration| (orientation_aware = false)
  const hasAg = mt.rows.some((r) => Number.isFinite(num(r, c.agx)));
  if (!hasAg) withGravity = false;
  let k = 0, kg = 0, last = -Infinity;
  for (const r of mt.rows) {
    const t = num(r, c.t);
    if (!Number.isFinite(t) || t <= last) continue;
    const x = withGravity ? num(r, c.agx) : num(r, c.ax);
    const y = withGravity ? num(r, c.agy) : num(r, c.ay);
    const z = withGravity ? num(r, c.agz) : num(r, c.az);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    T[k] = t; X[k] = x; Y[k] = y; Z[k] = z; k++;
    last = t;
    const ra = num(r, c.ra), rb = num(r, c.rb), rg = num(r, c.rg);
    if (Number.isFinite(ra) && Number.isFinite(rb) && Number.isFinite(rg)) {
      GT[kg] = t;
      GM[kg] = Math.hypot(ra, rb, rg);
      kg++;
    }
  }
  if (k < 10) throw new ImportError('motion.csv nu conține date de accelerație.');
  const gps: GpsFix[] = [];
  const gf = findFile(files, 'gps.csv');
  if (gf) {
    const gt = parseCsv(decodeText(gf));
    const g = {
      t: colIndex(gt, 'fix_t'), lat: colIndex(gt, 'lat'), lon: colIndex(gt, 'lon'), acc: colIndex(gt, 'acc'),
      alt: colIndex(gt, 'alt'), speed: colIndex(gt, 'speed'), heading: colIndex(gt, 'heading'),
    };
    let lastT = -Infinity;
    for (const r of gt.rows) {
      const t = num(r, g.t), lat = num(r, g.lat), lon = num(r, g.lon);
      if (!Number.isFinite(t) || !Number.isFinite(lat) || !Number.isFinite(lon) || t <= lastT) continue;
      lastT = t;
      gps.push({ t, lat, lon, acc: numOrNull(r, g.acc), alt: numOrNull(r, g.alt), speed: numOrNull(r, g.speed), heading: numOrNull(r, g.heading), speedAcc: null });
    }
  }
  const events: RideEvent[] = [];
  const ef = findFile(files, 'events.csv');
  if (ef) {
    const et = parseCsv(decodeText(ef));
    const it = colIndex(et, 't'), ity = colIndex(et, 'type'), id = colIndex(et, 'detail');
    for (const r of et.rows) {
      const t = num(r, it);
      if (Number.isFinite(t)) events.push({ t, type: r[ity] ?? '', detail: id >= 0 ? r[id] : undefined });
    }
  }
  const meta: RideMeta = {
    source: 'shockgrid',
    ride_key: `shockgrid:${metaJson.ride_uuid ?? metaJson.start ?? T[0]}`,
    label: metaJson.label,
    device: metaJson.device,
    platform: metaJson.platform,
    app_version: metaJson.app_version,
    start_ms: T[0],
    stop_ms: T[k - 1],
    orientation_aware: withGravity,
    motion_clock: metaJson.motion_clock,
    bike: metaJson.bike,
    mount: metaJson.mount,
    declared_surface: metaJson.declared_surface ?? null,
    warnings: withGravity ? [] : ['Fișier fără accelerationIncludingGravity: se folosește |acceleration| (orientation_aware = false).'],
    extra: { user_agent: String(metaJson.user_agent ?? ''), resolution: String(metaJson.observed_resolution ?? '') },
  };
  return {
    meta,
    motion: { t: T.slice(0, k), x: X.slice(0, k), y: Y.slice(0, k), z: Z.slice(0, k), withGravity },
    gyro: kg > 0 ? { t: GT.slice(0, kg), mag: GM.slice(0, kg) } : null,
    gps,
    events,
  };
}

export interface RecorderData {
  meta: Record<string, unknown>;
  motion: RecorderMotionRow[];
  gps: { fix_t: number; recv_t: number; lat: number; lon: number; acc: number | null; alt: number | null; alt_acc: number | null; speed: number | null; heading: number | null }[];
  events: RideEvent[];
}

export function buildShockGridZip(d: RecorderData): Uint8Array {
  const motion = toCsv(
    ['t', 'interval', 'agx', 'agy', 'agz', 'ax', 'ay', 'az', 'ra', 'rb', 'rg'],
    d.motion.map((m) => [m.t.toFixed(3), m.interval, m.agx, m.agy, m.agz, m.ax, m.ay, m.az, m.ra, m.rb, m.rg]),
  );
  const gps = toCsv(
    ['fix_t', 'recv_t', 'lat', 'lon', 'acc', 'alt', 'alt_acc', 'speed', 'heading'],
    d.gps.map((g) => [g.fix_t, g.recv_t, g.lat, g.lon, g.acc, g.alt, g.alt_acc, g.speed, g.heading]),
  );
  const events = toCsv(['t', 'type', 'detail'], d.events.map((e) => [e.t, e.type, e.detail ?? '']));
  return makeZip({
    'meta.json': JSON.stringify({ format_version: FORMAT_VERSION, ...d.meta }, null, 2),
    'motion.csv': motion,
    'gps.csv': gps,
    'events.csv': events,
  });
}
