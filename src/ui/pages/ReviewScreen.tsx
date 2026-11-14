import { CheckCircle2, HelpCircle, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Shock } from '../../core/types';
import { nearestStreetName } from '../../services/geocode';
import { intensity, REPORT_TYPES, shockKey, type ReviewAnswer } from '../../services/reports';
import type { ReportType } from '../../storage/idb';
import { reviewShock, useApp } from '../../state/store';
import { Banner, Header } from '../kit';
import { L, useLayerGroup, useLeaflet } from '../map/useLeaflet';

export function ReviewScreen({ id }: { id?: string }) {
  const ride = useApp((s) => s.rides.find((r) => r.ride_id === id));
  const reviews = useApp((s) => s.reviews);
  const graph = useApp((s) => s.graph);
  const shocks = useMemo(() => (ride?.processed.shocks ?? []).filter((s) => s.located).sort((a, b) => a.t - b.t), [ride]);
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  if (!ride) return <main className="screen"><div className="wrap"><Header title="Verificare" back="#/rides" /><p>Tura nu există pe acest telefon.</p></div></main>;
  const pending = shocks.filter((s) => !reviews[shockKey(ride.ride_id, s.id)]).length;
  if (!shocks.length) return <main className="screen"><div className="wrap stack"><Header title="Nicio denivelare" back={`#/ride/${ride.ride_id}`} /><p>Algoritmul nu a observat șocuri candidate în această tură.</p><a className="btn primary block" href={`#/ride/${ride.ride_id}`}>Vezi tura</a></div></main>;

  if (!started) {
    return (
      <main className="screen"><div className="wrap stack">
        <Header title="Tura s-a încheiat" back={`#/ride/${ride.ride_id}`} />
        <div className="card tint-warn">
          <h2 style={{ marginTop: 0 }}>Am observat {shocks.length} {shocks.length === 1 ? 'posibilă denivelare' : 'posibile denivelări'}. Vrei să le verifici?</h2>
          <p className="small">Sunt șocuri puternice detectate de accelerometru. Pot fi gropi, capace, rosturi — sau doar o bordură coborâtă intenționat. Tu știi cel mai bine ce ai întâlnit.</p>
          {pending < shocks.length && <p className="small">Ai verificat deja {shocks.length - pending}.</p>}
        </div>
        <button className="btn primary block lg" onClick={() => { setStarted(true); setI(Math.max(0, shocks.findIndex((s) => !reviews[shockKey(ride.ride_id, s.id)]))); }}>Verifică acum</button>
        <a className="btn block ghost" href={`#/ride/${ride.ride_id}`}>Mai târziu</a>
      </div></main>
    );
  }
  if (i >= shocks.length) {
    const yes = shocks.filter((s) => reviews[shockKey(ride.ride_id, s.id)]?.answer === 'yes').length;
    return (
      <main className="screen"><div className="wrap stack">
        <Header title="Mulțumim!" />
        <Banner kind="ok">Ai confirmat {yes} {yes === 1 ? 'problemă' : 'probleme'}. {yes > 0 && 'Le găsești în „Rapoartele mele”, salvate doar pe acest telefon.'}</Banner>
        {yes > 0 && <a className="btn primary block" href="#/reports">Rapoartele mele</a>}
        <a className="btn block" href={`#/ride/${ride.ride_id}`}>Vezi tura</a>
      </div></main>
    );
  }
  const s = shocks[i];
  return (
    <main className="screen"><div className="wrap stack">
      <Header title={`Denivelarea ${i + 1} din ${shocks.length}`} back={`#/ride/${ride.ride_id}`} />
      <ShockCard key={s.id} s={s} street={graph && s.lat !== null ? nearestStreetName(graph, s.lat, s.lon!) : null} prev={reviews[shockKey(ride.ride_id, s.id)]?.answer}
        onAnswer={async (a, type) => { await reviewShock(ride.ride_id, s, a, type); setI(i + 1); }} onSkip={() => setI(i + 1)} />
    </div></main>
  );
}

function ShockCard({ s, street, prev, onAnswer, onSkip }: { s: Shock; street: string | null; prev?: ReviewAnswer; onAnswer: (a: ReviewAnswer, t?: ReportType) => void; onSkip: () => void }) {
  const [askType, setAskType] = useState(false);
  const { ref, map } = useLeaflet({ zoom: 17, center: [s.lat!, s.lon!], interactive: false });
  useLayerGroup(map, (g) => {
    L.circle([s.lat!, s.lon!], { radius: Math.max(5, s.r ?? 10), color: '#e8590c', weight: 2, fillOpacity: 0.15 }).addTo(g);
    L.circleMarker([s.lat!, s.lon!], { radius: 8, color: '#fff', weight: 3, fillColor: '#e8590c', fillOpacity: 1 }).addTo(g);
  }, []);
  const it = intensity(s.peak);
  return (
    <div className="stack">
      <div ref={ref} className="map inline" role="img" aria-label="Locul aproximativ al denivelării" />
      <div className="card">
        <dl className="kv">
          <dt>Ora</dt><dd>{new Date(s.t).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</dd>
          <dt>Loc aproximativ</dt><dd>{street ?? 'stradă necunoscută'} (±{Math.round(s.r ?? 10)} m)</dd>
          <dt>Intensitate</dt><dd><div className="row nowrap"><span>{it.level}</span><div className="bar grow" style={{ maxWidth: 140 }}><i style={{ width: `${it.pct * 100}%`, background: '#e8590c' }} /></div></div></dd>
          {s.needs_review && <><dt>Notă</dt><dd className="small">măsurătoare mai puțin sigură (viteză sau mișcarea telefonului)</dd></>}
        </dl>
      </div>
      {!askType ? (
        <>
          <h2 style={{ margin: '6px 0 0' }}>Ai întâlnit o problemă a drumului aici?</h2>
          {prev && <p className="small muted">Răspunsul tău anterior: {prev === 'yes' ? 'Da' : prev === 'no' ? 'Nu' : 'Nu sunt sigur'}</p>}
          <div className="grid3">
            <button className="btn comfort" onClick={() => setAskType(true)}><ThumbsUp /> Da</button>
            <button className="btn" onClick={() => onAnswer('no')}><ThumbsDown /> Nu</button>
            <button className="btn" onClick={() => onAnswer('unsure')}><HelpCircle /> Nu știu</button>
          </div>
          <button className="btn ghost block sm" onClick={onSkip}>Sari peste</button>
        </>
      ) : (
        <>
          <h2 style={{ margin: '6px 0 0' }}>Ce ai întâlnit?</h2>
          <div className="choice-grid">
            {REPORT_TYPES.map((x) => <button key={x.id} className="choice" onClick={() => onAnswer('yes', x.id)}><b>{x.label}</b>{x.hint && <span>{x.hint}</span>}</button>)}
          </div>
          <button className="btn ghost block" onClick={() => setAskType(false)}><CheckCircle2 /> Înapoi</button>
        </>
      )}
    </div>
  );
}
