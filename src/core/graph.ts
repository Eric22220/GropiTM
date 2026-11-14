// Graful străzilor (7.4) și indexul spațial pe grilă.
import { TM_PROJ, axialDiff, bearingXY, decodePolyline, pointSegment } from './geo';
import type { SurfaceKind } from './types';

/** [id, from, to, length_m, geometry(polyline5), highway, surface, smoothness, bike_infra, oneway_bike, osm_way_id, surface_kind, bicycle, name] */
export type EdgeTuple = [number, number, number, number, string, string, string, string, string, number, number, SurfaceKind, string, string];

export interface GraphJson {
  meta: {
    source: string;
    attribution: string;
    license: string;
    downloaded_at: string;
    generated_at: string;
    area: string;
    stats?: Record<string, number>;
    format: string;
  };
  nodes: [number, number, number][];
  edges: EdgeTuple[];
}

export interface Candidate {
  edge: number;
  dist: number;
  bearing: number; // azimutul segmentului celui mai apropiat
}

export class Graph {
  readonly nNodes: number;
  readonly nEdges: number;
  readonly nodeLat: Float64Array;
  readonly nodeLon: Float64Array;
  readonly from: Int32Array;
  readonly to: Int32Array;
  readonly length: Float64Array;
  readonly highway: string[];
  readonly surface: string[];
  readonly smoothness: string[];
  readonly bikeInfra: string[];
  readonly oneway: Int8Array;
  readonly osmWay: number[];
  readonly kind: SurfaceKind[];
  readonly bicycle: string[];
  readonly name: string[];
  readonly geomRaw: string[];
  private geomCache: ([number, number][] | undefined)[];
  /** muchiile incidente fiecărui nod (CSR) */
  readonly adjStart: Int32Array;
  readonly adjEdges: Int32Array;
  private grid: Map<number, number[]> | null = null; // cheie celulă → [edge, seg, edge, seg, ...]
  private xy: Float32Array[] | null = null;
  readonly cell = 60;

  constructor(readonly json: GraphJson) {
    const N = json.nodes.length, E = json.edges.length;
    this.nNodes = N;
    this.nEdges = E;
    this.nodeLat = new Float64Array(N);
    this.nodeLon = new Float64Array(N);
    for (const [id, lat, lon] of json.nodes) { this.nodeLat[id] = lat; this.nodeLon[id] = lon; }
    this.from = new Int32Array(E);
    this.to = new Int32Array(E);
    this.length = new Float64Array(E);
    this.oneway = new Int8Array(E);
    this.highway = new Array(E); this.surface = new Array(E); this.smoothness = new Array(E);
    this.bikeInfra = new Array(E); this.osmWay = new Array(E); this.kind = new Array(E);
    this.bicycle = new Array(E); this.name = new Array(E); this.geomRaw = new Array(E);
    this.geomCache = new Array(E);
    const deg = new Int32Array(N + 1);
    for (const e of json.edges) {
      const [id, f, t, len, geom, hw, surf, smooth, infra, ow, way, kind, bic, name] = e;
      this.from[id] = f; this.to[id] = t; this.length[id] = len; this.geomRaw[id] = geom;
      this.highway[id] = hw; this.surface[id] = surf; this.smoothness[id] = smooth; this.bikeInfra[id] = infra;
      this.oneway[id] = ow; this.osmWay[id] = way; this.kind[id] = kind; this.bicycle[id] = bic; this.name[id] = name;
      deg[f + 1]++;
      if (t !== f) deg[t + 1]++;
    }
    for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
    this.adjStart = deg;
    this.adjEdges = new Int32Array(deg[N]);
    const fill = deg.slice(0, N);
    for (let id = 0; id < E; id++) {
      this.adjEdges[fill[this.from[id]]++] = id;
      if (this.to[id] !== this.from[id]) this.adjEdges[fill[this.to[id]]++] = id;
    }
  }

  geometry(e: number): [number, number][] {
    let g = this.geomCache[e];
    if (!g) { g = decodePolyline(this.geomRaw[e]); this.geomCache[e] = g; }
    return g;
  }

  edgesAt(node: number): Int32Array {
    return this.adjEdges.subarray(this.adjStart[node], this.adjStart[node + 1]);
  }

