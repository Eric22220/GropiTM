// Import Sensor Logger (iOS și Android). Structura e documentată în docs/sensorlogger-format.md.
import { G } from '../config';
import { median } from '../stats';
import { nsStringToMs } from '../time';
import type { GpsFix, GyroData, MotionData, RawRide, RideEvent, RideMeta } from '../types';
import { colIndex, decodeText, forEachRow, num, parseCsv, type CsvTable } from './csv';
import { findFile, type FileMap } from './zip';

export class ImportError extends Error {}

export function looksLikeSensorLogger(files: FileMap): boolean {
  return !!(findFile(files, 'Metadata.csv') || (findFile(files, 'Location.csv') && (findFile(files, 'AccelerometerUncalibrated.csv') || findFile(files, 'TotalAcceleration.csv'))));
}

function table(files: FileMap, name: string): CsvTable | null {
  const f = findFile(files, name);
  if (!f || f.length === 0) return null; // fișier gol = senzor absent
  const t = parseCsv(decodeText(f));
  if (t.rows.length === 0) return null;
  return t;
}

interface Xyz {
  t: Float64Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
}

/** citire în flux a unui fișier time,x,y,z direct în typed arrays (fără a reține rândurile) */
function readXyzFile(files: FileMap, name: string): Xyz | null {
  const f = findFile(files, name);
  if (!f || f.length === 0) return null;
  const text = decodeText(f);
  // estimare de capacitate: ~50 octeți pe linie; se mărește la nevoie
  let cap = Math.max(1024, Math.ceil(f.length / 40));
  let T = new Float64Array(cap), X = new Float32Array(cap), Y = new Float32Array(cap), Z = new Float32Array(cap);
  let it = -1, ix = -1, iy = -1, iz = -1;
  let k = 0, last = -Infinity;
  forEachRow(
    text,
    (h) => {
      const idx = (n: string) => h.findIndex((c) => c.toLowerCase() === n);
      it = idx('time'); ix = idx('x'); iy = idx('y'); iz = idx('z');
      if (it < 0 || ix < 0 || iy < 0 || iz < 0) throw new ImportError(`${name}: coloane lipsă (time, x, y, z).`);
    },
    (r) => {
      const tm = nsStringToMs(r[it]);
      if (!Number.isFinite(tm) || tm <= last) return; // timp invalid sau nemonoton
      if (k >= cap) {
        cap *= 2;
        const g64 = (a: Float64Array) => { const b = new Float64Array(cap); b.set(a); return b; };
        const g32 = (a: Float32Array) => { const b = new Float32Array(cap); b.set(a); return b; };
        T = g64(T); X = g32(X); Y = g32(Y); Z = g32(Z);
      }
      T[k] = tm; X[k] = num(r, ix); Y[k] = num(r, iy); Z[k] = num(r, iz);
      last = tm;
      k++;
    },
  );
  if (k === 0) return null;
  return { t: T.slice(0, k), x: X.slice(0, k), y: Y.slice(0, k), z: Z.slice(0, k) };
}

function medianMagnitude(d: Xyz): number {
  const n = d.t.length;
  const step = Math.max(1, Math.floor(n / 5000));
  const m: number[] = [];
  for (let i = 0; i < n; i += step) {
    const v = Math.hypot(d.x[i], d.y[i], d.z[i]);
    if (Number.isFinite(v)) m.push(v);
  }
  return median(m);
}

export function detectUnit(medMag: number): 'g' | 'm/s2' {
  if (medMag > 0.7 && medMag < 1.3) return 'g';
  if (medMag > 7 && medMag < 12.5) return 'm/s2';
  throw new ImportError(
    `Unitatea accelerației nu poate fi detectată: modulul median e ${medMag.toFixed(3)} (așteptat ~1 g sau ~9,81 m/s²). Telefonul trebuie să fie în repaus o parte din timp.`,
  );
}

function nearestAlign(base: Xyz, other: Xyz): Xyz {
  // aliniază `other` pe timpii lui `base` (cea mai apropiată mostră)
  const n = base.t.length;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j + 1 < other.t.length && Math.abs(other.t[j + 1] - base.t[i]) <= Math.abs(other.t[j] - base.t[i])) j++;
    X[i] = other.x[j];
    Y[i] = other.y[j];
    Z[i] = other.z[j];
  }
  return { t: base.t, x: X, y: Y, z: Z };
}

const neg1ToNull = (v: number): number | null => (Number.isFinite(v) && v >= 0 ? v : null);

