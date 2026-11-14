// Exporturi pentru preluare: comfort-layer.geojson / .json, shock-zones.geojson / .json (ODbL, derivate din OSM).
import type { ComfortLayer } from './aggregate';
import type { Graph } from './graph';

const LICENSE = { license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', note: 'RVI relativ: valabil pentru combinația telefon + bicicletă + suport din calibrare. Confortul nu e siguranță.' };

export function comfortRows(layer: ComfortLayer) {
  return [...layer.edges.values()]
    .filter((e) => e.status !== 'UNKNOWN')
    .map((e) => ({
      edge_id: e.edge_id, rvi: e.rms_median === null ? null : Math.round(e.rms_median * 1000) / 1000, rms_median: e.rms_median, class: e.class,
      n_windows: e.n_windows, n_passes: e.n_passes, n_rides: e.n_rides, speed_median: e.speed_median, gps_acc_median: e.gps_acc_median,
      status: e.status, surface_kind: e.surface_kind, ambiguous_ratio: e.ambiguous_ratio, last_seen: e.last_seen, passes: e.n_passes,
      processing_version: layer.processing_version,
    }));
}

export function comfortGeoJSON(layer: ComfortLayer, g: Graph) {
  return {
    type: 'FeatureCollection',
    properties: { ...LICENSE, processing_version: layer.processing_version, thresholds: layer.thresholds, thresholds_source: layer.thresholds_source, generated_at: new Date().toISOString() },
    features: comfortRows(layer).map((r) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: g.geometry(r.edge_id).map(([lat, lon]) => [lon, lat]) },
      properties: { ...r, osm_way_id: g.osmWay[r.edge_id], highway: g.highway[r.edge_id], name: g.name[r.edge_id] },
    })),
  };
}

export function zoneRows(layer: ComfortLayer) {
  return layer.zones
    .filter((z) => z.status !== 'REJECTED')
    .map((z) => ({
      lat: Math.round(z.lat * 1e6) / 1e6, lon: Math.round(z.lon * 1e6) / 1e6, radius_m: Math.round(z.radius_m * 10) / 10, status: z.status,
      passes: z.passes, detections: z.detections, peak_median: Math.round(z.peak_median * 100) / 100, double_hit_ratio: z.double_hit_ratio,
      speed_median: z.speed_median, last_seen: z.last_seen, edge_id: z.edge_id, surface_kind: z.surface_kind, processing_version: layer.processing_version,
    }));
}

export function zonesGeoJSON(layer: ComfortLayer) {
  return {
    type: 'FeatureCollection',
    properties: { ...LICENSE, description: 'Zone cu șoc posibil (nu „gropi”): nu identificăm tipul obstacolului.' },
    features: zoneRows(layer).map((z) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [z.lon, z.lat] }, properties: z })),
  };
}
