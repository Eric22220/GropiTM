import { Download } from 'lucide-react';
import { comfortGeoJSON, comfortRows, zoneRows, zonesGeoJSON } from '../../core/export';
import { useApp } from '../../state/store';
import { download } from '../format';
import { Banner, Header } from '../kit';

export function DataPage() {
  const graph = useApp((s) => s.graph);
  const layer = useApp((s) => s.layer);
  const snapshot = useApp((s) => s.snapshot);
  const rides = useApp((s) => s.rides);
  const reports = useApp((s) => s.reports);
  const gm = graph?.json.meta;
  const pub = snapshot?.meta.ride_ids.length ?? 0;
  return (
    <main className="screen"><div className="wrap stack">
      <Header title="Date și surse" back="#/more" />
      <h2>Ce e public și ce e doar al tău</h2>
      <div className="card stack">
        <div><span className="badge comfort">Public</span> <b>Stratul publicat de echipă</b><p className="small muted" style={{ margin: '4px 0 0' }}>{pub ? `${pub} ture, actualizat ${snapshot!.meta.generated_at.slice(0, 10)}.` : 'Încă nicio tură publicată.'} Conține doar valori agregate pe segmente de stradă: fără trasee, fără ore, fără telefoane, fără începutul și sfârșitul turelor.</p></div>
        <div><span className="badge">Doar pe acest telefon</span> <b>Turele tale ({rides.length}) și rapoartele tale ({reports.length})</b><p className="small muted" style={{ margin: '4px 0 0' }}>Rămân în browser (IndexedDB). Nu se încarcă nicăieri automat și nu le vede nimeni altcineva.</p></div>
      </div>
      <Banner kind="info">ShockGrid nu are deocamdată o bază comună de rapoarte. Raportările comunitare ar avea nevoie de un server cu moderare și protecție anti-spam; până atunci, problemele concrete merg pe canalul oficial <a href="https://sesizari.primariatm.ro/" target="_blank" rel="noopener">Sesizări</a>.</Banner>
      <h2>Surse</h2>
      <dl className="kv">
        <dt>Străzi</dt><dd>OpenStreetMap{gm ? `, descărcat ${gm.downloaded_at.slice(0, 10)}` : ''} · © OpenStreetMap contributors, ODbL</dd>
        <dt>Măsurători</dt><dd>Ture ale echipei (Sensor Logger și înregistratorul ShockGrid), procesate în aplicație</dd>
        <dt>Căutare adrese</dt><dd>Străzi: local, din OpenStreetMap. Adrese și locuri: Photon (komoot), pe baza OpenStreetMap</dd>
        <dt>Hartă de fundal</dt><dd>Tile-uri OpenStreetMap</dd>
      </dl>
      <p className="small">Exporturile pentru instituții (GeoJSON/JSON) sunt în Mai mult → Instrumente avansate.</p>
      <p className="xs muted">Cod: MIT. Date derivate din OpenStreetMap: ODbL 1.0.</p>
    </div></main>
  );
}

/** Exporturile pentru instituții (în Instrumente avansate). */
export function ExportsPage() {
  const graph = useApp((s) => s.graph);
  const layer = useApp((s) => s.layer);
  return (
    <main className="screen"><div className="wrap stack">
      <Header title="Exporturi pentru instituții" back="#/more/advanced" />
      <p className="small muted">Segmentele cu date (agregate) și zonele cu șocuri, în formatele GeoJSON și JSON, licență ODbL. Includ și turele tale locale dacă sunt activate în hartă.</p>
      <div className="grid2">
        <button className="btn" disabled={!graph} onClick={() => download('comfort-layer.geojson', JSON.stringify(comfortGeoJSON(layer, graph!)), 'application/geo+json')}><Download /> Confort .geojson</button>
        <button className="btn" onClick={() => download('comfort-layer.json', JSON.stringify({ meta: { processing_version: layer.processing_version, thresholds: layer.thresholds, license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors' }, edges: comfortRows(layer) }), 'application/json')}><Download /> Confort .json</button>
        <button className="btn" onClick={() => download('shock-zones.geojson', JSON.stringify(zonesGeoJSON(layer)), 'application/geo+json')}><Download /> Șocuri .geojson</button>
        <button className="btn" onClick={() => download('shock-zones.json', JSON.stringify(zoneRows(layer)), 'application/json')}><Download /> Șocuri .json</button>
      </div>
      <p className="xs muted">Cod: MIT. Date derivate din OpenStreetMap: ODbL 1.0.</p>
    </div></main>
  );
}
