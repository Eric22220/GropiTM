// npm run build-graph [-- --offline]
// O singură interogare Overpass pentru municipiul Timișoara (relația administrativă). Răspunsul brut se
// salvează comprimat în data/raw/ și se comite; cu --offline se reconstruiește graful doar din el.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { encodePolyline, haversine } from '../src/core/geo';
import type { EdgeTuple, GraphJson } from '../src/core/graph';
import type { SurfaceKind } from '../src/core/types';

const RAW = 'data/raw/overpass-timisoara.json.gz';
const OUT = 'public/data/graph-timisoara.json';
const UA = 'ShockGrid-UniHack2026/0.1 (cycling comfort map, open source)';
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const HIGHWAYS = ['cycleway', 'residential', 'living_street', 'unclassified', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link', 'service', 'track', 'path', 'pedestrian', 'footway', 'steps', 'bridleway'];

async function overpass(query: string): Promise<any> {
  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      console.log(`Overpass: ${url}`);
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.warn(`  eșec: ${(e as Error).message}`);
    }
  }
  throw lastErr;
}

async function download(): Promise<any> {
  // relația administrativă a municipiului (nu un dreptunghi)
  const rels = await overpass('[out:json][timeout:60];rel["boundary"="administrative"]["name"="Timișoara"];out tags;');
  const cands = (rels.elements as any[]).filter((r) => r.tags?.admin_level && Number(r.tags.admin_level) >= 4 && Number(r.tags.admin_level) <= 8);
  if (!cands.length) throw new Error('Relația administrativă Timișoara nu a fost găsită.');
  cands.sort((a, b) => (a.tags.place === 'city' ? -1 : 0) - (b.tags.place === 'city' ? -1 : 0) || Number(a.tags.admin_level) - Number(b.tags.admin_level));
  const rel = cands[0];
  console.log(`Relația: ${rel.id} (admin_level=${rel.tags.admin_level}, ${rel.tags.name})`);
  const areaId = 3600000000 + rel.id;
  const q = `[out:json][timeout:300];
area(${areaId})->.tm;
way(area.tm)["highway"~"^(${HIGHWAYS.join('|')})$"]["area"!="yes"];
out body;
>;
out skel qt;`;
  const data = await overpass(q);
  data.shockgrid = { relation_id: rel.id, admin_level: rel.tags.admin_level, downloaded_at: new Date().toISOString(), query: q };
  return data;
}

function surfaceKind(t: Record<string, string>): SurfaceKind {
  const hw = t.highway;
  const bic = t.bicycle;
  if (hw === 'cycleway') return 'pista';
  if ((hw === 'footway' || hw === 'path') && bic === 'designated') return 'pista';
  if (hw === 'footway') return t.footway === 'sidewalk' || bic !== 'yes' ? 'trotuar' : 'alee';
  if (hw === 'path' || hw === 'pedestrian' || hw === 'track' || hw === 'steps' || hw === 'bridleway') return 'alee';
  return 'carosabil';
}

function bikeInfra(t: Record<string, string>): string {
  if (t.highway === 'cycleway') return 'separated';
  const keys = ['cycleway', 'cycleway:both', 'cycleway:left', 'cycleway:right'];
  const vals = keys.map((k) => t[k]).filter(Boolean);
  if (vals.some((v) => v === 'track' || v === 'separate')) return 'separated';
  if (vals.some((v) => v === 'lane' || v === 'shared_lane' || v === 'share_busway')) return 'lane';
  return 'shared';
}

function onewayBike(t: Record<string, string>): number {
  if (t['oneway:bicycle'] === 'no') return 0;
  if (Object.entries(t).some(([k, v]) => k.startsWith('cycleway') && v.startsWith('opposite'))) return 0;
  const ow = t.oneway;
  if (ow === 'yes' || ow === '1' || ow === 'true') return 1;
  if (ow === '-1' || ow === 'reverse') return -1;
  if (t.junction === 'roundabout' && ow !== 'no') return 1;
  return 0;
}

