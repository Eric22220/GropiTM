// Căutare de adrese pentru planificarea rutelor.
// 1) Index local, offline, cu numele străzilor din graful OSM (instant, fără rețea).
// 2) Photon (komoot, https://photon.komoot.io) pentru adrese și puncte de interes: e făcut pentru
//    căutare „pe măsură ce scrii”. NU folosim Nominatim public pentru autocomplete (politica lui o interzice).
//    Cereri: minim 3 caractere, debounce în UI, anularea cererilor depășite, cache, timeout, rezultate
//    limitate la zona Timișoarei. Serviciul e gratuit, fără garanție de disponibilitate.
import type { Graph } from '../core/graph';
import { haversine } from '../core/geo';

export type PlaceKind = 'mylocation' | 'street' | 'address' | 'poi' | 'place' | 'map' | 'recent';

export interface Place {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lon: number;
  kind: PlaceKind;
  source: 'local' | 'photon' | 'map' | 'gps' | 'recent';
}

/** zona în care căutăm (Timișoara + localitățile lipite), minLon, minLat, maxLon, maxLat */
export const TM_BBOX: [number, number, number, number] = [21.08, 45.66, 21.38, 45.84];
export const PHOTON_URL = 'https://photon.komoot.io';

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ţ]/g, 't')
    .replace(/[ş]/g, 's')
    .replace(/\b(strada|str\.?|bulevardul|bd\.?|bulevard|calea|piata|piața|aleea|splaiul|intrarea)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface StreetEntry { name: string; key: string; lat: number; lon: number; len: number }

/** index local: un punct reprezentativ (mijlocul celei mai lungi muchii) pentru fiecare nume de stradă */
export function buildStreetIndex(g: Graph): StreetEntry[] {
  const best = new Map<string, StreetEntry>();
  const total = new Map<string, number>();
  for (let e = 0; e < g.nEdges; e++) {
    const name = g.name[e];
    if (!name) continue;
    total.set(name, (total.get(name) ?? 0) + g.length[e]);
    const cur = best.get(name);
    if (!cur || g.length[e] > cur.len) {
      const geo = g.geometry(e);
      const mid = geo[Math.floor(geo.length / 2)];
      best.set(name, { name, key: normalize(name), lat: mid[0], lon: mid[1], len: g.length[e] });
    }
  }
  return [...best.values()].map((s) => ({ ...s, len: total.get(s.name) ?? s.len }));
}

export function searchStreets(index: StreetEntry[], q: string, limit = 5): Place[] {
  const k = normalize(q);
  if (k.length < 2) return [];
  const words = k.split(' ');
  const scored: [number, StreetEntry][] = [];
  for (const s of index) {
    if (!words.every((w) => s.key.includes(w))) continue;
    let score = s.key.startsWith(k) ? 0 : s.key.split(' ').some((w) => w.startsWith(words[0])) ? 1 : 2;
    score -= Math.min(0.9, s.len / 20000); // străzile lungi primele, la egalitate
    scored.push([score, s]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map(([, s]) => ({ id: `street:${s.name}`, name: s.name, detail: 'Stradă · Timișoara', lat: s.lat, lon: s.lon, kind: 'street', source: 'local' }));
}

export function nearestStreetName(g: Graph, lat: number, lon: number): string | null {
  const c = g.query(lat, lon, 60).find((x) => g.name[x.edge]);
  return c ? g.name[c.edge] : null;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
}

export function photonToPlace(f: PhotonFeature): Place | null {
  const [lon, lat] = f.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = f.properties ?? {};
  const street = p.street ? `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}` : '';
  const name = String(p.name ?? (street || p.city || ''));
  if (!name) return null;
  const parts = [p.name && street ? street : '', p.district ?? p.locality ?? '', p.city ?? p.county ?? ''].filter(Boolean) as string[];
  const key = String(p.osm_key ?? '');
  const kind: PlaceKind = p.housenumber && !p.name ? 'address' : key === 'highway' ? 'street' : key === 'place' || key === 'boundary' ? 'place' : 'poi';
  return { id: `photon:${p.osm_type ?? ''}${p.osm_id ?? `${lat},${lon}`}`, name, detail: [...new Set(parts)].join(', ') || 'Timișoara', lat, lon, kind, source: 'photon' };
}

export const inBbox = (lat: number, lon: number, b = TM_BBOX) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

export class GeocodeError extends Error {
  constructor(readonly kind: 'timeout' | 'offline' | 'http' | 'aborted', msg: string) { super(msg); }
}

export interface GeocoderOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  center?: [number, number];
}

/** Client Photon cu cache, timeout și anulare. */
export class PhotonGeocoder {
  private cache = new Map<string, Place[]>();
  private fetchFn: typeof fetch;
  private base: string;
  private timeoutMs: number;
  private center: [number, number];
  requests = 0;
  constructor(o: GeocoderOptions = {}) {
    this.fetchFn = o.fetchFn ?? ((...a) => fetch(...a));
    this.base = o.baseUrl ?? PHOTON_URL;
    this.timeoutMs = o.timeoutMs ?? 6000;
    this.center = o.center ?? [45.7537, 21.2257];
  }

  private async get(url: string, signal?: AbortSignal): Promise<{ features?: PhotonFeature[] }> {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener('abort', onAbort);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, this.timeoutMs);
    try {
      this.requests++;
      const r = await this.fetchFn(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new GeocodeError('http', `Serviciul de căutare a răspuns cu ${r.status}.`);
      return await r.json();
    } catch (e) {
      if (e instanceof GeocodeError) throw e;
      if (timedOut) throw new GeocodeError('timeout', 'Serviciul de căutare nu a răspuns la timp.');
      if (signal?.aborted) throw new GeocodeError('aborted', 'Căutare anulată.');
      throw new GeocodeError('offline', 'Serviciul de căutare nu e disponibil (fără internet?).');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async search(q: string, signal?: AbortSignal): Promise<Place[]> {
    const query = q.trim();
    if (query.length < 3) return [];
    const ck = normalize(query);
    const hit = this.cache.get(ck);
    if (hit) return hit;
    const [lat, lon] = this.center;
    const url = `${this.base}/api/?q=${encodeURIComponent(query)}&limit=10&lat=${lat}&lon=${lon}&bbox=${TM_BBOX.join(',')}`;
    const j = await this.get(url, signal);
    const out = (j.features ?? []).map(photonToPlace).filter((p): p is Place => !!p && inBbox(p.lat, p.lon));
    // fără dubluri de nume+detaliu, cele mai apropiate de centru primele la egalitate
    const seen = new Set<string>();
    const uniq = out.filter((p) => { const k = `${p.name}|${p.detail}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 7);
    this.cache.set(ck, uniq);
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value as string);
    return uniq;
  }

  async reverse(lat: number, lon: number, signal?: AbortSignal): Promise<Place | null> {
    const j = await this.get(`${this.base}/reverse?lat=${lat}&lon=${lon}&limit=1`, signal);
    const p = (j.features ?? []).map(photonToPlace).find(Boolean) ?? null;
    return p && haversine(lat, lon, p.lat, p.lon) < 150 ? { ...p, lat, lon } : null;
  }
}

export const geocoder = new PhotonGeocoder();
