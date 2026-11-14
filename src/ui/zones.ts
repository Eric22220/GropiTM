// Cartierele Timișoarei din endpoint-ul Primăriei (ghidul oficial: GET /api/zones, BROWSER OK).
// Descărcat o singură dată, la cerere, și păstrat în IndexedDB. Nu se fac interogări repetate.
import { kvGet, kvSet } from '../storage/idb';

interface Feature { properties: Record<string, unknown>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }
interface Cache { fetched_at: string; features: Feature[] }

let mem: Cache | null = null;
let pending: Promise<Cache | null> | null = null;
export const ZONES_URL = 'https://cont.primariatm.ro/api/zones';

async function load(): Promise<Cache | null> {
  if (mem) return mem;
  if (pending) return pending;
  pending = (async () => {
    const cached = await kvGet<Cache>('zones-cache');
    if (cached?.features?.length) return (mem = cached);
    try {
      const r = await fetch(ZONES_URL);
      if (!r.ok) return null;
      const j = await r.json();
      const features: Feature[] = (j.features ?? j?.data?.features ?? []) as Feature[];
      if (!features.length) return null;
      mem = { fetched_at: new Date().toISOString(), features };
      await kvSet('zones-cache', mem).catch(() => {});
      return mem;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** numele cartierului pentru un punct; null dacă nu se poate afla (fără rețea, format schimbat) */
export async function neighbourhoodOf(lat: number, lon: number): Promise<{ name: string; fetched_at: string } | null> {
  const c = await load();
  if (!c) return null;
  for (const f of c.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as number[][][][];
    for (const p of polys) {
      if (p[0] && inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h))) {
        const pr = f.properties ?? {};
        const name = String(pr.name ?? pr.nume ?? pr.title ?? pr.denumire ?? Object.values(pr).find((v) => typeof v === 'string') ?? '');
        return name ? { name, fetched_at: c.fetched_at } : null;
      }
    }
  }
  return null;
}
