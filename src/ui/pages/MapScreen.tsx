import { Flag, Layers, LocateFixed, Locate, LocateOff, Search } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { CLASSES, type EdgeAgg, type ShockZone } from '../../core/aggregate';
import { t } from '../../i18n/ro';
import { rideActive, subscribeRide } from '../../services/ride';
import { typeLabel, VISIBILITY_LABEL } from '../../services/reports';
import type { LocalReport } from '../../storage/idb';
import { rejectZone, updateSettings, useApp } from '../../state/store';
import { UPlot } from '../charts/UPlot';
import { CLASS_COLORS, fmt, fmtLen } from '../format';
import { Banner, ClassBadge, Sheet } from '../kit';
import { drawComfort, drawReports, drawTrack, drawZones } from '../map/draw';
import { useLocation, useMeLayer } from '../map/me';
import { useLayerGroup, useLeaflet } from '../map/useLeaflet';
import { go } from '../App';

type Sel = { edge?: EdgeAgg; zone?: ShockZone; report?: LocalReport; layers?: true } | null;

export function MapScreen({ focus }: { focus?: string }) {
  const graph = useApp((s) => s.graph);
  const graphStatus = useApp((s) => s.graphStatus);
  const layer = useApp((s) => s.layer);
  const rides = useApp((s) => s.rides);
  const reports = useApp((s) => s.reports);
  const settings = useApp((s) => s.settings);
  const snapshot = useApp((s) => s.snapshot);
  const recording = useSyncExternalStore(subscribeRide, rideActive);
  const [sel, setSel] = useState<Sel>(null);
  const [locOn, setLocOn] = useState(false);
  const [follow, setFollow] = useState(false);
  const [showTracks, setShowTracks] = useState(!!focus);
  const loc = useLocation(locOn);
  const { ref, map } = useLeaflet({ onClick: () => setSel(null), onDrag: () => setFollow(false) });
  useMeLayer(map, loc, follow);

  useLayerGroup(map, (g) => { if (graph) drawComfort(g, graph, layer, (e) => setSel({ edge: e })); }, [graph, layer]);
  useLayerGroup(map, (g) => { if (settings.showZones) drawZones(g, layer.zones, settings.showReview, (z) => setSel({ zone: z })); }, [layer, settings.showZones, settings.showReview]);
  useLayerGroup(map, (g) => { drawReports(g, reports, (r) => setSel({ report: r })); }, [reports]);
  useLayerGroup(map, (g) => {
    const focused = focus ? rides.find((r) => r.ride_id === focus) : undefined;
    for (const r of rides) {
      if (!showTracks && r !== focused) continue;
      const pl = drawTrack(g, r.processed.track, r === focused ? '#1857f5' : '#5a6677', r !== focused, r === focused ? 5 : 3);
      if (pl && r === focused && pl.getBounds().isValid()) map!.fitBounds(pl.getBounds(), { padding: [40, 40], maxZoom: 17 });
    }
  }, [rides, showTracks, focus]);

  const measured = useMemo(() => [...layer.edges.values()].filter((e) => e.status !== 'UNKNOWN').length, [layer]);
  const lastLocal = rides.reduce((m, r) => Math.max(m, r.processed.meta.start_ms), 0);

  const onLocate = () => {
    if (!locOn) { setLocOn(true); setFollow(true); return; }
    if (loc.fix && map) { map.setView([loc.fix.lat, loc.fix.lon], Math.max(map.getZoom(), 16)); setFollow(true); return; }
  };
  const LocIcon = !locOn ? Locate : loc.status === 'denied' || loc.status === 'unsupported' || loc.status === 'insecure' ? LocateOff : LocateFixed;

  return (
    <main className="screen-map" aria-label="Harta confortului">
      <div ref={ref} className="map" />
      <div className="map-top">
        <button className="search-pill" onClick={() => go('/route?focus=dest')} aria-label="Caută o destinație și planifică traseul">
          <Search aria-hidden="true" /><span>Unde mergi?</span>
        </button>
        <button className="icon-btn" onClick={() => setSel({ layers: true })} aria-label="Straturi și legendă"><Layers /></button>
      </div>
      <div className="map-side">
        <button className={`icon-btn ${follow && loc.fix ? 'following' : locOn ? 'active' : ''}`} onClick={onLocate} aria-label={follow ? 'Urmăresc poziția ta' : 'Locația mea'} aria-pressed={follow}>
          <LocIcon />
        </button>
        {follow && <button className="icon-btn" onClick={() => { setFollow(false); setLocOn(false); }} aria-label="Oprește urmărirea poziției"><LocateOff /></button>}
      </div>
      <div className="map-chip">
        {recording ? (
          <a className="chip live" href="#/record"><span className="rec-dot" aria-hidden="true" /> Tură în curs</a>
        ) : locOn && loc.message ? (
          <span className="chip" role="status">{loc.message}</span>
        ) : graphStatus === 'ready' && measured === 0 && !sel ? (
          <button className="chip" onClick={() => setSel({ layers: true })}>Încă nu sunt străzi măsurate</button>
        ) : null}
      </div>
      {!sel && (
        <button className="fab" onClick={() => go(loc.fix ? `/report/new?lat=${loc.fix.lat}&lon=${loc.fix.lon}` : '/report/new')} aria-label="Raportează o problemă a drumului">
          <Flag aria-hidden="true" /> Raportează
        </button>
      )}

      {sel?.layers && (
        <Sheet title="Harta confortului" onClose={() => setSel(null)}>
          <div className="stack">
            <div>
              {CLASSES.map((c) => (
                <div key={c} className="legend-row"><span className="legend-line" style={{ background: CLASS_COLORS[c] }} /><b style={{ width: 18 }}>{c}</b><span>{t.classShort[c]}</span></div>
              ))}
              <div className="legend-row"><span className="legend-line" style={{ background: 'repeating-linear-gradient(90deg,#5a6677 0 6px,transparent 6px 11px)' }} /><span>Linie întreruptă: puține măsurători</span></div>
              <div className="legend-row"><span className="legend-line" style={{ background: 'var(--surface-3)' }} /><span>Fără culoare: încă nemăsurat (nu înseamnă neted)</span></div>
              <div className="legend-row"><span className="legend-line" style={{ background: '#e8590c', height: 12, width: 12, borderRadius: 6, marginLeft: 9, marginRight: 9 }} /><span>Posibilă denivelare detectată</span></div>
              <div className="legend-row"><span className="legend-line" style={{ background: '#c2261b', height: 14, width: 14, borderRadius: 4, marginLeft: 8, marginRight: 8 }} /><span>Rapoartele tale (doar pe acest telefon)</span></div>
            </div>
            <label className="switch"><input type="checkbox" checked={settings.showZones} onChange={(e) => updateSettings({ showZones: e.target.checked })} />Posibile denivelări</label>
            <label className="switch"><input type="checkbox" checked={showTracks} onChange={(e) => setShowTracks(e.target.checked)} />Traseele turelor mele</label>
            <div className="small muted">
              {measured > 0 ? `${measured} segmente de stradă cu date.` : 'Încă nu sunt străzi măsurate. Fă o tură sau importă una din Sensor Logger: harta se actualizează imediat.'}{' '}
              Date publicate de echipă: {snapshot && snapshot.meta.ride_ids.length ? `actualizate ${snapshot.meta.generated_at.slice(0, 10)}` : 'încă nicio tură publicată'}.
              {lastLocal > 0 && ` Ultima ta tură: ${new Date(lastLocal).toLocaleDateString('ro-RO')}.`}
            </div>
            <p className="xs muted">Clasele sunt relative la telefonul, bicicleta și suportul folosite la măsurare. Confortul nu înseamnă siguranță. <a href="#/more/method">Cum măsurăm</a></p>
          </div>
        </Sheet>
      )}
      {sel?.edge && graph && <EdgeSheet e={sel.edge} name={graph.name[sel.edge.edge_id] || 'Stradă fără nume'} len={graph.length[sel.edge.edge_id]} osm={`${graph.highway[sel.edge.edge_id]}${graph.surface[sel.edge.edge_id] ? ', suprafață ' + graph.surface[sel.edge.edge_id] : ''}`} version={layer.processing_version} onClose={() => setSel(null)} />}
      {sel?.zone && <ZoneSheet z={sel.zone} onClose={() => setSel(null)} />}
      {sel?.report && <ReportSheet r={sel.report} onClose={() => setSel(null)} />}
    </main>
  );
}

