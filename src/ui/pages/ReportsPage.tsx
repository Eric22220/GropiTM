import { Bookmark, Download, Flag, Plus } from 'lucide-react';
import { reportsGeoJSON, typeLabel, VISIBILITY_LABEL } from '../../services/reports';
import { useApp } from '../../state/store';
import { download } from '../format';
import { Banner, Header, Item } from '../kit';

export function ReportsPage() {
  const reports = useApp((s) => s.reports);
  const drafts = reports.filter((r) => r.status === 'draft');
  return (
    <main className="screen"><div className="wrap stack">
      <Header title="Rapoartele mele" back="#/more" right={<a className="icon-btn flat" href="#/report/new" aria-label="Raport nou"><Plus /></a>} />
      <Banner kind="info"><b>{VISIBILITY_LABEL.device}.</b> ShockGrid nu are încă o bază comună de rapoarte: nimeni altcineva nu le vede. Le poți exporta sau folosi pentru o sesizare oficială.</Banner>
      {drafts.length > 0 && <p className="small"><b>{drafts.length}</b> {drafts.length === 1 ? 'loc marcat așteaptă' : 'locuri marcate așteaptă'} completarea.</p>}
      {!reports.length ? (
        <div className="empty card"><Flag aria-hidden="true" /><p>Niciun raport. Apasă „Raportează” pe hartă când vezi o problemă.</p></div>
      ) : (
        <div className="list">
          {reports.map((r) => (
            <Item key={r.id} href={`#/report/${r.id}`} icon={r.status === 'draft' ? <Bookmark /> : <Flag />} tone={r.status === 'draft' ? undefined : 'danger'}
              title={r.status === 'draft' ? 'Marcaj de completat' : typeLabel(r.type)}
              sub={`${new Date(r.created_at).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}${r.source === 'shock' ? ' · confirmat după tură' : ''}${r.photo ? ' · cu fotografie' : ''} · doar pe telefon`} />
          ))}
        </div>
      )}
      {reports.length > 0 && <button className="btn block ghost" onClick={() => download(`rapoarte-shockgrid-${new Date().toISOString().slice(0, 10)}.geojson`, JSON.stringify(reportsGeoJSON(reports), null, 1), 'application/geo+json')}><Download /> Exportă (GeoJSON, fără fotografii)</button>}
    </div></main>
  );
}
