import { Activity, Download, FlaskConical, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../state/store';
import { Header, Item } from '../kit';
import { ExportsPage } from './DataPage';
import { DiagnosticPage } from './DiagnosticPage';
import { SettingsPage } from './SettingsPage';

export function AdvancedPage({ sub }: { sub?: string }) {
  const evalResults = useApp((s) => s.evalResults);
  const graph = useApp((s) => s.graph);
  if (sub === 'diag') return <main className="screen"><div className="wrap"><Header title="Diagnostic senzori" back="#/more/advanced" /><DiagnosticPage /></div></main>;
  if (sub === 'settings') return <main className="screen"><div className="wrap"><Header title="Parametri" back="#/more/advanced" /><SettingsPage /></div></main>;
  if (sub === 'exports') return <ExportsPage />;
  if (sub === 'validation') return (
    <main className="screen"><div className="wrap stack"><Header title="Validare" back="#/more/advanced" />
      {evalResults ? <pre>{JSON.stringify(evalResults, null, 2)}</pre> : <p className="small">Rezultatele <code>npm run validate</code> apar aici după turele de teren publicate. Încă nu există: nu afișăm cifre inventate.</p>}
    </div></main>
  );
  const st = graph?.json.meta.stats;
  return (
    <main className="screen"><div className="wrap stack">
      <Header title="Instrumente avansate" back="#/more" />
      <p className="small muted">Pentru echipă și testare. Nimic de aici nu e secret: aplicația publică poate fi inspectată de oricine.</p>
      <div className="list">
        <Item href="#/more/advanced/diag" icon={<Activity />} tone="primary" title="Diagnostic senzori și GPS" sub="Frecvență, permisiuni, rotunjire" />
        <Item href="#/more/advanced/settings" icon={<SlidersHorizontal />} title="Parametri algoritm" sub="VibrationConfig, praguri, ștergere date" />
        <Item href="#/more/advanced/validation" icon={<FlaskConical />} tone="comfort" title="Validare" sub="Repetabilitate, referințe, map-matching" />
        <Item href="#/more/advanced/exports" icon={<Download />} title="Exporturi pentru instituții" sub="Stratul de confort și zonele cu șocuri, GeoJSON/JSON" />
      </div>
      {st && <p className="xs muted">Graf OSM: {st.edges} muchii, {st.km_total} km, {st.km_sidewalk_separate} km trotuare desenate separat, {st.km_cycleway} km piste.</p>}
    </div></main>
  );
}
