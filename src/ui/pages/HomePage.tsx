import { t } from '../../i18n/ro';
import { coveredKm } from '../../core/aggregate';
import { lengthOf, useApp } from '../../state/store';
import { fmt, fmtDateTime, fmtLen } from '../format';

export function HomePage() {
  const rides = useApp((s) => s.rides);
  const layer = useApp((s) => s.layer);
  const graphStatus = useApp((s) => s.graphStatus);
  const last = [...rides].sort((a, b) => b.imported_at - a.imported_at)[0];
  const measured = [...layer.edges.values()].filter((e) => e.status === 'MEASURED').length;
  const low = [...layer.edges.values()].filter((e) => e.status === 'LOW_CONFIDENCE').length;
  return (
    <div className="stack">
      <h1>{t.app.tagline}</h1>
      <a className="btn primary big" href="#/import">{t.home.importBtn}</a>
      <a className="btn big" href="#/record">{t.home.recordBtn}</a>
      <div className="grid2">
        <a className="btn" href="#/map">{t.nav.map}</a>
        <a className="btn" href="#/route">{t.nav.route}</a>
        <a className="btn" href="#/compare">{t.nav.compare}</a>
        <a className="btn" href="#/rides">{t.nav.rides}</a>
        <a className="btn" href="#/about">{t.nav.about}</a>
        <a className="btn" href="#/diag">{t.nav.diag}</a>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Stratul de confort</h2>
        <p>
          {graphStatus === 'ready'
            ? <>Segmente măsurate: <b>{measured}</b>, cu încredere scăzută: <b>{low}</b>, acoperire: <b>{fmt(coveredKm(layer, lengthOf), 2, 'km')}</b> (versiunea stratului {layer.version}).</>
            : graphStatus === 'loading' ? 'Se încarcă graful străzilor…' : 'Graful străzilor nu e disponibil încă; turele se pot importa și vedea ca trasee GPS.'}
        </p>
        <p className="small muted">{t.home.flow}</p>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t.home.lastRide}</h2>
        {last ? (
          <p>
            <b>{last.processed.meta.label || last.file_name}</b><br />
            {fmtDateTime(last.processed.meta.start_ms)} · {fmtLen(last.processed.summary.distance_m)} · {last.processed.summary.n_windows_valid} ferestre valide ·{' '}
            <a href={`#/ride/${last.ride_id}`}>replay</a>
          </p>
        ) : <p className="muted">{t.home.noRides}</p>}
      </div>
      <p className="banner info small">{t.home.comfortNotSafety} {t.home.postImport}</p>
    </div>
  );
}
