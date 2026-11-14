import L from 'leaflet';
import type { ComfortLayer, EdgeAgg, ShockZone } from '../../core/aggregate';
import type { Graph } from '../../core/graph';
import type { LocalReport } from '../../storage/idb';
import { CLASS_COLORS } from '../format';

/** Segmentele măsurate colorate pe clase; încrederea scăzută = linie întreruptă; nemăsurat = fără culoare. */
export function drawComfort(g: L.LayerGroup, graph: Graph, layer: ComfortLayer, onClick: ((e: EdgeAgg) => void) | null, opts: { dim?: boolean } = {}) {
  const renderer = L.canvas({ tolerance: 10 });
  for (const e of layer.edges.values()) {
    if (e.status === 'UNKNOWN' || !e.class) continue;
    const ll = graph.geometry(e.edge_id);
    const low = e.status === 'LOW_CONFIDENCE';
    const op = opts.dim ? 0.55 : 1;
    L.polyline(ll, { renderer, color: '#ffffff', weight: low ? 7 : 9, opacity: 0.7 * op, interactive: false }).addTo(g);
    const pl = L.polyline(ll, { renderer, color: CLASS_COLORS[e.class], weight: low ? 4.5 : 6, opacity: op, dashArray: low ? '6 7' : undefined, lineCap: low ? 'butt' : 'round', interactive: !!onClick }).addTo(g);
    if (onClick) pl.on('click', (ev) => { L.DomEvent.stopPropagation(ev); onClick(e); });
  }
}

export function drawZones(g: L.LayerGroup, zones: ShockZone[], showReview: boolean, onClick: ((z: ShockZone) => void) | null) {
  for (const z of zones) {
    if (z.status === 'REJECTED') continue;
    if (z.status === 'NEEDS_REVIEW' && !showReview) continue;
    const strong = z.status === 'REPEATED' || (z.confirmed ?? 0) > 0;
    L.circle([z.lat, z.lon], { radius: z.radius_m, color: '#e8590c', weight: 1, opacity: 0.6, fillOpacity: 0.08, interactive: false }).addTo(g);
    const m = L.circleMarker([z.lat, z.lon], { radius: 9, color: '#ffffff', weight: 2.5, fillColor: '#e8590c', fillOpacity: strong ? 1 : 0.35, dashArray: z.status === 'NEEDS_REVIEW' ? '3 3' : undefined, interactive: !!onClick }).addTo(g);
    m.bindTooltip(strong ? 'Zonă cu șocuri repetate' : 'Posibilă denivelare');
    if (onClick) m.on('click', (ev) => { L.DomEvent.stopPropagation(ev); onClick(z); });
  }
}

const REPORT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 1-1h12l-2 4 2 4H5"/></svg>';

export function drawReports(g: L.LayerGroup, reports: LocalReport[], onClick: ((r: LocalReport) => void) | null) {
  for (const r of reports) {
    const color = r.status === 'draft' ? '#6b7280' : '#c2261b';
    const icon = L.divIcon({ className: '', html: `<div class="rep-marker" style="background:${color}">${REPORT_SVG}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    const m = L.marker([r.lat, r.lon], { icon, keyboard: true, title: 'Raportul tău (local)' }).addTo(g);
    if (onClick) m.on('click', (ev) => { L.DomEvent.stopPropagation(ev); onClick(r); });
  }
}

export function drawTrack(g: L.LayerGroup, track: [number, number, number?][], color = '#1857f5', dashed = false, weight = 4) {
  if (track.length < 2) return null;
  return L.polyline(track.map(([a, b]) => [a, b] as [number, number]), { color, weight, opacity: 0.9, dashArray: dashed ? '4 7' : undefined, interactive: false }).addTo(g);
}

export function pinIcon(label: string, color: string) {
  return L.divIcon({ className: '', html: `<div class="pin" style="background:${color}"><span>${label}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
}

export function routeLatLngs(graph: Graph, edges: { edge: number; forward: boolean }[]): [number, number][] {
  const pts: [number, number][] = [];
  for (const { edge, forward } of edges) {
    const geo = graph.geometry(edge);
    const seq = forward ? geo : [...geo].reverse();
    pts.push(...(pts.length ? seq.slice(1) : seq));
  }
  return pts;
}