function EdgeSheet({ e, name, len, osm, version, onClose }: { e: EdgeAgg; name: string; len: number; osm: string; version: string; onClose: () => void }) {
  const cls = e.class!;
  const sure = e.status === 'MEASURED';
  return (
    <Sheet title={name} onClose={onClose}>
      <div className="stack">
        <div className="row nowrap">
          <ClassBadge c={cls} />
          <div className="grow"><b>{t.classShort[cls]}</b><div className="small muted">{t.classPlain[cls]}</div></div>
        </div>
        <Banner kind={sure ? 'ok' : 'warn'}>
          {sure ? `Măsurat în ${e.n_passes} treceri` : `Puține măsurători (${e.reasons.join(', ')})`}{e.last_seen ? `, ultima pe ${new Date(e.last_seen).toLocaleDateString('ro-RO')}` : ''}. Segment de {fmtLen(len)}.
        </Banner>
        <details>
          <summary>Detalii tehnice</summary>
          <dl className="kv">
            <dt>RVI</dt><dd>{fmt(e.rms_median, 2, 'm/s²')}</dd>
            <dt>stare</dt><dd>{e.status}</dd>
            <dt>ferestre valide</dt><dd>{e.n_windows} din {e.n_windows_total}</dd>
            <dt>ture</dt><dd>{e.n_rides}</dd>
            <dt>viteză mediană</dt><dd>{fmt(e.speed_median, 1, 'm/s')}</dd>
            <dt>precizie GPS</dt><dd>{fmt(e.gps_acc_median, 1, 'm')}</dd>
            <dt>tip segment</dt><dd>{e.surface_kind ?? '—'} (OSM: {osm})</dd>
            <dt>ambiguitate</dt><dd>{fmt(e.ambiguous_ratio * 100, 0, '%')} carosabil/trotuar</dd>
            <dt>surse</dt><dd>{e.sources.join(', ')}</dd>
            <dt>algoritm</dt><dd>{version}</dd>
          </dl>
        </details>
      </div>
    </Sheet>
  );
}