  /** muchii care împart un nod */
  adjacent(a: number, b: number): boolean {
    if (a === b) return true;
    const fa = this.from[a], ta = this.to[a], fb = this.from[b], tb = this.to[b];
    return fa === fb || fa === tb || ta === fb || ta === tb;
  }

  /** vecinătate la cel mult `hops` muchii distanță */
  near(a: number, b: number, hops = 2): boolean {
    if (this.adjacent(a, b)) return true;
    if (hops < 2) return false;
    for (const n of [this.from[a], this.to[a]]) for (const e of this.edgesAt(n)) if (this.adjacent(e, b)) return true;
    return false;
  }

  private buildIndex() {
    const grid = new Map<number, number[]>();
    const xy: Float32Array[] = new Array(this.nEdges);
    const c = this.cell;
    for (let e = 0; e < this.nEdges; e++) {
      const g = this.geometry(e);
      const a = new Float32Array(g.length * 2);
      g.forEach(([lat, lon], i) => { a[2 * i] = TM_PROJ.x(lon); a[2 * i + 1] = TM_PROJ.y(lat); });
      xy[e] = a;
      for (let s = 0; s + 1 < g.length; s++) {
        const x0 = a[2 * s], y0 = a[2 * s + 1], x1 = a[2 * s + 2], y1 = a[2 * s + 3];
        const cx0 = Math.floor(Math.min(x0, x1) / c), cx1 = Math.floor(Math.max(x0, x1) / c);
        const cy0 = Math.floor(Math.min(y0, y1) / c), cy1 = Math.floor(Math.max(y0, y1) / c);
        for (let cx = cx0; cx <= cx1; cx++)
          for (let cy = cy0; cy <= cy1; cy++) {
            const k = cx * 100003 + cy;
            let arr = grid.get(k);
            if (!arr) { arr = []; grid.set(k, arr); }
            arr.push(e, s);
          }
      }
    }
    this.grid = grid;
    this.xy = xy;
  }

  /** muchiile la cel mult r metri de (lat, lon), cu distanța minimă pe muchie */
  query(lat: number, lon: number, r: number, filter?: (e: number) => boolean): Candidate[] {
    if (!this.grid) this.buildIndex();
    const px = TM_PROJ.x(lon), py = TM_PROJ.y(lat);
    const c = this.cell;
    const best = new Map<number, Candidate>();
    for (let cx = Math.floor((px - r) / c); cx <= Math.floor((px + r) / c); cx++)
      for (let cy = Math.floor((py - r) / c); cy <= Math.floor((py + r) / c); cy++) {
        const arr = this.grid!.get(cx * 100003 + cy);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 2) {
          const e = arr[k], s = arr[k + 1];
          if (filter && !filter(e)) continue;
          const a = this.xy![e];
          const [d] = pointSegment(px, py, a[2 * s], a[2 * s + 1], a[2 * s + 2], a[2 * s + 3]);
          if (d > r) continue;
          const prev = best.get(e);
          if (!prev || d < prev.dist) best.set(e, { edge: e, dist: d, bearing: bearingXY(a[2 * s + 2] - a[2 * s], a[2 * s + 3] - a[2 * s + 1]) });
        }
      }
    return [...best.values()].sort((a, b) => a.dist - b.dist);
  }

  /** cel mai apropiat nod dintre cele acceptate */
  nearestNode(lat: number, lon: number, accept: (node: number) => boolean, maxR = 400): number {
    for (const r of [30, 80, 160, maxR]) {
      const cands = this.query(lat, lon, r);
      let best = -1, bd = Infinity;
      for (const c of cands)
        for (const nd of [this.from[c.edge], this.to[c.edge]]) {
          if (!accept(nd)) continue;
          const dx = TM_PROJ.x(this.nodeLon[nd]) - TM_PROJ.x(lon), dy = TM_PROJ.y(this.nodeLat[nd]) - TM_PROJ.y(lat);
          const d = Math.hypot(dx, dy);
          if (d < bd) { bd = d; best = nd; }
        }
      if (best >= 0) return best;
    }
    return -1;
  }
}

export { axialDiff };
