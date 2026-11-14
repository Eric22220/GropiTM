// Stratul „Locația mea”: punct, cerc de precizie și conul direcției (doar când direcția e credibilă).
import L from 'leaflet';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { alive } from './useLeaflet';
import { reliableMotion, tracker, type LocState } from '../../services/location';

export function useLocation(active: boolean): LocState {
  const s = useSyncExternalStore((l) => tracker.subscribe(l), () => tracker.get());
  useEffect(() => {
    if (!active) return;
    return tracker.acquire(); // eliberat la demontare → watcher oprit când nu mai e folosit
  }, [active]);
  return s;
}

export function useMeLayer(map: L.Map | null, loc: LocState, follow: boolean) {
  const layer = useRef<{ circle: L.Circle; marker: L.Marker } | null>(null);
  useEffect(() => {
    if (!map) return;
    return () => { layer.current?.circle.remove(); layer.current?.marker.remove(); layer.current = null; };
  }, [map]);
  useEffect(() => {
    if (!alive(map)) return;
    const f = loc.fix;
    if (!f) { layer.current?.circle.remove(); layer.current?.marker.remove(); layer.current = null; return; }
    const { heading } = reliableMotion(f);
    const html = `<div class="me-wrap">${heading !== null ? `<div class="me-cone" style="transform:rotate(${Math.round(heading)}deg)"></div>` : ''}<div class="me-dot"></div></div>`;
    const icon = L.divIcon({ className: '', html, iconSize: [24, 24], iconAnchor: [12, 12] });
    if (!layer.current) {
      const circle = L.circle([f.lat, f.lon], { radius: f.acc, color: '#1857f5', weight: 1.5, opacity: 0.7, fillColor: '#1857f5', fillOpacity: 0.14, interactive: false }).addTo(map);
      const marker = L.marker([f.lat, f.lon], { icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      layer.current = { circle, marker };
    } else {
      layer.current.circle.setLatLng([f.lat, f.lon]).setRadius(f.acc);
      layer.current.marker.setLatLng([f.lat, f.lon]).setIcon(icon);
    }
    if (follow) map.setView([f.lat, f.lon], Math.max(map.getZoom(), 16), { animate: true });
  }, [map, loc.fix, follow]);
}

export function gpsQuality(acc: number | null | undefined): { label: string; tone: 'comfort' | 'warn' | 'danger' } {
  if (acc === null || acc === undefined) return { label: 'fără semnal', tone: 'danger' };
  if (acc <= 10) return { label: `bună (±${Math.round(acc)} m)`, tone: 'comfort' };
  if (acc <= 25) return { label: `medie (±${Math.round(acc)} m)`, tone: 'warn' };
  return { label: `slabă (±${Math.round(acc)} m)`, tone: 'danger' };
}
