// Starea aplicației: graful, snapshotul, turele locale și stratul de confort derivat (8.6).
import { useSyncExternalStore } from 'react';
import {
  aggregate, diffLayers, toContribution,
  type ComfortLayer, type LayerDiff, type Snapshot, type Thresholds,
} from '../core/aggregate';
import { DEFAULT_CONFIG, type VibrationConfig } from '../core/config';
import { Graph, type GraphJson } from '../core/graph';
import { ImportError } from '../core/io';
import { matchProcessed } from '../core/process';
import {
  DEFAULT_ROUTE_OPTIONS, PROFILES, Router, mainComponent, routeStats,
  type ProfileKey, type RouteOptions, type RouteResult, type RouteStats,
} from '../core/route';
import type { DeclaredSurface, ProcessedRide } from '../core/types';
import * as idb from '../storage/idb';
import { processInWorker } from '../worker/client';

export interface Settings {
  cfg: VibrationConfig;
  fixedThresholds: Thresholds | null;
  developer: boolean;
  route: RouteOptions;
  profile: ProfileKey;
  showReview: boolean;
  showZones: boolean;
}

export interface ImportReport {
  ride_id: string;
  diff: LayerDiff;
  layer_version_before: number;
  layer_version_after: number;
  route: { status: 'none' | 'same' | 'changed'; text: string } ;
}

export interface RoutePair {
  shortest: { r: RouteResult; s: RouteStats } | null;
  chosen: { r: RouteResult; s: RouteStats } | null;
  layerVersion: number;
  error?: string;
}

export interface AppState {
  graph: Graph | null;
  graphStatus: 'loading' | 'ready' | 'missing' | 'error';
  snapshot: Snapshot | null;
  snapshotStatus: 'loading' | 'ready' | 'missing';
  rides: idb.StoredRide[];
  layer: ComfortLayer;
  lastImport: ImportReport | null;
  ab: { a: [number, number] | null; b: [number, number] | null };
  settings: Settings;
  rejected: string[];
  ready: boolean;
  evalResults: unknown | null;
}

const BASE = import.meta.env.BASE_URL;

const defaultSettings: Settings = {
  cfg: DEFAULT_CONFIG,
  fixedThresholds: null,
  developer: false,
  route: DEFAULT_ROUTE_OPTIONS,
  profile: 'balanced',
  showReview: false,
  showZones: true,
};

let state: AppState = {
  graph: null,
  graphStatus: 'loading',
  snapshot: null,
  snapshotStatus: 'loading',
  rides: [],
  layer: aggregate({ rides: [], version: 0 }),
  lastImport: null,
  ab: { a: null, b: null },
  settings: defaultSettings,
  rejected: [],
  ready: false,
  evalResults: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function getState() { return state; }
export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sel(state));
}

let router: Router | null = null;
const compCache = new Map<boolean, Uint8Array>();
export function getRouter() {
  if (!router && state.graph) router = new Router(state.graph);
  return router;
}

function buildLayer(rides: idb.StoredRide[], version: number, s: AppState = state): ComfortLayer {
  const g = s.graph;
  return aggregate({
    snapshot: s.snapshot,
    rides: rides.map((r) => toContribution(r.processed, r.included)),
    cfg: s.settings.cfg,
    surfaceKindOf: g ? (e) => g.kind[e] ?? null : undefined,
    rejected: new Set(s.rejected),
    fixedThresholds: s.settings.fixedThresholds,
    version,
  });
}

function recompute(rides = state.rides) {
  const layer = buildLayer(rides, state.layer.version + 1);
  set({ rides, layer });
  return layer;
}

export const lengthOf = (e: number) => state.graph?.length[e] ?? 0;

