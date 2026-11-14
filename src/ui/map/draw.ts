import L from 'leaflet';
import type { ComfortLayer, EdgeAgg, ShockZone } from '../../core/aggregate';
import type { Graph } from '../../core/graph';
import { CLASS_COLORS } from '../format';

/** Muchiile MEASURED colorate pe clase; LOW_CONFIDENCE întrerupte; UNKNOWN fără culoare de confort. */
export function drawComfort(g: L.LayerGroup, graph: Graph, layer: ComfortLayer, onClick: (e: EdgeAgg) => void, opts: { highlight?: Set<number> } = {}) {
  const renderer = L.canvas({ tolerance: 8 });
  for (const e of layer.edges.values()) {
    if (e.status === 'UNKNOWN' || !e.class) continue;
    const ll = graph.geometry(e.edge_id);
    const color = CLASS_COLORS[e.class];
    const low = e.status === 'LOW_CONFIDENCE';
    L.polyline(ll, { renderer, color: '#1a1a1a', weight: low ? 6 : 8, opacity: low ? 0.35 : 0.6, interactive: false }).addTo(g);
    const pl = L.polyline(ll, {
      renderer,
      color,
      weight: low ? 4 : 6,
      opacity: low ? 0.9 : 1,
      dashArray: low ? '6 7' : undefined,
      lineCap: low ? 'butt' : 'round',
    }).addTo(g);
    pl.on('click', (ev) => { L.DomEvent.stopPropagation(ev); onClick(e); });
    if (opts.highlight?.has(e.edge_id)) L.polyline(ll, { renderer, color: '#ff00ff', weight: 2, opacity: 0.9, interactive: false }).addTo(g);
  }
}

export function drawZones(g: L.LayerGroup, zones: ShockZone[], showReview: boolean, onClick: (z: ShockZone) => void) {
  for (const z of zones) {
    if (z.status === 'REJECTED') continue;
    if (z.status === 'NEEDS_REVIEW' && !showReview) continue;
    const color = z.status === 'REPEATED' ? '#6a00a8' : z.status === 'CANDIDATE' ? '#6a00a8' : '#777';
    L.circle([z.lat, z.lon], { radius: z.radius_m, color, weight: 1, opacity: 0.7, fillOpacity: 0.06, interactive: false }).addTo(g);
    const m = L.circleMarker([z.lat, z.lon], {
      radius: 8,
      color,
      weight: 3,
      fillColor: color,
      fillOpacity: z.status === 'REPEATED' ? 0.9 : 0,
      dashArray: z.status === 'NEEDS_REVIEW' ? '3 3' : undefined,
    }).addTo(g);
    m.bindTooltip(`Zonă cu șoc · ${z.status === 'REPEATED' ? 'repetat' : z.status === 'CANDIDATE' ? 'candidat' : 'de verificat'}`);
    m.on('click', (ev) => { L.DomEvent.stopPropagation(ev); onClick(z); });
  }
}

export function drawTrack(g: L.LayerGroup, track: [number, number, number][], color = '#0b3d5c', dashed = false, weight = 3) {
  if (track.length < 2) return null;
  return L.polyline(track.map(([a, b]) => [a, b] as [number, number]), { color, weight, opacity: 0.85, dashArray: dashed ? '4 6' : undefined, interactive: false }).addTo(g);
}
