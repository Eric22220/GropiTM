// Formatul vechi BikeGuard (7.2): teste de senzori, nu măsurători de drum.
import type { GpsFix, RawRide } from '../types';
import { colIndex, decodeText, num, numOrNull, parseCsv } from './csv';
import { ImportError } from './sensorlogger';

export const LEGACY_LABEL = 'Test de senzori — nu reprezintă măsurători de drum.';

export function looksLikeLegacy(header: string[]): boolean {
  const h = header.map((s) => s.toLowerCase());
  return h.includes('elapsed_ms') || (h.includes('utc') && h.includes('latitude') && h.includes('type'));
}

/** Acceptă unul sau două CSV-uri vechi (mișcare și/sau GPS). */
export function parseLegacy(csvs: Uint8Array[]): RawRide {
  const T: number[] = [], X: number[] = [], Y: number[] = [], Z: number[] = [];
  const GT: number[] = [], GM: number[] = [];
  const gps: GpsFix[] = [];
  for (const bytes of csvs) {
    const t = parseCsv(decodeText(bytes));
    if (!looksLikeLegacy(t.header)) throw new ImportError('CSV necunoscut: nu e Sensor Logger, export ShockGrid sau formatul vechi BikeGuard.');
    const c = {
      type: colIndex(t, 'type'), utc: colIndex(t, 'utc'), x: colIndex(t, 'x'), y: colIndex(t, 'y'), z: colIndex(t, 'z'),
      ra: colIndex(t, 'rot_alpha'), rb: colIndex(t, 'rot_beta'), rg: colIndex(t, 'rot_gamma'),
      lat: colIndex(t, 'latitude'), lon: colIndex(t, 'longitude'), acc: colIndex(t, 'accuracy_m'),
      speed: colIndex(t, 'speed_mps'), heading: colIndex(t, 'heading_deg'),
    };
    for (const r of t.rows) {
      const tm = Date.parse(r[c.utc] ?? '');
      if (!Number.isFinite(tm)) continue;
      const type = (r[c.type] ?? '').toLowerCase();
      if (c.x >= 0 && type !== 'gps') {
        const x = num(r, c.x), y = num(r, c.y), z = num(r, c.z);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          T.push(tm); X.push(x); Y.push(y); Z.push(z);
          const ra = num(r, c.ra), rb = num(r, c.rb), rg = num(r, c.rg);
          if (Number.isFinite(ra) && Number.isFinite(rb) && Number.isFinite(rg)) { GT.push(tm); GM.push(Math.hypot(ra, rb, rg)); }
        }
      }
      if (type === 'gps' || c.speed >= 0) {
        const lat = num(r, c.lat), lon = num(r, c.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) gps.push({ t: tm, lat, lon, acc: numOrNull(r, c.acc), alt: null, speed: numOrNull(r, c.speed), heading: numOrNull(r, c.heading), speedAcc: null });
      }
    }
  }
  // sortare și eliminarea duplicatelor de timp
  const order = T.map((_, i) => i).sort((a, b) => T[a] - T[b]);
  const t2: number[] = [], x2: number[] = [], y2: number[] = [], z2: number[] = [];
  let last = -Infinity;
  for (const i of order) if (T[i] > last) { t2.push(T[i]); x2.push(X[i]); y2.push(Y[i]); z2.push(Z[i]); last = T[i]; }
  if (t2.length < 10) throw new ImportError('Fișierul vechi nu conține date de mișcare.');
  gps.sort((a, b) => a.t - b.t);
  return {
    meta: {
      source: 'legacy',
      ride_key: `legacy:${t2[0]}:${t2.length}`,
      label: LEGACY_LABEL,
      start_ms: t2[0],
      stop_ms: t2[t2.length - 1],
      orientation_aware: false,
      warnings: [LEGACY_LABEL, 'Format vechi: fără accelerationIncludingGravity, se folosește |acceleration|.'],
      extra: {},
    },
    motion: { t: Float64Array.from(t2), x: Float32Array.from(x2), y: Float32Array.from(y2), z: Float32Array.from(z2), withGravity: false },
    gyro: GT.length ? { t: Float64Array.from(GT), mag: Float32Array.from(GM) } : null,
    gps,
    events: [],
  };
}
