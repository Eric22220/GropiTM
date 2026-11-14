// Rutarea A→B (8.4): A* cu euristica Haversine și heap binar. Șocurile NU intră în cost.
import type { ComfortClass, ComfortLayer, EdgeStatus } from './aggregate';
import type { Graph } from './graph';
import { haversine } from './geo';

export interface RouteOptions {
  w_c: number;
  p_unknown: number;
  useOsmSurface: boolean;
}

export const PROFILES = { shortest: 0, balanced: 1, courier: 3 } as const;
export type ProfileKey = keyof typeof PROFILES;

export const P_CLASS: Record<ComfortClass, number> = { A: 0, B: 0.15, C: 0.4, D: 0.9, E: 1.6 };

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = { w_c: 1, p_unknown: 0.3, useOsmSurface: false };

/** penalizarea estimată din eticheta OSM (opțiune oprită implicit); null = nicio estimare */
export function osmSurfacePenalty(g: Graph, e: number): number | null {
  const s = g.surface[e], sm = g.smoothness[e];
  let p: number | null = null;
  if (['sett', 'cobblestone', 'unhewn_cobblestone'].includes(s)) p = 1.2;
  else if (s === 'paving_stones') p = 0.5;
  if (['bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'].includes(sm)) p = Math.max(p ?? 0, 1.0);
  return p;
}

/** Valori OSM `bicycle=*` care interzic mersul pe bicicletă pe acea cale (inclusiv „use_sidepath”:
 * pe carosabil e obligatorie pista alăturată, cartografiată separat). */
export const BIKE_FORBIDDEN = new Set(['no', 'dismount', 'use_sidepath', 'private']);

/** De ce nu se poate merge pe bicicletă pe muchie (null = permis). Mersul pe jos cu bicicleta de mână
 * NU e un mod de rutare: trotuarele obișnuite nu sunt folosite niciodată. */
export function bikeBlockReason(g: Graph, e: number): string | null {
  const hw = g.highway[e], b = g.bicycle[e], k = g.kind[e];
  if (hw === 'steps') return 'trepte';
  if (BIKE_FORBIDDEN.has(b)) return `bicycle=${b}`;
  if (k === 'pista') return null;
  if (k === 'trotuar') return b === 'yes' || b === 'designated' ? null : 'trotuar fără drept pentru biciclete';
  if (k === 'alee') return b === 'yes' || b === 'designated' || b === 'permissive' ? null : `${hw} fără drept pentru biciclete`;
  return null;
}

export function routable(g: Graph, e: number): boolean {
  return bikeBlockReason(g, e) === null;
}

export type EdgeCategory = 'measured' | 'low' | 'osm' | 'unknown';

export function penaltyOf(g: Graph, layer: ComfortLayer | null, e: number, o: RouteOptions): { p: number; cat: EdgeCategory; cls: ComfortClass | null; status: EdgeStatus } {
  const a = layer?.edges.get(e);
  if (a && a.status !== 'UNKNOWN' && a.class) {
    const base = P_CLASS[a.class];
    return a.status === 'MEASURED' ? { p: base, cat: 'measured', cls: a.class, status: a.status } : { p: base / 2, cat: 'low', cls: a.class, status: a.status };
  }
  if (o.useOsmSurface) {
    const osm = osmSurfacePenalty(g, e);
    if (osm !== null) return { p: osm, cat: 'osm', cls: null, status: 'UNKNOWN' };
  }
  return { p: o.p_unknown, cat: 'unknown', cls: null, status: 'UNKNOWN' };
}

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop(): [number, number] {
    const k = this.k, v = this.v;
    const topK = k[0], topV = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lk;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; mk = k[r]; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return [topK, topV];
  }
}

export interface RouteResult {
  found: boolean;
  nodes: number[];
  edges: { edge: number; forward: boolean }[];
  cost: number;
  length: number;
}

/** Costurile pe muchii, indexate după versiunea stratului: o versiune nouă invalidează cache-ul. */
export class Router {
  private cache = new Map<string, Float64Array>();
  constructor(readonly g: Graph) {}

  costs(layer: ComfortLayer | null, o: RouteOptions): Float64Array {
    const key = `${layer?.version ?? -1}|${o.w_c}|${o.p_unknown}|${o.useOsmSurface}`;
    let c = this.cache.get(key);
    if (c) return c;
    if (this.cache.size > 12) this.cache.clear();
    c = new Float64Array(this.g.nEdges);
    for (let e = 0; e < this.g.nEdges; e++) {
      if (!routable(this.g, e)) { c[e] = Infinity; continue; }
      c[e] = this.g.length[e] * (1 + o.w_c * penaltyOf(this.g, layer, e, o).p);
    }
    this.cache.set(key, c);
    return c;
  }

  cachedVersions(): string[] { return [...this.cache.keys()]; }

