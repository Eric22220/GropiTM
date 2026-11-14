import { BarChart3, Map as MapIcon, Share2, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { CLASSES, classOf } from '../../core/aggregate';
import type { DeclaredSurface } from '../../core/types';
import { t } from '../../i18n/ro';
import { getRideFile, removeRide, setDeclaredSurface, setIncluded, setRideFields, useApp } from '../../state/store';
import { RideMiniMap } from '../components/RideMiniMap';
import { RideSummaryCard } from '../components/RideSummaryCard';
import { CLASS_COLORS, fmt, fmtLen, shareOrDownload } from '../format';
import { Banner, Header, Stat, toast } from '../kit';
import { go } from '../App';

export function RideDetail({ id }: { id?: string }) {
  const r = useApp((s) => s.rides.find((x) => x.ride_id === id));
  const th = useApp((s) => s.layer.thresholds);
  const reviews = useApp((s) => s.reviews);
  const lastImport = useApp((s) => s.lastImport);
  const dist = useMemo(() => {
    const c = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    if (r) for (const w of r.processed.windows) if (w.valid) c[classOf(w.rms, th)]++;
    return c;
  }, [r, th]);
  if (!r) return <main className="screen"><div className="wrap"><Header title="Tură" back="#/rides" /><p>Tura nu există pe acest telefon.</p></div></main>;
  const p = r.processed;
  const s = p.summary;
  const valid = Object.values(dist).reduce((a, b) => a + b, 0);
  const cands = p.shocks.filter((x) => x.located);
  const unreviewed = cands.filter((x) => !reviews[`${r.ride_id}:${x.id}`]).length;
  return (
    <main className="screen"><div className="wrap stack">
      <Header title={p.meta.label || r.file_name.replace(/\.zip$/i, '')} back="#/rides" />
      <p className="small muted" style={{ marginTop: -8 }}>{new Date(p.meta.start_ms).toLocaleString('ro-RO', { dateStyle: 'full', timeStyle: 'short' })} · {p.meta.source === 'sensorlogger' ? 'importată din Sensor Logger' : 'înregistrată în ShockGrid'}</p>
      <div className="grid3">
        <Stat v={fmtLen(s.distance_m)} l="distanță" />
        <Stat v={`${Math.round(s.duration_s / 60)}`} unit="min" l="durată" />
        <Stat v={s.speed_median ? fmt(s.speed_median * 3.6, 0) : '—'} unit="km/h" l="viteză tipică" />
      </div>
      {lastImport?.ride_id === r.ride_id && (
        <Banner kind={lastImport.diff.new_covered > 0 ? 'ok' : 'info'}>
          <b>Harta s-a actualizat.</b> Străzi cu date: {fmt(lastImport.diff.km_before, 2)} → {fmt(lastImport.diff.km_after, 2)} km; {lastImport.diff.new_covered} segmente noi, {lastImport.diff.new_measured} măsurate sigur, {lastImport.diff.passes_added} treceri adăugate.
          {lastImport.route.status !== 'none' && <> {lastImport.route.text}</>}
        </Banner>
      )}
      {cands.length > 0 && (
        <a className={`card ${unreviewed ? 'tint-warn' : ''}`} href={`#/review/${r.ride_id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <TriangleAlert style={{ color: 'var(--warn)', flex: 'none' }} />
          <div className="grow"><b>{cands.length} {cands.length === 1 ? 'posibilă denivelare' : 'posibile denivelări'}</b><div className="small muted">{unreviewed ? `${unreviewed} de verificat` : 'toate verificate'}</div></div>
          <span className="btn sm primary">{unreviewed ? 'Verifică' : 'Revezi'}</span>
        </a>
      )}
      <div className="card">
        <h3>Cât de confortabil a fost</h3>
        {valid > 0 ? (
          <>
            <div className="bar" style={{ height: 14, margin: '8px 0' }} aria-hidden="true">{CLASSES.map((c) => <i key={c} style={{ width: `${(100 * dist[c]) / valid}%`, background: CLASS_COLORS[c] }} />)}</div>
            <div className="small">{CLASSES.filter((c) => dist[c] > 0).map((c) => `${t.classShort[c]} ${Math.round((100 * dist[c]) / valid)}%`).join(' · ')}</div>
            <p className="xs muted" style={{ marginTop: 6 }}>Din {valid} s de mers la viteză normală (2,5–9 m/s). Pornirile, opririle și GPS-ul slab nu intră în calcul.</p>
          </>
        ) : <p className="small muted">Nu avem porțiuni de mers la viteză normală cu GPS bun, deci nu putem estima confortul acestei ture.</p>}
      </div>
      <RideMiniMap p={p} />
      <label className="switch card" style={{ padding: '6px 16px' }}><input type="checkbox" checked={r.included} onChange={(e) => setIncluded(r.ride_id, e.target.checked)} /><span><b>Folosește tura în harta mea</b><div className="xs muted">Doar pe acest telefon</div></span></label>
      <div className="grid2">
        <a className="btn" href={`#/map/${r.ride_id}`}><MapIcon /> Pe hartă</a>
        <button className="btn" onClick={async () => { const f = await getRideFile(r.ride_id); if (!f) { toast('Fișierul original nu mai e disponibil.'); return; } await shareOrDownload(r.file_name.endsWith('.zip') ? r.file_name : `${r.file_name}.zip`, f); }}><Share2 /> Exportă</button>
      </div>
      <details className="card">
        <summary>Detalii</summary>
        <div className="stack">
          <label className="field"><span>Nume</span><input className="input" defaultValue={p.meta.label ?? ''} onBlur={(e) => setRideFields(r.ride_id, { label: e.target.value })} /></label>
          <label className="field"><span>Pe ce ai mers mai ales?</span>
            <select value={p.meta.declared_surface ?? ''} onChange={(e) => setDeclaredSurface(r.ride_id, (e.target.value || null) as DeclaredSurface)}>
              <option value="">nu știu / amestecat</option><option value="carosabil">carosabil</option><option value="pista">pistă de biciclete</option><option value="trotuar">trotuar</option><option value="mixt">mixt</option>
            </select>
          </label>
          <label className="field"><span>Cât de confortabil ți s-a părut (1–5)?</span>
            <select value={r.perceived ?? ''} onChange={(e) => setRideFields(r.ride_id, { perceived: e.target.value ? Number(e.target.value) : null })}>
              <option value="">nenotat</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </details>
      <details className="card">
        <summary>Analiză tehnică</summary>
        <div className="stack">
          <a className="btn block" href={`#/ride/${r.ride_id}/replay`}><BarChart3 /> Grafic vibrații (replay)</a>
          <RideSummaryCard p={p} />
        </div>
      </details>
      {p.meta.warnings.length > 0 && <Banner kind="warn">{p.meta.warnings[0]}</Banner>}
      <button className="btn danger block" onClick={async () => { if (confirm('Ștergi tura de pe acest telefon? Contribuția ei dispare din hartă. Nu se poate anula.')) { await removeRide(r.ride_id); go('/rides'); } }}><Trash2 /> Șterge tura</button>
    </div></main>
  );
}