function ZoneSheet({ z, onClose }: { z: ShockZone; onClose: () => void }) {
  const snip = z.strongest.snippet;
  const data = useMemo(() => (snip ? ([snip.v.map((_, i) => (i * snip.dt) / 1000 - 3), snip.v.map((v) => (Number.isFinite(v) ? v : null))] as [number[], (number | null)[]]) : null), [snip]);
  return (
    <Sheet title={z.status === 'REPEATED' ? 'Șocuri repetate în această zonă' : 'Posibilă denivelare'} onClose={onClose}>
      <div className="stack">
        <p className="small">Detectată automat din vibrații în {z.detections} {z.detections === 1 ? 'trecere' : 'treceri'} din {z.passes}. Nu știm ce tip de obstacol este; cercul arată incertitudinea poziției (±{Math.round(z.radius_m)} m).</p>
        {(z.confirmed ?? 0) > 0 && <Banner kind="ok">Ai confirmat această problemă după o tură.</Banner>}
        <div className="row">
          <a className="btn primary sm" href={`#/report/new?lat=${z.lat}&lon=${z.lon}`}>Raportează aici</a>
          <button className="btn sm ghost" onClick={() => { void rejectZone(z.members, z.status !== 'REJECTED'); onClose(); }}>Nu e o problemă</button>
        </div>
        <details>
          <summary>Detalii tehnice</summary>
          <dl className="kv">
            <dt>vârf</dt><dd>{fmt(z.peak_max, 1, 'm/s²')} (mediana {fmt(z.peak_median, 1)})</dd>
            <dt>stare algoritm</dt><dd>{z.status}</dd>
            <dt>viteză</dt><dd>{fmt(z.speed_median, 1, 'm/s')}</dd>
            <dt>roată față + spate</dt><dd>{fmt(z.double_hit_ratio * 100, 0, '%')} (ipoteză)</dd>
            <dt>ultima detectare</dt><dd>{z.last_seen}</dd>
          </dl>
          {data && <UPlot data={data} series={[{ label: 'a_v filtrat (m/s²)', stroke: '#e8590c', width: 1 }]} height={140} xLabel="s față de vârf" ariaLabel="Semnalul de ±3 s în jurul detectării" />}
        </details>
      </div>
    </Sheet>
  );
}

function ReportSheet({ r, onClose }: { r: LocalReport; onClose: () => void }) {
  return (
    <Sheet title={r.status === 'draft' ? 'Marcaj de completat' : typeLabel(r.type)} onClose={onClose}>
      <div className="stack">
        <span className="badge">{VISIBILITY_LABEL.device}</span>
        <p className="small muted">{new Date(r.created_at).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}{r.description ? ` · ${r.description}` : ''}</p>
        <a className="btn primary block" href={`#/report/${r.id}`}>{r.status === 'draft' ? 'Completează raportul' : 'Deschide raportul'}</a>
      </div>
    </Sheet>
  );
}
