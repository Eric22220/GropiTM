import { comfortGeoJSON, comfortRows, zoneRows, zonesGeoJSON } from '../../core/export';
import { t } from '../../i18n/ro';
import { useApp } from '../../state/store';
import { download, fmt } from '../format';

export function AboutPage() {
  const graph = useApp((s) => s.graph);
  const graphStatus = useApp((s) => s.graphStatus);
  const layer = useApp((s) => s.layer);
  const snapshot = useApp((s) => s.snapshot);
  const rides = useApp((s) => s.rides);
  const evalResults = useApp((s) => s.evalResults) as Record<string, unknown> | null;
  const gm = graph?.json.meta;
  const nSL = rides.filter((r) => r.processed.meta.source === 'sensorlogger').length;
  return (
    <div className="stack">
      <h1>{t.nav.about}</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Surse</h2>
        <dl className="kv small">
          <dt>măsurători</dt><dd>turele importate pe acest dispozitiv: {rides.length} ({nSL} din Sensor Logger); stratul publicat (snapshot): {snapshot ? `${snapshot.meta.ride_ids.length} ture, generat ${snapshot.meta.generated_at.slice(0, 10)}` : 'nepublicat încă'}</dd>
          <dt>rețeaua de străzi</dt><dd>{gm ? <>OpenStreetMap, descărcat {gm.downloaded_at.slice(0, 10)}; {gm.stats?.edges} muchii, {gm.stats?.km_total} km; {gm.attribution}, {gm.license}</> : graphStatus === 'loading' ? t.common.loading : 'indisponibil încă'}</dd>
          <dt>colectare</dt><dd>pilotul folosește aplicația gratuită Sensor Logger pentru înregistrare; ShockGrid face procesarea după import (nu telemetrie live)</dd>
          <dt>versiunea procesării</dt><dd>{layer.processing_version}</dd>
          <dt>pragurile claselor (rms_v, m/s²)</dt><dd>A &lt; {fmt(layer.thresholds[0], 2)} ≤ B &lt; {fmt(layer.thresholds[1], 2)} ≤ C &lt; {fmt(layer.thresholds[2], 2)} ≤ D &lt; {fmt(layer.thresholds[3], 2)} ≤ E · {layer.thresholds_source}</dd>
          <dt>versiunea stratului</dt><dd>{layer.version} · {layer.n_valid_windows} ferestre valide agregate</dd>
        </dl>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Ce înseamnă cifrele</h2>
        <ul className="small">
          <li><b>RVI</b> (Relative Vibration Index) = RMS-ul accelerației verticale filtrate (&gt; 4 Hz) pe ferestre de 2 s, mediana pe segment. E <b>relativ</b>: valabil pentru combinația telefon + bicicletă + suport + viteză în care a fost măsurat.</li>
          <li><b>Măsurat</b> = cel puțin 3 ferestre valide și 2 treceri distincte, GPS median ≤ 10 m, viteză 2,5–9 m/s. <b>Încredere scăzută</b> = are date, dar nu toate condițiile. <b>Necunoscut</b> = fără date: nu primește culoare și nu e „neted”.</li>
          <li>Doza de vibrații e inspirată din ISO 2631-1, <b>neponderată</b> în frecvență; nu e „conform ISO”.</li>
          <li>Zonele cu șoc sunt „șoc posibil”, nu „groapă”: nu identificăm tipul obstacolului; cercul e incertitudinea poziției GPS.</li>
          <li><b>Confortul nu e siguranță.</b> Nu avem date de accidente; nu promitem rute „mai sigure”.</li>
        </ul>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Exporturi pentru preluare (ODbL)</h2>
        <p className="small muted">Doar muchiile MEASURED și LOW_CONFIDENCE, agregate, fără timpi individuali. Pot deveni un strat pentru departamentul responsabil de infrastructura velo sau o listă pentru Sesizări.</p>
        <div className="row">
          <button disabled={!graph} onClick={() => download('comfort-layer.geojson', JSON.stringify(comfortGeoJSON(layer, graph!)), 'application/geo+json')}>comfort-layer.geojson</button>
          <button onClick={() => download('comfort-layer.json', JSON.stringify({ meta: { processing_version: layer.processing_version, thresholds: layer.thresholds, license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors' }, edges: comfortRows(layer) }), 'application/json')}>comfort-layer.json</button>
          <button onClick={() => download('shock-zones.geojson', JSON.stringify(zonesGeoJSON(layer)), 'application/geo+json')}>shock-zones.geojson</button>
          <button onClick={() => download('shock-zones.json', JSON.stringify(zoneRows(layer)), 'application/json')}>shock-zones.json</button>
        </div>
        <p className="small">Pentru o problemă concretă în spațiul public, folosește canalul oficial: <a href="https://sesizari.primariatm.ro/" target="_blank" rel="noopener">sesizari.primariatm.ro</a>. ShockGrid nu trimite sesizări automat.</p>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Validare</h2>
        {evalResults ? <pre>{JSON.stringify(evalResults, null, 2)}</pre> : <p className="small">Rezultatele de validare (<code>npm run validate</code>) apar aici după turele de teren. Încă nu există rezultate publicate: nu afișăm cifre inventate.</p>}
      </div>
      <div className="card" id="privacy">
        <h2 style={{ marginTop: 0 }}>Ce date stocăm</h2>
        <ul className="small">
          <li><b>Ce:</b> turele importate sau înregistrate (accelerație, giroscop, poziții GPS, timpi), rezultatele procesării și setările.</li>
          <li><b>Unde:</b> doar pe acest dispozitiv, în IndexedDB-ul browserului. Nimic nu se încarcă automat. În repository se publică doar stratul agregat pe segmente, fără timpi individuali, fără ID-uri de dispozitiv și fără primii și ultimii 200 m ai fiecărei ture.</li>
          <li><b>Pentru ce:</b> harta de confort, rutarea și comparația traseelor.</li>
          <li><b>Cât timp:</b> până le ștergi (pe tură în „Ture” sau totul în „Setări”).</li>
          <li>Fără analytics, trackere, fonturi sau scripturi terțe. Singurele cereri externe sunt tile-urile OpenStreetMap.</li>
        </ul>
      </div>
      <p className="small muted">Cod: MIT. Date derivate din OpenStreetMap (graful, stratul de confort, zonele cu șoc): ODbL 1.0, © OpenStreetMap contributors. Inspirație: SmartRoadSense (Universitatea din Urbino), pentru mașini; aici adaptat la bicicletă.</p>
    </div>
  );
}
