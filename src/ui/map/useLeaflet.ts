// Leaflet direct, printr-un hook propriu (fără react-leaflet, care are licența Hippocratic).
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { TIMISOARA_CENTER } from '../../core/geo';

export function useLeaflet(opts: { zoom?: number; onClick?: (lat: number, lon: number) => void } = {}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const clickRef = useRef(opts.onClick);
  clickRef.current = opts.onClick;
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, { preferCanvas: true, zoomControl: true, tapTolerance: 20 }).setView(TIMISOARA_CENTER, opts.zoom ?? 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
    setMap(m);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); m.remove(); setMap(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, map };
}

/** un LayerGroup care se reconstruiește când se schimbă dependențele */
export function useLayerGroup(map: L.Map | null, build: (g: L.LayerGroup) => void, deps: unknown[]) {
  useEffect(() => {
    if (!map) return;
    const g = L.layerGroup().addTo(map);
    build(g);
    return () => { g.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
}

export { L };
