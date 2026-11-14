import { BookOpen, Database, Flag, Lock, Wrench } from 'lucide-react';
import { useApp } from '../../state/store';
import { Item } from '../kit';

export function MorePage() {
  const reports = useApp((s) => s.reports);
  return (
    <main className="screen"><div className="wrap stack">
      <h1>Mai mult</h1>
      <div className="list">
        <Item href="#/reports" icon={<Flag />} tone="danger" title="Rapoartele mele" sub={reports.length ? `${reports.length} pe acest telefon` : 'Problemele pe care le-ai semnalat'} />
      </div>
      <div className="section-label">Despre</div>
      <div className="list">
        <Item href="#/more/method" icon={<BookOpen />} tone="primary" title="Cum măsurăm confortul" sub="Metodologia, pe scurt și în detaliu" />
        <Item href="#/more/data" icon={<Database />} tone="comfort" title="Date și surse" sub="Ce e publicat, exporturi GeoJSON pentru instituții" />
        <Item href="#/more/privacy" icon={<Lock />} title="Confidențialitate" sub="Ce date stocăm și unde" />
      </div>
      <div className="section-label">Pentru echipă și testare</div>
      <div className="list">
        <Item href="#/more/advanced" icon={<Wrench />} tone="warn" title="Instrumente avansate" sub="Diagnostic senzori, parametri, validare" />
      </div>
      <p className="xs muted" style={{ textAlign: 'center', marginTop: 24 }}>ShockGrid {__APP_VERSION__} · UniHack 2026 · cod MIT, date © OpenStreetMap contributors (ODbL)</p>
    </div></main>
  );
}
