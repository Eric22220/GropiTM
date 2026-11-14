import { useMemo, useState } from 'react';
import type { EdgeAgg, ShockZone } from '../../core/aggregate';
import { CLASSES } from '../../core/aggregate';
import { t } from '../../i18n/ro';
import { rejectZone, updateSettings, useApp } from '../../state/store';
import { UPlot } from '../charts/UPlot';
import { CLASS_COLORS, fmt, fmtLen } from '../format';
import { drawComfort, drawTrack, drawZones } from '../map/draw';
import { L, useLayerGroup, useLeaflet } from '../map/useLeaflet';

export function MapPage({ focus }: { focus?: string }) {
  const graph = useApp((s) => s.graph);
  const graphStatus = useApp((s) => s.graphStatus);
  const layer = useApp((s) => s.layer);
  const rides = useApp((s) => s.rides);
  const settings = useApp((s) => s.settings);
  const [sel, setSel] = useState<{ edge?: EdgeAgg; zone?: ShockZone } | null>(null);
  const [showTracks, setShowTracks] = useState(graphStatus !== 'ready' || !!focus);
  const [legendOpen, setLegendOpen] = useState(true);
  const { ref, map } = useLeaflet({ onClick: () => setSel(null) });

  useLayerGroup(map, (g) => {
    if (graph) drawComfort(g, graph, layer, (e) => setSel({ edge: e }));
  }, [graph, layer]);

  useLayerGroup(map, (g) => {
    if (settings.showZones) drawZones(g, layer.zones, settings.showReview, (z) => setSel({ zone: z }));
  }, [layer, settings.showZones, settings.showReview]);

  useLayerGroup(map, (g) => {
    const focused = focus ? rides.find((r) => r.ride_id === focus) : undefined;
    let bounds: L.LatLngBounds | null = null;
    for (const r of rides) {
      if (!showTracks && r !== focused) continue;
      const pl = drawTrack(g, r.processed.track, r === focused ? '#6a00a8' : '#0b3d5c', r !== focused, r === focused ? 4 : 2);
      if (pl && r === focused) bounds = pl.getBounds();
    }
    if (bounds?.isValid()) map!.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
  }, [rides, showTracks, focus]);

  const counts = useMemo(() => {
    let m = 0, l = 0;
    for (const e of layer.edges.values()) { if (e.status === 'MEASURED') m++; else if (e.status === 'LOW_CONFIDENCE') l++; }
    return { m, l };
  }, [layer]);

  return (
    <>
      <div ref={ref} className="mapbox" role="region" aria-label="Harta confortului" />
      <div className="overlay top">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b>Harta confortului</b>
          <button onClick={() => setLegendOpen(!legendOpen)} aria-expanded={legendOpen}>{legendOpen ? 'Ascunde' : t.map.legend}</button>
        </div>
        {legendOpen && (
          <div className="stack small">
            <div className="legend" aria-label="Clasele de confort">
              {CLASSES.map((c) => (
                <span key={c} className="swatch"><i style={{ background: CLASS_COLORS[c] }} /> {c} {t.classes[c]}</span>
              ))}
            </div>
            <div className="legend">
              <span className="swatch"><i style={{ background: '#555' }} /> {t.map.measured} ({counts.m})</span>
              <span className="swatch"><i style={{ background: 'repeating-linear-gradient(90deg,#555 0 6px,transparent 6px 12px)' }} /> {t.map.low} ({counts.l})</span>
            </div>
            <div className="muted">{t.map.unknownNote} {t.map.thresholdsNote}</div>
            <div className="row">
              <label className="check"><input type="checkbox" checked={settings.showZones} onChange={(e) => updateSettings({ showZones: e.target.checked })} />{t.map.zones} ({layer.zones.filter((z) => z.status !== 'NEEDS_REVIEW' && z.status !== 'REJECTED').length})</label>
              <label className="check"><input type="checkbox" checked={settings.showReview} onChange={(e) => updateSettings({ showReview: e.target.checked })} />{t.map.showReview}</label>
              <label className="check"><input type="checkbox" checked={showTracks} onChange={(e) => setShowTracks(e.target.checked)} />{t.map.tracks}</label>
            </div>
            {graphStatus !== 'ready' && <div className="banner warn">{graphStatus === 'loading' ? 'Se încarcă graful străzilor…' : t.map.noGraph}</div>}
          </div>
        )}
      </div>
      {sel?.edge && graph && <EdgePanel e={sel.edge} name={graph.name[sel.edge.edge_id]} len={graph.length[sel.edge.edge_id]} osmSurface={graph.surface[sel.edge.edge_id]} highway={graph.highway[sel.edge.edge_id]} version={layer.processing_version} onClose={() => setSel(null)} />}
      {sel?.zone && <ZonePanel z={sel.zone} onClose={() => setSel(null)} />}
    </>
  );
}

