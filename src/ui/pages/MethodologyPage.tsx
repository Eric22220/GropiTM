import { CLASSES } from '../../core/aggregate';
import { t } from '../../i18n/ro';
import { useApp } from '../../state/store';
import { CLASS_COLORS, fmt } from '../format';
import { ClassBadge, Header } from '../kit';

export function MethodologyPage() {
  const layer = useApp((s) => s.layer);
  return (
    <main className="screen"><div className="wrap stack">
      <Header title="Cum măsurăm confortul" back="#/more" />
      <p>Telefonul fixat pe ghidon simte fiecare zdruncinătură. ShockGrid transformă aceste vibrații într-un indice de confort pentru fiecare bucată de stradă pe care ai mers.</p>
      <div className="card stack">
        {CLASSES.map((c) => <div key={c} className="row nowrap"><ClassBadge c={c} /><div><b>{t.classShort[c]}</b><div className="small muted">{t.classPlain[c]}</div></div></div>)}
      </div>
      <h2>Ce înseamnă culorile</h2>
      <ul className="small" style={{ paddingLeft: 18 }}>
        <li><b>Linie plină</b>: segment măsurat de cel puțin 2 ori, cu GPS bun.</li>
        <li><b>Linie întreruptă</b>: puține măsurători (o singură trecere, GPS slab sau nu știm sigur dacă era trotuarul ori carosabilul).</li>
        <li><b>Fără culoare</b>: nemăsurat. Nu înseamnă că strada e netedă.</li>
        <li><b>Puncte portocalii</b>: șocuri puternice detectate automat. Nu știm tipul obstacolului până nu confirmă cineva.</li>
      </ul>
      <h2>Limite oneste</h2>
      <ul className="small" style={{ paddingLeft: 18 }}>
        <li>Indicele e <b>relativ</b>: depinde de telefon, bicicletă, suport și viteză. Nu compară două biciclete diferite.</li>
        <li><b>Confortul nu e siguranță.</b> Nu avem date de accidente și nu recomandăm rute „mai sigure”.</li>
        <li>Rutele de confort apar doar unde avem destule măsurători.</li>
      </ul>
      <details className="card">
        <summary>Detalii tehnice (RVI)</summary>
        <div className="small stack">
          <p><b>RVI (Relative Vibration Index)</b> = RMS-ul accelerației verticale, filtrată trece-sus peste 4 Hz (ca să eliminăm pedalarea și balansul corpului), pe ferestre de 2 s cu pas de 1 s. Direcția verticală se estimează din gravitație, deci nu contează cum e orientat telefonul. Pe un segment folosim mediana ferestrelor valide.</p>
          <p>Ferestrele se exclud la viteză sub 2,5 m/s sau peste 9 m/s, la goluri în date, la rotații bruște ale telefonului (&gt; 300 °/s, mâna, nu drumul) sau la mutarea telefonului în suport. Șocurile punctuale folosesc un prag adaptiv local (6 deviații robuste și minim 4 m/s²) și grupează lovitura roții din față cu cea din spate.</p>
          <p>Pragurile claselor (rms_v, m/s²): {layer.thresholds.map((x, i) => <span key={i} style={{ color: CLASS_COLORS[CLASSES[i]] }}>{i ? ' · ' : ''}{CLASSES[i]}/{CLASSES[i + 1]} {fmt(x, 2)}</span>)} ({layer.thresholds_source}).</p>
          <p>Doza de vibrații a unui traseu e inspirată din ISO 2631-1 (VDV), fără ponderarea în frecvență a standardului. Versiunea algoritmului: {layer.processing_version}.</p>
          <p>Inspirație: SmartRoadSense (Universitatea din Urbino), pentru mașini; aici adaptat la bicicletă, cu separarea clară între măsurat, estimat și necunoscut.</p>
        </div>
      </details>
    </div></main>
  );
}