// ---------------- inițializare ----------------
export async function init() {
  const saved = await idb.kvGet<Partial<Settings>>('settings');
  const rejected = (await idb.kvGet<string[]>('rejected')) ?? [];
  const ab = (await idb.kvGet<AppState['ab']>('ab')) ?? { a: null, b: null };
  const settings: Settings = { ...defaultSettings, ...(saved ?? {}), cfg: { ...DEFAULT_CONFIG, ...(saved?.cfg ?? {}) }, route: { ...DEFAULT_ROUTE_OPTIONS, ...(saved?.route ?? {}) } };
  const rides = (await idb.listRides()).map((r) => ({ ...r, file: null }));
  set({ settings, rejected, ab, rides });
  recompute(rides);
  set({ ready: true });

  const okJson = (r: Response) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null);
  const snapP = fetch(`${BASE}data/comfort-layer.json`, { cache: 'no-cache' })
    .then(okJson)
    .then((snap: Snapshot | null) => {
      set({ snapshot: snap && Array.isArray(snap.edges) ? snap : null, snapshotStatus: snap ? 'ready' : 'missing' });
    })
    .catch(() => set({ snapshotStatus: 'missing' }));
  fetch(`${BASE}data/eval-latest.json`, { cache: 'no-cache' }).then(okJson).then((e) => set({ evalResults: e })).catch(() => {});
  const graphP = fetch(`${BASE}data/graph-timisoara.json`)
    .then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) { set({ graphStatus: 'missing' }); return; }
      const j = (await r.json()) as GraphJson;
      set({ graph: new Graph(j), graphStatus: 'ready' });
      router = null;
      compCache.clear();
    })
    .catch((e) => { console.warn(e); set({ graphStatus: 'error' }); });
  await Promise.all([snapP, graphP]);
  // turele procesate fără graf se potrivesc acum pe hartă
  if (state.graph) {
    let changed = false;
    for (const r of state.rides)
      if (!r.processed.match.graph_available) {
        matchProcessed(r.processed, state.graph, state.settings.cfg);
        const full = await idb.getRide(r.ride_id);
        if (full) await idb.putRide({ ...full, processed: r.processed });
        changed = true;
      }
    if (changed) recompute([...state.rides]);
  }
  recompute();
}

// ---------------- rutare ----------------
export function snapNode(lat: number, lon: number): number {
  const g = state.graph;
  if (!g) return -1;
  const allow = state.settings.route.allowSidewalks;
  let comp = compCache.get(allow);
  if (!comp) { comp = mainComponent(g, allow); compCache.set(allow, comp); }
  return g.nearestNode(lat, lon, (n) => comp![n] === 1, 600);
}

export function computeRoutes(layer: ComfortLayer = state.layer, profile: ProfileKey = state.settings.profile): RoutePair {
  const g = state.graph;
  const { a, b } = state.ab;
  if (!g || !a || !b) return { shortest: null, chosen: null, layerVersion: layer.version };
  const rt = getRouter()!;
  const src = snapNode(a[0], a[1]), dst = snapNode(b[0], b[1]);
  if (src < 0 || dst < 0) return { shortest: null, chosen: null, layerVersion: layer.version, error: 'Punctul ales e prea departe de rețeaua rutabilă.' };
  const base = state.settings.route;
  const oS = { ...base, w_c: 0 };
  const oC = { ...base, w_c: PROFILES[profile] };
  const rs = rt.route(src, dst, layer, oS);
  const rc = rt.route(src, dst, layer, oC);
  if (!rs.found) return { shortest: null, chosen: null, layerVersion: layer.version, error: 'Nu există rută între A și B în graful rutabil (sens unic, trotuare excluse?).' };
  return {
    shortest: { r: rs, s: routeStats(g, layer, rs, oC) },
    chosen: rc.found ? { r: rc, s: routeStats(g, layer, rc, oC) } : null,
    layerVersion: layer.version,
  };
}

export async function setAB(ab: AppState['ab']) {
  set({ ab });
  await idb.kvSet('ab', ab).catch(() => {});
}

// ---------------- setări ----------------
export async function updateSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch };
  set({ settings });
  if (patch.route && patch.route.allowSidewalks !== undefined) compCache.clear();
  if (patch.cfg || patch.fixedThresholds !== undefined) recompute();
  await idb.kvSet('settings', settings).catch(() => {});
}

// ---------------- import / ștergere (8.6) ----------------
function sameRoute(x: RouteResult | undefined, y: RouteResult | undefined) {
  if (!x || !y) return x === y;
  return x.edges.length === y.edges.length && x.edges.every((e, i) => e.edge === y.edges[i].edge);
}

function routeChangeText(before: RoutePair, after: RoutePair, diff: LayerDiff): ImportReport['route'] {
  if (!state.ab.a || !state.ab.b || !after.chosen) return { status: 'none', text: 'Nu e aleasă o pereche A–B pe ecranul Rută.' };
  if (!sameRoute(before.chosen?.r, after.chosen.r)) return { status: 'changed', text: 'Ruta recomandată între A și B s-a schimbat după import.' };
  const onRoutes = new Set([...(before.chosen?.r.edges ?? []), ...after.chosen.r.edges, ...(after.shortest?.r.edges ?? [])].map((e) => e.edge));
  const touchedOnRoute = diff.touched_edges.some((e) => onRoutes.has(e));
  return {
    status: 'same',
    text: touchedOnRoute
      ? 'Ruta recomandată a rămas aceeași: segmentele atinse sunt pe rută, dar diferența de cost nu schimbă alegerea.'
      : 'Ruta recomandată a rămas aceeași: segmentele noi nu sunt pe rutele dintre A și B.',
  };
}