function srcLabel(s: string) {
  return s === 'sensorlogger' ? 'Sensor Logger' : s === 'shockgrid' ? 'ShockGrid (înregistrator propriu)' : 'format vechi';
}

function EdgePanel({ e, name, len, osmSurface, highway, version, onClose }: { e: EdgeAgg; name: string; len: number; osmSurface: string; highway: string; version: string; onClose: () => void }) {
  return (
    <div className="overlay bottom" role="dialog" aria-label="Detaliile segmentului">
      <button className="closebtn" onClick={onClose} aria-label={t.common.close}>✕</button>
      <h3 style={{ marginTop: 0 }}>
        {e.class && <span className="badge clsbadge" style={{ background: CLASS_COLORS[e.class] }}>{e.class}</span>}{' '}
        {name || highway} · {fmtLen(len)}
      </h3>
      <dl className="kv small">
        <dt>starea</dt><dd><b>{t.status[e.status]}</b>{e.reasons.length ? ` (${e.reasons.join(', ')})` : ''}</dd>
        <dt>{t.rviLabel}</dt><dd>{fmt(e.rms_median, 2, 'm/s²')} · clasa {e.class ?? t.common.unknown}{e.class ? ` (${t.classes[e.class]})` : ''}</dd>
        <dt>tipul segmentului</dt><dd>{e.surface_kind ? t.surface[e.surface_kind] : t.common.unknown} (OSM highway={highway})</dd>
        <dt>sursa măsurătorii</dt><dd>{e.sources.map(srcLabel).join(', ') || t.common.unknown}</dd>
        <dt>ultima măsurătoare</dt><dd>{e.last_seen ?? t.common.unknown}</dd>
        <dt>ferestre valide</dt><dd>{e.n_windows} din {e.n_windows_total}</dd>
        <dt>treceri / ture</dt><dd>{e.n_passes} / {e.n_rides}</dd>
        <dt>viteza mediană</dt><dd>{fmt(e.speed_median, 1, 'm/s')}</dd>
        <dt>precizia GPS mediană</dt><dd>{fmt(e.gps_acc_median, 1, 'm')}</dd>
        <dt>ambiguitate carosabil/trotuar</dt><dd>{fmt(e.ambiguous_ratio * 100, 0, '%')}</dd>
        <dt>suprafață declarată în OSM</dt><dd>{osmSurface || 'nedeclarată'} (nu intră în RVI)</dd>
        <dt>versiunea algoritmului</dt><dd>{version}</dd>
      </dl>
    </div>
  );
}

function ZonePanel({ z, onClose }: { z: ShockZone; onClose: () => void }) {
  const snip = z.strongest.snippet;
  const data = useMemo(() => {
    if (!snip) return null;
    const xs = snip.v.map((_, i) => (i * snip.dt) / 1000 - 3);
    return [xs, snip.v.map((v) => (Number.isFinite(v) ? v : null))] as [number[], (number | null)[]];
  }, [snip]);
  return (
    <div className="overlay bottom" role="dialog" aria-label="Detaliile zonei cu șoc">
      <button className="closebtn" onClick={onClose} aria-label={t.common.close}>✕</button>
      <h3 style={{ marginTop: 0 }}>Zonă cu șoc · {t.status[z.status]}</h3>
      <p className="small muted">„Șoc posibil”, nu „groapă”: nu identificăm tipul obstacolului. Raza vizibilă e incertitudinea poziției ({fmt(z.radius_m, 0, 'm')}).</p>
      <dl className="kv small">
        <dt>vârful cel mai mare</dt><dd>{fmt(z.peak_max, 1, 'm/s²')} (mediana {fmt(z.peak_median, 1, 'm/s²')})</dd>
        <dt>treceri / detectări</dt><dd>{z.passes} / {z.detections}</dd>
        <dt>viteza</dt><dd>{fmt(z.speed_median, 1, 'm/s')}</dd>
        <dt>double hit (roată față + spate)</dt><dd>{fmt(z.double_hit_ratio * 100, 0, '%')} din detectări (ipoteză, nu dovadă)</dd>
        <dt>data</dt><dd>{z.last_seen}</dd>
        {z.strongest.flags.length > 0 && <><dt>marcaje</dt><dd>{z.strongest.flags.map((f) => t.shockFlags[f] ?? f).join(', ')}</dd></>}
      </dl>
      {data && (
        <UPlot
          data={data}
          series={[{ label: 'a_v filtrat (m/s²)', stroke: '#6a00a8', width: 1 }]}
          height={150}
          xLabel="s față de vârf"
          ariaLabel="Semnalul real de ±3 secunde în jurul celei mai puternice detectări"
        />
      )}
      <div className="row">
        <button onClick={() => rejectZone(z.members, z.status !== 'REJECTED')}>{z.status === 'REJECTED' ? 'Anulează respingerea' : 'Marchează ca respins'}</button>
      </div>
    </div>
  );
}