export function parseSensorLogger(files: FileMap): RawRide {
  const warnings: string[] = [];
  // ---- Metadata
  const extra: Record<string, string> = {};
  const metaT = table(files, 'Metadata.csv');
  if (metaT) metaT.header.forEach((h, i) => (extra[h] = (metaT.rows[0][i] ?? '').trim()));
  else warnings.push('Metadata.csv lipsește: platforma și ID-ul turei sunt deduse.');

  // ---- Accelerație brută cu gravitație
  let accelFile = '';
  let acc: Xyz | null = null;
  for (const name of ['TotalAcceleration.csv', 'AccelerometerUncalibrated.csv']) {
    const d = readXyzFile(files, name);
    if (d) {
      acc = d;
      accelFile = name;
      break;
    }
  }
  if (!acc) {
    // Rezervă: Accelerometer (fără gravitație) + Gravity, ambele virtuale. Marcat explicit.
    const ax = readXyzFile(files, 'Accelerometer.csv');
    const gr = readXyzFile(files, 'Gravity.csv');
    if (ax && gr) {
      const gx = nearestAlign(ax, gr);
      acc = { t: ax.t, x: ax.x.map((v, i) => v + gx.x[i]), y: ax.y.map((v, i) => v + gx.y[i]), z: ax.z.map((v, i) => v + gx.z[i]) };
      accelFile = 'Accelerometer.csv+Gravity.csv';
      warnings.push('Lipsește accelerația brută (TotalAcceleration / AccelerometerUncalibrated); s-a reconstruit din Accelerometer + Gravity (senzori virtuali). Activează „Uncalibrated" în Sensor Logger.');
    }
  }
  if (!acc || acc.t.length < 10) {
    throw new ImportError('Exportul nu conține accelerație brută (TotalAcceleration.csv sau AccelerometerUncalibrated.csv cu date).');
  }
  const medMag = medianMagnitude(acc);
  const unit = detectUnit(medMag);
  if (unit === 'g') {
    for (let i = 0; i < acc.t.length; i++) {
      acc.x[i] *= G;
      acc.y[i] *= G;
      acc.z[i] *= G;
    }
  }
  const motion: MotionData = { t: acc.t, x: acc.x, y: acc.y, z: acc.z, withGravity: true };

  // ---- Giroscop (rad/s → °/s)
  let gyro: GyroData | null = null;
  let gyroFile = '';
  for (const name of ['Gyroscope.csv', 'GyroscopeUncalibrated.csv']) {
    const g = readXyzFile(files, name);
    if (g) {
      const mag = new Float32Array(g.t.length);
      for (let i = 0; i < mag.length; i++) mag[i] = (Math.hypot(g.x[i], g.y[i], g.z[i]) * 180) / Math.PI;
      gyro = { t: g.t, mag };
      gyroFile = name;
      break;
    }
  }
  if (!gyro) warnings.push('Fără giroscop: filtrul de rotație (> 300 °/s) nu se poate aplica.');

  // ---- Locație (coloanele după nume; ordinea diferă iOS / Android)
  const gps: GpsFix[] = [];
  const loc = table(files, 'Location.csv');
  if (loc) {
    const c = {
      t: colIndex(loc, 'time'),
      lat: colIndex(loc, 'latitude'),
      lon: colIndex(loc, 'longitude'),
      acc: colIndex(loc, 'horizontalAccuracy'),
      alt: colIndex(loc, 'altitude'),
      speed: colIndex(loc, 'speed'),
      bearing: colIndex(loc, 'bearing'),
      speedAcc: colIndex(loc, 'speedAccuracy'),
    };
    if (c.t < 0 || c.lat < 0 || c.lon < 0) warnings.push('Location.csv nu are coloanele time/latitude/longitude.');
    else {
      let last = -Infinity;
      for (const r of loc.rows) {
        const t = nsStringToMs(r[c.t]);
        const lat = num(r, c.lat), lon = num(r, c.lon);
        if (!Number.isFinite(t) || !Number.isFinite(lat) || !Number.isFinite(lon) || t <= last) continue;
        if (Math.abs(lat) < 1e-9 && Math.abs(lon) < 1e-9) continue;
        last = t;
        gps.push({
          t,
          lat,
          lon,
          acc: neg1ToNull(num(r, c.acc)),
          alt: Number.isFinite(num(r, c.alt)) ? num(r, c.alt) : null,
          speed: neg1ToNull(num(r, c.speed)),
          heading: neg1ToNull(num(r, c.bearing)),
          speedAcc: neg1ToNull(num(r, c.speedAcc)),
        });
      }
    }
  } else warnings.push('Fără Location.csv: tura nu poate fi pusă pe hartă.');

  // ---- Adnotări
  const events: RideEvent[] = [];
  const ann = table(files, 'Annotation.csv');
  if (ann) {
    const it = colIndex(ann, 'time');
    const textCols = ann.header.map((h, i) => i).filter((i) => !['time', 'seconds_elapsed'].includes(ann.header[i].toLowerCase()));
    for (const r of ann.rows) {
      const t = nsStringToMs(r[it]);
      if (!Number.isFinite(t)) continue;
      events.push({ t, type: 'annotation', detail: textCols.map((i) => r[i]).filter(Boolean).join(' ').trim() });
    }
  }

  const platform = (extra['platform'] || '').toLowerCase() || (accelFile === 'TotalAcceleration.csv' ? 'android' : 'ios?');
  const epoch = extra['recording epoch time'] || String(Math.round(motion.t[0]));
  const deviceId = extra['device id'] || extra['device name'] || 'necunoscut';
  const meta: RideMeta = {
    source: 'sensorlogger',
    ride_key: `sensorlogger:${deviceId}:${epoch}`,
    device: extra['device name'] || undefined,
    platform,
    app_version: extra['appVersion'] || undefined,
    recording_time: extra['recording time'] || undefined,
    timezone: extra['recording timezone'] || undefined,
    start_ms: motion.t[0],
    stop_ms: motion.t[motion.t.length - 1],
    unit_detected: unit,
    accel_file: accelFile,
    gyro_file: gyroFile || undefined,
    orientation_aware: true,
    motion_clock: 'sensor',
    warnings,
    extra: { ...extra, accel_median_magnitude_raw: medMag.toFixed(4) },
  };
  return { meta, motion, gyro, gps, events };
}
