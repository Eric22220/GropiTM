import { useRef, useState } from 'react';
import type { DeclaredSurface, ProcessedRide } from '../../core/types';
import { t } from '../../i18n/ro';
import { importFile, useApp, type ImportReport } from '../../state/store';
import { fmt, fmtDateTime, fmtDur, fmtLen } from '../format';
import { RideMiniMap } from '../components/RideMiniMap';
import { RideSummaryCard } from '../components/RideSummaryCard';

export function ImportPage() {
  const input = useRef<HTMLInputElement | null>(null);
  const [declared, setDeclared] = useState<DeclaredSurface>(null);
  const [busy, setBusy] = useState<{ stage: string; frac: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ride: ProcessedRide; report: ImportReport } | null>(null);
  const graphStatus = useApp((s) => s.graphStatus);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setResult(null);
    setBusy({ stage: 'citire fișier', frac: 0.02 });
    try {
      const r = await importFile(f, declared, (stage, frac) => setBusy({ stage, frac }));
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="stack">
      <h1>{t.import.title}</h1>
      <p className="muted small">{t.import.hint}</p>
      <label>
        {t.import.declared}
        <select value={declared ?? ''} onChange={(e) => setDeclared((e.target.value || null) as DeclaredSurface)}>
          <option value="">{t.import.declaredNone}</option>
          <option value="carosabil">{t.surface.carosabil}</option>
          <option value="pista">{t.surface.pista}</option>
          <option value="trotuar">{t.surface.trotuar}</option>
          <option value="mixt">{t.surface.mixt}</option>
        </select>
      </label>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed,.csv,text/csv"
        className="sr-only"
        id="ridefile"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button className="primary big" disabled={!!busy} onClick={() => input.current?.click()}>
        {t.import.pick}
      </button>
      {graphStatus !== 'ready' && graphStatus !== 'loading' && (
        <p className="banner warn small">Graful străzilor nu e disponibil încă: tura se procesează și se vede ca traseu, iar potrivirea pe străzi se face automat când graful apare.</p>
      )}
      {busy && (
        <div className="card" aria-live="polite">
          <p>{t.import.processing}: {busy.stage}…</p>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(busy.frac * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${Math.round(busy.frac * 100)}%` }} />
          </div>
        </div>
      )}
      {error && <p className="banner err" role="alert"><b>{t.import.error}:</b> {error}</p>}
      {result && (
        <>
          <p className="banner ok" role="status">{t.import.done}: {result.ride.meta.label || result.ride.meta.device || result.ride.ride_id} · {fmtDateTime(result.ride.meta.start_ms)}</p>
          <RideSummaryCard p={result.ride} />
          <RideMiniMap p={result.ride} />
          <DiffCard report={result.report} />
          <div className="row">
            <a className="btn primary" href={`#/map/${result.ride.ride_id}`}>{t.import.viewMap}</a>
            <a className="btn" href={`#/ride/${result.ride.ride_id}`}>{t.import.replay}</a>
            <button onClick={() => input.current?.click()}>{t.import.another}</button>
          </div>
          <p className="small muted">Durata {fmtDur(result.ride.summary.duration_s)}, viteză mediană {fmt(result.ride.summary.speed_median, 1, 'm/s')}. Procesare după import, nu telemetrie live.</p>
        </>
      )}
    </div>
  );
}

function DiffCard({ report }: { report: ImportReport }) {
  const d = report.diff;
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{t.import.diffTitle}</h2>
      <dl className="kv">
        <dt>km acoperiți</dt><dd>{fmt(d.km_before, 2)} → <b>{fmt(d.km_after, 2)}</b></dd>
        <dt>muchii noi acoperite</dt><dd>{d.new_covered}</dd>
        <dt>muchii noi MEASURED</dt><dd>{d.new_measured}</dd>
        <dt>și-au schimbat starea</dt><dd>{d.status_changed.length}</dd>
        <dt>și-au schimbat clasa</dt><dd>{d.class_changed.length}</dd>
        <dt>treceri adăugate</dt><dd>{d.passes_added}</dd>
        <dt>zone cu șoc</dt><dd>{d.zones_before} → {d.zones_after}</dd>
        <dt>versiunea stratului</dt><dd>{report.layer_version_before} → {report.layer_version_after}</dd>
      </dl>
      {d.rvi_changes.length > 0 && (
        <details>
          <summary>Schimbarea RVI pe {d.rvi_changes.length} muchii atinse</summary>
          <div className="tablewrap">
            <table>
              <thead><tr><th>muchie</th><th>înainte</th><th>după</th></tr></thead>
              <tbody>
                {d.rvi_changes.slice(0, 60).map((c) => (
                  <tr key={c.edge}><td>{c.edge}</td><td>{fmt(c.before, 2)}</td><td>{fmt(c.after, 2)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className={`banner ${report.route.status === 'changed' ? 'ok' : 'info'} small`}>{report.route.text}</p>
    </div>
  );
}
