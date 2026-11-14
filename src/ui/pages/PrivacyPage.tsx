import { useState } from 'react';
import { wipeAll } from '../../state/store';
import { Header, toast } from '../kit';

export function PrivacyPage() {
  const [done, setDone] = useState(false);
  return (
    <main className="screen"><div className="wrap stack">
      <Header title="Confidențialitate" back="#/more" />
      <div className="card small stack">
        <p><b>Ce stocăm:</b> turele tale (accelerație, giroscop, poziții GPS, ore), rapoartele tale (poziție, tip, descriere, fotografie opțională), destinațiile recente și setările.</p>
        <p><b>Unde:</b> doar pe acest telefon, în browser (IndexedDB). Nimic nu se încarcă automat pe vreun server.</p>
        <p><b>Locația live:</b> se citește doar când apeși „Locația mea”, planifici de la locația ta sau pornești o tură, și se oprește când nu mai e folosită. Nu se trimite nicăieri.</p>
        <p><b>Căutarea de adrese:</b> textul pe care îl scrii (de la 3 litere) e trimis serviciului public Photon (komoot) ca să găsim adresa. Poziția ta nu e trimisă.</p>
        <p><b>Fotografiile</b> din rapoarte sunt micșorate și re-encodate, ceea ce elimină coordonatele GPS din fișier.</p>
        <p><b>Cât timp:</b> până le ștergi. Pe iPhone, Safari poate șterge datele site-urilor neinstalate nefolosite 7 zile; adaugă aplicația pe ecranul principal.</p>
        <p><b>Fără</b> conturi, analytics, trackere, fonturi sau scripturi de la terți. Cereri externe: tile-urile OpenStreetMap, căutarea Photon și, doar la cerere, lista de cartiere a Primăriei.</p>
      </div>
      <button className="btn danger block" disabled={done} onClick={async () => { if (confirm('Ștergi TOATE datele ShockGrid de pe acest telefon (ture, rapoarte, setări)? Nu se poate anula.')) { await wipeAll(); setDone(true); toast('Toate datele locale au fost șterse.'); } }}>Șterge toate datele de pe acest telefon</button>
    </div></main>
  );
}
