import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { Graph, type GraphJson } from '../src/core/graph';
import { GeocodeError, PhotonGeocoder, buildStreetIndex, nearestStreetName, normalize, photonToPlace, searchStreets } from '../src/services/geocode';
import { makeGraph } from './helpers';

const feat = (name: string, lat: number, lon: number, extra: Record<string, string> = {}) => ({ geometry: { coordinates: [lon, lat] }, properties: { name, city: 'Timișoara', osm_key: 'amenity', osm_type: 'N', osm_id: name, ...extra } });
const ok = (features: unknown[]) => Promise.resolve(new Response(JSON.stringify({ features }), { status: 200, headers: { 'content-type': 'application/json' } }));

describe('normalizarea textului căutat', () => {
  it('fără diacritice, fără „strada/bulevardul”', () => {
    expect(normalize('Bulevardul Revoluției din 1989')).toBe('revolutiei din 1989');
    expect(normalize('Str. Ștefan cel Mare')).toBe('stefan cel mare');
    expect(normalize('Piața Victoriei')).toBe('victoriei');
  });
});

describe('index local de străzi (offline)', () => {
  const g = makeGraph([[45.75, 21.22], [45.751, 21.22], [45.752, 21.22], [45.75, 21.23]], [
    { f: 0, t: 1 }, { f: 1, t: 2 }, { f: 0, t: 3 },
  ]);
  // numele vin din helpers: e0, e1, e2
  it('găsește după prefix și alege mijlocul celei mai lungi muchii', () => {
    const idx = buildStreetIndex(g);
    expect(idx.length).toBe(3);
    const r = searchStreets(idx, 'e2');
    expect(r[0].name).toBe('e2');
    expect(r[0].source).toBe('local');
    expect(searchStreets(idx, 'x')).toEqual([]);
  });
  it('strada cea mai apropiată de un punct', () => {
    expect(nearestStreetName(g, 45.7505, 21.2201)).toBe('e0');
  });
});

describe.skipIf(!existsSync('public/data/graph-timisoara.json'))('index local pe graful real', () => {
  it('găsește străzi reale din Timișoara, fără diacritice', () => {
    const g = new Graph(JSON.parse(readFileSync('public/data/graph-timisoara.json', 'utf8')) as GraphJson);
    const idx = buildStreetIndex(g);
    expect(idx.length).toBeGreaterThan(500);
    const r = searchStreets(idx, 'revolutiei');
    expect(r.length).toBeGreaterThan(0);
    expect(normalize(r[0].name)).toContain('revolutiei');
  });
});

describe('Photon (mock, fără rețea)', () => {
  it('rezultate în zona Timișoarei, fără cele din afară; cache pentru aceeași interogare', async () => {
    const f = vi.fn(() => ok([feat('Iulius Town', 45.766, 21.227), feat('Departe', 44.43, 26.1), feat('Gara de Nord', 45.75, 21.207, { osm_key: 'railway' })]));
    const geo = new PhotonGeocoder({ fetchFn: f as unknown as typeof fetch });
    const r = await geo.search('iulius');
    expect(r.map((p) => p.name)).toEqual(['Iulius Town', 'Gara de Nord']);
    expect(r[0].detail).toContain('Timișoara');
    await geo.search('Iulius ');
    expect(f).toHaveBeenCalledTimes(1);
    const url = (f.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain('bbox=');
    expect(url).toContain('q=iulius');
  });
  it('sub 3 caractere nu face nicio cerere', async () => {
    const f = vi.fn();
    const geo = new PhotonGeocoder({ fetchFn: f as unknown as typeof fetch });
    expect(await geo.search('iu')).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
  it('erori: HTTP, fără rețea, timeout, anulare', async () => {
    const http = new PhotonGeocoder({ fetchFn: (() => Promise.resolve(new Response('x', { status: 503 }))) as unknown as typeof fetch });
    await expect(http.search('piata')).rejects.toMatchObject({ kind: 'http' });
    const off = new PhotonGeocoder({ fetchFn: (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch });
    await expect(off.search('piata')).rejects.toMatchObject({ kind: 'offline' });
    const hang = (_u: string, o: RequestInit) => new Promise<Response>((_, rej) => o.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    const slow = new PhotonGeocoder({ fetchFn: hang as unknown as typeof fetch, timeoutMs: 30 });
    await expect(slow.search('piata')).rejects.toMatchObject({ kind: 'timeout' });
    const ctl = new AbortController();
    const p = new PhotonGeocoder({ fetchFn: hang as unknown as typeof fetch, timeoutMs: 5000 }).search('piata', ctl.signal);
    ctl.abort();
    await expect(p).rejects.toBeInstanceOf(GeocodeError);
    await expect(p).rejects.toMatchObject({ kind: 'aborted' });
  });
  it('conversia unui rezultat cu adresă', () => {
    const p = photonToPlace({ geometry: { coordinates: [21.23, 45.75] }, properties: { street: 'Strada Mărășești', housenumber: '5', city: 'Timișoara', osm_key: 'place' } })!;
    expect(p.name).toBe('Strada Mărășești 5');
    expect(p.kind).toBe('address');
    expect(photonToPlace({ geometry: { coordinates: [NaN, 1] as [number, number] }, properties: {} })).toBeNull();
  });
});
