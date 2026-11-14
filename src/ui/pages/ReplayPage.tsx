import { useMemo, useRef } from 'react';
import { GpsTrack } from '../../core/gpstrack';
import { useApp } from '../../state/store';
import { UPlot } from '../charts/UPlot';
import { RideSummaryCard } from '../components/RideSummaryCard';
import { drawTrack } from '../map/draw';
import { L, useLayerGroup, useLeaflet } from '../map/useLeaflet';
import { t } from '../../i18n/ro';

export function ReplayPage({ id }: { id?: string }) {
  const ride = useApp((s) => s.rides.find((r) => r.ride_id === id));
  const { ref, map } = useLeaflet({ zoom: 15 });
  const marker = useRef<L.CircleMarker | null>(null);
  const p = ride?.processed;
  const track = useMemo(() => (p ? new GpsTrack(p.gps) : null), [p]);

  useLayerGroup(map, (g) => {
    if (!p) return;
    const pl = drawTrack(g, p.track, '#0b3d5c', false, 4);
    if (pl?.getBounds().isValid()) map!.fitBounds(pl.getBounds(), { padding: [20, 20], maxZoom: 17 });
    marker.current = L.circleMarker([0, 0], { radius: 9, color: '#fff', weight: 3, fillColor: '#e66101', fillOpacity: 1 }).addTo(g);
  }, [p]);

  // a_v filtrat (25 Hz) și rms_v pe ferestre, pe aceeași axă de timp (s de la start)
  const sigData = useMemo(() => {
    if (!p) return null;
    const { t0, dt, v } = p.signal;
    const xs = v.map((_, i) => (i * dt) / 1000);
    const rms = new Array<number | null>(v.length).fill(null);
    for (const w of p.windows) {
      const i = Math.round(((w.t0 + w.t1) / 2 - t0) / dt);
      if (i >= 0 && i < rms.length) rms[i] = w.valid ? w.rms : null;
    }
    // ținem rms constant între centrele ferestrelor, pentru lizibilitate
    let last: number | null = null;
    let lastI = -1e9;
    for (let i = 0; i < rms.length; i++) {
      if (rms[i] !== null) { last = rms[i]; lastI = i; } else if (last !== null && (i - lastI) * dt < 1000) rms[i] = last;
    }
    return [xs, v.map((x) => (Number.isFinite(x) ? x : null)), rms] as [number[], (number | null)[], (number | null)[]];
  }, [p]);

  if (!p) return <div><p>Tura nu există pe acest dispozitiv. <a href="#/rides">{t.nav.rides}</a></p></div>;

  const onCursor = (idx: number | null) => {
    if (idx === null || !track || !marker.current) return;
    const tm = p.signal.t0 + idx * p.signal.dt;
    const pos = track.at(tm, 5000);
    if (pos) marker.current.setLatLng([pos.lat, pos.lon]);
  };

  return (
    <div className="stack">
      <p style={{ fontWeight: 650, margin: 0 }}>{p.meta.label || ride!.file_name}</p>
      <p className="small muted">Mișcă cursorul pe grafic: punctul portocaliu arată poziția pe hartă. Semnalul e a_v filtrat trece-sus ({'>'} 4 Hz), max-abs pe 40 ms; linia verde e rms_v pe ferestrele valide.</p>
      {sigData && (
        <UPlot
          data={sigData}
          series={[
            { label: 'a_v filtrat (m/s²)', stroke: 'rgba(11,61,92,.75)', width: 1 },
            { label: 'rms_v (m/s²)', stroke: '#1b7837', width: 2 },
          ]}
          height={240}
          xLabel="timp (s)"
          ariaLabel="Semnalul de vibrație al turei și indicele pe ferestre"
          onCursor={onCursor}
        />
      )}
      <div ref={ref} className="map inline tall" role="region" aria-label="Traseul turei" />
      <RideSummaryCard p={p} />
    </div>
  );
}