  route(src: number, dst: number, layer: ComfortLayer | null, o: RouteOptions, useHeuristic = true): RouteResult {
    const g = this.g;
    const cost = this.costs(layer, o);
    const N = g.nNodes;
    const dist = new Float64Array(N).fill(Infinity);
    const prevEdge = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const tl = g.nodeLat[dst], tn = g.nodeLon[dst];
    const h = (n: number) => (useHeuristic ? haversine(g.nodeLat[n], g.nodeLon[n], tl, tn) * 0.999 : 0);
    dist[src] = 0;
    const heap = new Heap();
    heap.push(h(src), src);
    while (heap.size) {
      const [, u] = heap.pop();
      if (closed[u]) continue;
      closed[u] = 1;
      if (u === dst) break;
      for (const e of g.edgesAt(u)) {
        const ce = cost[e];
        if (!Number.isFinite(ce)) continue;
        const f = g.from[e], t = g.to[e];
        let v: number;
        if (f === u) { if (g.oneway[e] === -1) continue; v = t; }
        else { if (g.oneway[e] === 1) continue; v = f; }
        if (f === t) continue;
        const nd = dist[u] + ce;
        if (nd < dist[v]) {
          dist[v] = nd;
          prevEdge[v] = e;
          heap.push(nd + h(v), v);
        }
      }
    }
    if (!Number.isFinite(dist[dst])) return { found: false, nodes: [], edges: [], cost: Infinity, length: 0 };
    const nodes = [dst];
    const edges: { edge: number; forward: boolean }[] = [];
    let cur = dst, len = 0;
    while (cur !== src) {
      const e = prevEdge[cur];
      const forward = g.to[e] === cur;
      const prev = forward ? g.from[e] : g.to[e];
      edges.push({ edge: e, forward });
      len += g.length[e];
      nodes.push(prev);
      cur = prev;
    }
    nodes.reverse();
    edges.reverse();
    return { found: true, nodes, edges, cost: dist[dst], length: len };
  }
}

export interface RouteStats {
  length: number;
  minutes: number; // la 15 km/h
  byClass: Record<'measured' | 'low', Record<ComfortClass, number>>;
  osm_m: number;
  unknown_m: number;
  measured_m: number; // MEASURED + LOW_CONFIDENCE
  measured_pct: number;
  unknown_pct: number;
  insufficient: boolean; // < 50% din lungime măsurat (necunoscut + estimat OSM > 50%)
  comfort_sum: number; // Σ length × P_confort
  de_measured_m: number; // metri măsurați în D–E
}

export function routeStats(g: Graph, layer: ComfortLayer | null, r: RouteResult, o: RouteOptions): RouteStats {
  const zero = () => ({ A: 0, B: 0, C: 0, D: 0, E: 0 });
  const byClass = { measured: zero(), low: zero() };
  let osm = 0, unknown = 0, comfort = 0, de = 0, measured = 0;
  for (const { edge } of r.edges) {
    const L = g.length[edge];
    const p = penaltyOf(g, layer, edge, o);
    comfort += L * p.p;
    if ((p.cat === 'measured' || p.cat === 'low') && p.cls) {
      byClass[p.cat][p.cls] += L;
      measured += L;
      if (p.cls === 'D' || p.cls === 'E') de += L;
    } else if (p.cat === 'osm') osm += L;
    else unknown += L;
  }
  // însumat direct (nu prin scădere): „lungime − necunoscut” lăsa reziduuri de virgulă mobilă (~1e-13 m)
  // care făceau o rută nemăsurată să pară „măsurată 0%”
  return {
    length: r.length,
    minutes: r.length / (15000 / 60),
    byClass,
    osm_m: osm,
    unknown_m: unknown,
    measured_m: measured,
    measured_pct: r.length ? (100 * measured) / r.length : 0,
    unknown_pct: r.length ? (100 * unknown) / r.length : 0,
    insufficient: r.length > 0 && measured / r.length < 0.5,
    comfort_sum: comfort,
    de_measured_m: de,
  };
}

/** Componenta conexă principală (neorientată), pentru a lipi A și B doar de noduri rutabile. */
export function mainComponent(g: Graph): Uint8Array {
  const comp = new Int32Array(g.nNodes).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < g.nNodes; s++) {
    if (comp[s] >= 0 || g.edgesAt(s).length === 0) continue;
    const c = sizes.length;
    let size = 0;
    comp[s] = c;
    stack.push(s);
    while (stack.length) {
      const u = stack.pop()!;
      size++;
      for (const e of g.edgesAt(u)) {
        if (!routable(g, e)) continue;
        const v = g.from[e] === u ? g.to[e] : g.from[e];
        if (comp[v] < 0) { comp[v] = c; stack.push(v); }
      }
    }
    sizes.push(size);
  }
  let best = 0;
  sizes.forEach((s, i) => { if (s > sizes[best]) best = i; });
  const out = new Uint8Array(g.nNodes);
  for (let i = 0; i < g.nNodes; i++) out[i] = comp[i] === best ? 1 : 0;
  return out;
}