function build(data: any): GraphJson {
  const nodes = new Map<number, [number, number]>();
  const ways: any[] = [];
  for (const el of data.elements) {
    if (el.type === 'node') nodes.set(el.id, [el.lat, el.lon]);
    else if (el.type === 'way') ways.push(el);
  }
  const usable = ways.filter((w) => {
    const t = w.tags ?? {};
    if (['motorway', 'trunk', 'motorway_link', 'trunk_link'].includes(t.highway)) return false;
    if (t.access === 'private' || t.access === 'no') return false;
    if (t.bicycle === 'no' && t.highway !== 'footway') return false;
    return w.nodes?.length >= 2;
  });
  // noduri la intersecții și capete
  const use = new Map<number, number>();
  for (const w of usable) w.nodes.forEach((n: number, i: number) => use.set(n, (use.get(n) ?? 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)));
  const nodeIdx = new Map<number, number>();
  const outNodes: [number, number, number][] = [];
  const idxOf = (osmId: number) => {
    let i = nodeIdx.get(osmId);
    if (i === undefined) {
      i = outNodes.length;
      nodeIdx.set(osmId, i);
      const [lat, lon] = nodes.get(osmId)!;
      outNodes.push([i, Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6]);
    }
    return i;
  };
  const edges: EdgeTuple[] = [];
  let sidewalkM = 0, totalM = 0, cyclewayM = 0;
  for (const w of usable) {
    const t = w.tags ?? {};
    const ids: number[] = w.nodes.filter((n: number) => nodes.has(n));
    if (ids.length < 2) continue;
    let start = 0;
    for (let i = 1; i < ids.length; i++) {
      if (i === ids.length - 1 || (use.get(ids[i]) ?? 0) >= 2) {
        const seg = ids.slice(start, i + 1);
        const coords = seg.map((n) => nodes.get(n)!) as [number, number][];
        let len = 0;
        for (let k = 1; k < coords.length; k++) len += haversine(coords[k - 1][0], coords[k - 1][1], coords[k][0], coords[k][1]);
        if (len > 0.05) {
          const kind = surfaceKind(t);
          edges.push([
            edges.length, idxOf(seg[0]), idxOf(seg[seg.length - 1]), Math.round(len * 10) / 10, encodePolyline(coords),
            t.highway ?? '', t.surface ?? '', t.smoothness ?? '', bikeInfra(t), onewayBike(t), w.id, kind, t.bicycle ?? '', t.name ?? '',
          ]);
          totalM += len;
          if (t.footway === 'sidewalk') sidewalkM += len;
          if (t.highway === 'cycleway') cyclewayM += len;
        }
        start = i;
      }
    }
  }
  // conexitate (componenta principală, neorientat)
  const adj = new Map<number, number[]>();
  for (const e of edges) {
    (adj.get(e[1]) ?? adj.set(e[1], []).get(e[1])!).push(e[2]);
    (adj.get(e[2]) ?? adj.set(e[2], []).get(e[2])!).push(e[1]);
  }
  const seen = new Set<number>();
  const sizes: number[] = [];
  for (const s of adj.keys()) {
    if (seen.has(s)) continue;
    let size = 0;
    const st = [s];
    seen.add(s);
    while (st.length) {
      const u = st.pop()!;
      size++;
      for (const v of adj.get(u)!) if (!seen.has(v)) { seen.add(v); st.push(v); }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  const meta = data.shockgrid ?? {};
  return {
    meta: {
      source: 'OpenStreetMap via Overpass API',
      attribution: '© OpenStreetMap contributors',
      license: 'ODbL-1.0',
      downloaded_at: meta.downloaded_at ?? data.osm3s?.timestamp_osm_base ?? 'necunoscut',
      generated_at: new Date().toISOString(),
      area: `Municipiul Timișoara (relația OSM ${meta.relation_id ?? '?'})`,
      format: 'edges: [id, from, to, length_m, geometry(polyline5), highway, surface, smoothness, bike_infra, oneway_bike, osm_way_id, surface_kind, bicycle, name]',
      stats: {
        nodes: outNodes.length,
        edges: edges.length,
        km_total: Math.round(totalM / 100) / 10,
        km_sidewalk_separate: Math.round(sidewalkM / 100) / 10,
        km_cycleway: Math.round(cyclewayM / 100) / 10,
        components: sizes.length,
        main_component_nodes: sizes[0] ?? 0,
        main_component_pct: sizes.length ? Math.round((1000 * sizes[0]) / outNodes.length) / 10 : 0,
      },
    },
    nodes: outNodes,
    edges,
  };
}

async function main() {
  const offline = process.argv.includes('--offline');
  let data: any;
  if (offline || (existsSync(RAW) && !process.argv.includes('--refresh'))) {
    console.log(`Folosesc răspunsul brut comis: ${RAW}`);
    data = JSON.parse(gunzipSync(readFileSync(RAW)).toString('utf8'));
  } else {
    data = await download();
    mkdirSync('data/raw', { recursive: true });
    writeFileSync(RAW, gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 }));
    console.log(`Răspuns brut salvat: ${RAW}`);
  }
  const g = build(data);
  mkdirSync('public/data', { recursive: true });
  writeFileSync(OUT, JSON.stringify(g));
  console.log(`Graf scris: ${OUT}`);
  console.log(JSON.stringify(g.meta.stats, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
