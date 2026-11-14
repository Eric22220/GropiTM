import { L, useLayerGroup, useLeaflet } from '../map/useLeaflet';
import type { ProcessedRide } from '../../core/types';
import { drawTrack } from '../map/draw';

export function RideMiniMap({ p, extra }: { p: ProcessedRide; extra?: ProcessedRide }) {
  const { ref, map } = useLeaflet({ zoom: 14 });
  useLayerGroup(map, (g) => {
    const pl = drawTrack(g, p.track, "#1857f5", false, 4);
    const pl2 = extra ? drawTrack(g, extra.track, '#e66101', true, 4) : null;
    const b = pl?.getBounds();
    if (pl2 && b) b.extend(pl2.getBounds());
    if (b && b.isValid()) map!.fitBounds(b, { padding: [20, 20], maxZoom: 17 });
    else if (p.track.length === 1) map!.setView([p.track[0][0], p.track[0][1]], 16);
    if (p.track.length) {
      L.circleMarker([p.track[0][0], p.track[0][1]], { radius: 6, color: '#1d5c2e', fillOpacity: 1 }).bindTooltip('start').addTo(g);
      const l = p.track[p.track.length - 1];
      L.circleMarker([l[0], l[1]], { radius: 6, color: '#8a1111', fillOpacity: 1 }).bindTooltip('stop').addTo(g);
    }
    for (const s of p.shocks) if (s.lat !== null && s.lon !== null) L.circleMarker([s.lat, s.lon], { radius: 5, color: '#6a00a8', fillOpacity: s.needs_review ? 0 : 0.8 }).bindTooltip(`șoc ${s.peak.toFixed(1)} m/s²`).addTo(g);
  }, [p, extra]);
  return <div ref={ref} className="map inline tall" role="region" aria-label="Traseul turei pe hartă" />;
}