export class DuplicateRideError extends ImportError {}

export async function importFile(file: File, declared: DeclaredSurface, onProgress?: (stage: string, frac: number) => void): Promise<{ ride: ProcessedRide; report: ImportReport }> {
  const bytes = await file.arrayBuffer();
  return importBytes(file.name, bytes, declared, onProgress);
}

export async function importBytes(name: string, bytes: ArrayBuffer, declared: DeclaredSurface, onProgress?: (stage: string, frac: number) => void) {
  const p = await processInWorker(name, bytes, state.settings.cfg, declared, onProgress);
  if (state.rides.some((r) => r.ride_id === p.ride_id)) throw new DuplicateRideError('Tura a fost deja importată pe acest dispozitiv; trecerile nu se numără de două ori.');
  if (state.snapshot?.meta.ride_ids.includes(p.ride_id)) throw new DuplicateRideError('Tura face deja parte din stratul publicat (snapshot); nu se importă din nou.');
  if (state.graph) { onProgress?.('potrivire pe hartă', 0.92); matchProcessed(p, state.graph, state.settings.cfg, declared); }
  const before = state.layer;
  const routeBefore = computeRoutes(before);
  const stored: idb.StoredRide = { ride_id: p.ride_id, processed: p, file_name: name, file: bytes, included: true, imported_at: Date.now() };
  await idb.putRide(stored);
  const after = recompute([...state.rides, { ...stored, file: null }]);
  const diff = diffLayers(before, after, lengthOf);
  const routeAfter = computeRoutes(after);
  const report: ImportReport = { ride_id: p.ride_id, diff, layer_version_before: before.version, layer_version_after: after.version, route: routeChangeText(routeBefore, routeAfter, diff) };
  set({ lastImport: report });
  onProgress?.('gata', 1);
  return { ride: p, report };
}

export async function removeRide(id: string) {
  await idb.deleteRide(id);
  recompute(state.rides.filter((r) => r.ride_id !== id));
}

export async function setIncluded(id: string, included: boolean) {
  const full = await idb.getRide(id);
  if (full) await idb.putRide({ ...full, included });
  recompute(state.rides.map((r) => (r.ride_id === id ? { ...r, included } : r)));
}

export async function setRideFields(id: string, patch: Partial<Pick<idb.StoredRide, 'perceived'>> & { label?: string }) {
  const full = await idb.getRide(id);
  if (!full) return;
  const processed = patch.label !== undefined ? { ...full.processed, meta: { ...full.processed.meta, label: patch.label } } : full.processed;
  const upd = { ...full, ...('perceived' in patch ? { perceived: patch.perceived } : {}), processed };
  await idb.putRide(upd);
  set({ rides: state.rides.map((r) => (r.ride_id === id ? { ...upd, file: null } : r)) });
}

export async function setDeclaredSurface(id: string, declared: DeclaredSurface) {
  const full = await idb.getRide(id);
  if (!full) return;
  if (state.graph) matchProcessed(full.processed, state.graph, state.settings.cfg, declared);
  else full.processed.meta.declared_surface = declared;
  await idb.putRide(full);
  recompute(state.rides.map((r) => (r.ride_id === id ? { ...full, file: null } : r)));
}

/** Reprocesare cu configurația curentă, din fișierul original */
export async function reprocessRide(id: string, onProgress?: (s: string, f: number) => void) {
  const full = await idb.getRide(id);
  if (!full?.file) throw new Error('Fișierul original nu e disponibil pentru reprocesare.');
  const p = await processInWorker(full.file_name, full.file, state.settings.cfg, full.processed.meta.declared_surface ?? null, onProgress);
  if (state.graph) matchProcessed(p, state.graph, state.settings.cfg);
  p.meta.label = full.processed.meta.label;
  const upd = { ...full, processed: p };
  await idb.putRide(upd);
  recompute(state.rides.map((r) => (r.ride_id === id ? { ...upd, file: null } : r)));
}

export async function getRideFile(id: string) {
  return (await idb.getRide(id))?.file ?? null;
}

export async function rejectZone(memberIds: string[], reject: boolean) {
  const s = new Set(state.rejected);
  memberIds.forEach((m) => (reject ? s.add(m) : s.delete(m)));
  const rejected = [...s];
  set({ rejected });
  await idb.kvSet('rejected', rejected).catch(() => {});
  recompute();
}

export async function wipeAll() {
  await idb.clearAll();
  set({ rides: [], rejected: [], lastImport: null, ab: { a: null, b: null }, settings: defaultSettings });
  recompute([]);
}
