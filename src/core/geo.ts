const R = 6371008.8;
const toRad = Math.PI / 180;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Proiecție echirectangulară locală (m), suficientă la scara unui oraș */
export class LocalProjection {
  readonly kx: number;
  readonly ky: number;
  constructor(readonly lat0: number, readonly lon0: number) {
    this.ky = (Math.PI / 180) * R;
    this.kx = this.ky * Math.cos(lat0 * toRad);
  }
  x(lon: number) {
    return (lon - this.lon0) * this.kx;
  }
  y(lat: number) {
    return (lat - this.lat0) * this.ky;
  }
  lon(x: number) {
    return x / this.kx + this.lon0;
  }
  lat(y: number) {
    return y / this.ky + this.lat0;
  }
}

export const TIMISOARA_CENTER: [number, number] = [45.7537, 21.2257];
export const TM_PROJ = new LocalProjection(TIMISOARA_CENTER[0], TIMISOARA_CENTER[1]);

/** distanța de la punctul (px,py) la segmentul (ax,ay)-(bx,by); întoarce [dist, t] */
export function pointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return [Math.sqrt(qx * qx + qy * qy), t];
}

/** azimut (grade de la nord, sens orar) al vectorului (dx, dy) în metri */
export function bearingXY(dx: number, dy: number): number {
  const b = (Math.atan2(dx, dy) * 180) / Math.PI;
  return b < 0 ? b + 360 : b;
}

/** diferența de direcție fără sens (0..90) */
export function axialDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

// ---- Polyline (algoritmul Google, precizie 5) pentru geometria compactă a grafului ----
export function encodePolyline(coords: [number, number][], precision = 5): string {
  const f = 10 ** precision;
  let out = '';
  let plat = 0, plon = 0;
  const enc = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lat, lon] of coords) {
    const ilat = Math.round(lat * f), ilon = Math.round(lon * f);
    out += enc(ilat - plat) + enc(ilon - plon);
    plat = ilat;
    plon = ilon;
  }
  return out;
}

export function decodePolyline(str: string, precision = 5): [number, number][] {
  const f = 10 ** precision;
  const out: [number, number][] = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (let k = 0; k < 2; k++) {
      let shift = 0, result = 0, b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d;
      else lon += d;
    }
    out.push([lat / f, lon / f]);
  }
  return out;
}
