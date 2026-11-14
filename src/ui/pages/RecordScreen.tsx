import { Activity, Bookmark, MapPin, Pause, Play, RotateCcw, Square, Sun, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { requestMotionPermission, type SourceState } from '../../capture/recorder';
import { quickMark } from '../../services/reports';
import { discardRide, markRide, pauseRide, resumeRide, retryRideSources, rideActive, rideStats, startRide, stopRide, subscribeRide } from '../../services/ride';
import { saveReport } from '../../state/store';
import { fmt, fmtLen, shareOrDownload } from '../format';
import { Banner, Header, Stat, toast } from '../kit';
import { gpsQuality, useLocation } from '../map/me';
import { L, alive, useLayerGroup, useLeaflet } from '../map/useLeaflet';
import { go } from '../App';

const dur = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

export function RecordScreen() {
  const active = useSyncExternalStore(subscribeRide, rideActive);
  const [phase, setPhase] = useState<{ kind: 'idle' } | { kind: 'empty' } | { kind: 'processing'; stage: string; frac: number } | { kind: 'failed'; msg: string; zip: Uint8Array }>({ kind: 'idle' });
  if (phase.kind === 'processing') {
    return (
      <main className="screen"><div className="wrap stack">
        <h1>Se analizează tura…</h1>
        <p className="muted">Aceeași procesare ca la importul din Sensor Logger: vibrații pe ferestre, posibile denivelări, potrivire pe străzi.</p>
        <div className="progress" role="progressbar" aria-valuenow={Math.round(phase.frac * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.round(phase.frac * 100)}%` }} /></div>
        <p className="small muted">{phase.stage}</p>
      </div></main>
    );
  }
  if (phase.kind === 'empty') {
    return (
      <main className="screen"><div className="wrap stack">
        <Header title="Nu s-a înregistrat nimic" back="#/rides" />
        <Banner kind="warn">Telefonul nu a trimis nici poziții GPS, nici date de la senzorii de mișcare, așa că nu am salvat nicio tură.</Banner>
        <PermissionHelp need="both" />
        <button className="btn primary block" onClick={() => setPhase({ kind: 'idle' })}><RotateCcw /> Încearcă din nou</button>
      </div></main>
    );
  }
  if (phase.kind === 'failed') {
    return (
      <main className="screen"><div className="wrap stack">
        <Header title="Tura e salvată" back="#/rides" />
        <Banner kind="warn">Datele sunt păstrate pe telefon, dar analiza a eșuat: {phase.msg}</Banner>
        <button className="btn primary block" onClick={() => shareOrDownload(`shockgrid-${Date.now()}.zip`, phase.zip)}>Exportă tura (ZIP)</button>
      </div></main>
    );
  }
  return active ? <LiveView onStop={async () => {
    setPhase({ kind: 'processing', stage: 'Se salvează…', frac: 0.05 });
    const r = await stopRide((stage, frac) => setPhase({ kind: 'processing', stage, frac }));
    if (r.empty) { setPhase({ kind: 'empty' }); return; }
    if (!r.rideId) { setPhase({ kind: 'failed', msg: r.error ?? 'eroare necunoscută', zip: r.zip }); return; }
    go(r.shocks > 0 ? `/review/${r.rideId}` : `/ride/${r.rideId}`);
  }} /> : <PreRide />;
}

function PreRide() {
  const loc = useLocation(true); // încălzește GPS-ul înainte de plecare
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const q = gpsQuality(loc.fix?.acc);
  const motionApi = typeof DeviceMotionEvent !== 'undefined';
  const wake = 'wakeLock' in navigator;
  const [blocked, setBlocked] = useState<string | null>(null);
  const gpsBlocked = loc.status === 'denied' || loc.status === 'unsupported' || loc.status === 'insecure';
  const start = () => {
    const perm = requestMotionPermission(); // iOS: sincron, primul lucru din click
    setBusy(true);
    perm.then(async (p) => {
      const motionOk = p === 'granted';
      if (!motionOk && gpsBlocked) { setBlocked(p); return; } // nimic de înregistrat: nu pornim o tură goală
      setBlocked(null);
      if (!motionOk) toast(p === 'unsupported' ? 'Browserul nu oferă senzori de mișcare: se înregistrează doar GPS-ul.' : 'Fără acces la senzorii de mișcare: se înregistrează doar GPS-ul.');
      else if (gpsBlocked) toast('Fără acces la locație: vibrațiile se măsoară, dar tura nu va apărea pe hartă.');
      await startRide({ label: label || `Tură ${new Date().toLocaleDateString('ro-RO')}`, device: '', bike: '', mount: '', platform: navigator.platform });
    }).catch((e) => toast((e as Error).message)).finally(() => setBusy(false));
  };
  return (
    <main className="screen"><div className="wrap stack">
      <Header title="Pornește o tură" back="#/rides" />
      <div className="list">
        <div className="item"><span className={`ic ${loc.fix ? q.tone : 'warn'}`}><MapPin /></span><span className="grow"><div className="t">GPS</div><div className="s">{loc.fix ? q.label : loc.message ?? 'se caută…'}</div></span></div>
        <div className="item"><span className={`ic ${motionApi ? 'comfort' : 'danger'}`}><Activity /></span><span className="grow"><div className="t">Senzori de mișcare</div><div className="s">{motionApi ? 'disponibili (pe iPhone se cere permisiunea la pornire)' : 'indisponibili în acest browser'}</div></span></div>
        <div className="item"><span className={`ic ${wake ? 'comfort' : 'warn'}`}><Sun /></span><span className="grow"><div className="t">Ecran aprins</div><div className="s">{wake ? 'aplicația îl ține aprins cât timp e deschisă' : 'setează închiderea ecranului la 10 minute'}</div></span></div>
      </div>
      <Banner kind="info">Fixează telefonul ferm pe ghidon și <b>nu bloca ecranul</b>: un site web nu poate citi senzorii cu ecranul stins. Pentru ture lungi cu ecranul blocat, folosește Sensor Logger și importă tura.</Banner>
      {blocked && <><Banner kind="danger"><b>Nu putem înregistra:</b> locația e refuzată, iar senzorii de mișcare {blocked === 'unsupported' ? 'nu există în acest browser' : 'sunt refuzați'}.</Banner><PermissionHelp need="both" /></>}
      {!blocked && gpsBlocked && <details className="card"><summary>Locația e refuzată: cum o activezi</summary><PermissionHelp need="gps" /></details>}
      <label className="field"><span>Nume (opțional)</span><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Spre facultate" /></label>
      <button className="btn primary block lg" onClick={start} disabled={busy}><Play /> Pornește tura</button>
      <p className="xs muted">Datele se salvează doar pe acest telefon, la fiecare secundă. Dacă pagina se închide, tura poate fi recuperată din „Ture”.</p>
    </div></main>
  );
}

function LiveView({ onStop }: { onStop: () => void }) {
  const s = useSyncExternalStore(subscribeRide, rideStats);
  const [follow, setFollow] = useState(true);
  const [confirmStop, setConfirmStop] = useState(false);
  const { ref, map } = useLeaflet({ zoom: 16, onDrag: () => setFollow(false) });
  const me = useRef<L.CircleMarker | null>(null);
  useLayerGroup(map, (g) => {
    if (!s) return;
    if (s.track.length > 1) L.polyline(s.track, { color: '#1857f5', weight: 5, opacity: 0.9, interactive: false }).addTo(g);
    for (const c of s.live.candidates) if (c.lat !== null && c.lon !== null) L.circleMarker([c.lat, c.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#e8590c', fillOpacity: 1, interactive: false }).addTo(g);
  }, [s?.track.length, s?.live.candidates.length]);
  useEffect(() => {
    if (!alive(map) || !s?.lastFix) return;
    const ll: [number, number] = [s.lastFix.lat, s.lastFix.lon];
    if (!me.current) me.current = L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: '#1857f5', fillOpacity: 1 }).addTo(map);
    else me.current.setLatLng(ll);
    if (follow) map.setView(ll, Math.max(16, map.getZoom()));
  }, [map, s?.lastFix?.lat, s?.lastFix?.lon, follow]);
  if (!s) return null;
  const q = gpsQuality(s.acc);
  const paused = s.state === 'paused';
  const src: SourceState = s.sources;
  const status = paused ? 'Pauză'
    : src === 'waiting' ? 'Se pornesc senzorii…'
      : src === 'none' ? 'Nu se înregistrează nimic'
        : !s.live.moving && s.live.stoppedFor_s > 15 ? 'Oprit — se înregistrează în continuare'
          : src === 'gps_only' ? 'Se înregistrează doar traseul'
            : src === 'imu_only' ? 'Se înregistrează fără GPS'
              : 'Se înregistrează';
  const retry = () => {
    const perm = requestMotionPermission(); // iOS: sincron, din click
    retryRideSources();
    perm.then((p) => { if (p !== 'granted' && s.imu !== 'ok') toast('Senzorii de mișcare sunt tot blocați: vezi pașii de mai jos.'); }).catch(() => {});
  };
  const cands = s.live.candidates.filter((c) => !c.review).length;
  const mark = async () => {
    markRide('marcaj pentru raport');
    if (s.lastFix) { await saveReport(quickMark(s.lastFix.lat, s.lastFix.lon, s.lastFix.acc)); toast('Marcat. Completezi raportul după tură.'); }
    else toast('Nu avem încă poziția GPS.');
  };
  return (
    <main className="screen-map no-nav" aria-label="Tură în curs">
      <div ref={ref} className="map" />
      <div className="live-top">
        <span className="chip live" role="status"><span className="rec-dot" aria-hidden="true" /> {status}</span>
        <span className={`chip`}>GPS {q.label}</span>
        {!follow && <button className="chip" onClick={() => setFollow(true)}>Recentrează</button>}
      </div>
      <div className="live-panel">
        {src === 'none' && !paused ? (
          <div className="stack" style={{ marginBottom: 10 }}>
            <div className="alert-strip" role="alert"><b>Nu se înregistrează nimic:</b> {s.gps === 'denied' ? 'locația e refuzată' : 'nu primim GPS'} și senzorii de mișcare nu trimit date.</div>
            <details className="card"><summary>Cum activezi locația și senzorii</summary><PermissionHelp need="both" /></details>
            <div className="grid2">
              <button className="btn primary" onClick={retry}><RotateCcw /> Reîncearcă</button>
              <button className="btn" onClick={() => { void discardRide(); toast('Tura goală a fost anulată.'); }}><Trash2 /> Renunță</button>
            </div>
          </div>
        ) : (src === 'gps_only' || src === 'imu_only') && !paused ? (
          <div style={{ marginBottom: 10 }}>
            <div className="alert-strip" role="alert">{src === 'gps_only'
              ? <><b>Doar GPS:</b> traseul se salvează, dar fără confort și fără denivelări (senzorii de mișcare nu trimit date).</>
              : <><b>Fără GPS:</b> {s.gps === 'denied' ? 'locația e refuzată' : 'nu primim semnal GPS'}. Vibrațiile se măsoară, dar tura nu va apărea pe hartă.</>}</div>
            <details className="card" style={{ marginTop: 8 }}><summary>Cum repari</summary><PermissionHelp need={src === 'gps_only' ? 'motion' : 'gps'} /><button className="btn sm block" style={{ marginTop: 8 }} onClick={retry}><RotateCcw /> Reîncearcă</button></details>
          </div>
        ) : s.problems.length > 0 ? <div className="alert-strip" role="alert" style={{ marginBottom: 10 }}>{s.problems[0]}</div>
          : s.wakeLock !== 'on' && s.wakeLock !== 'unsupported' ? <div className="alert-strip" style={{ marginBottom: 10 }}>Ține ecranul aprins: altfel senzorii se opresc.</div> : null}
        <div className="grid3">
          <Stat v={s.speed !== null && s.speed >= 0 ? fmt(s.speed * 3.6, 0) : '—'} unit="km/h" l="viteză" />
          <Stat v={fmtLen(s.live.distance)} l="distanță" />
          <Stat v={dur(s.elapsed_s)} l="durată" />
        </div>
        <p className="small" style={{ margin: '10px 2px' }}>
          {cands > 0 ? <><b style={{ color: 'var(--warn)' }}>{cands} {cands === 1 ? 'posibilă denivelare' : 'posibile denivelări'}</b> — le verifici după tură.</> : 'Nicio denivelare candidată încă.'}
        </p>
        {!confirmStop ? (
          <div className="grid3">
            {paused ? <button className="btn" onClick={resumeRide}><Play /> Reia</button> : <button className="btn" onClick={pauseRide}><Pause /> Pauză</button>}
            <button className="btn" onClick={mark} aria-label="Marchează locul pentru un raport mai târziu"><Bookmark /> Marchează</button>
            <button className="btn danger" onClick={() => setConfirmStop(true)}><Square /> Stop</button>
          </div>
        ) : (
          <div className="grid2">
            <button className="btn" onClick={() => setConfirmStop(false)}><X /> Continuă</button>
            <button className="btn primary" onClick={onStop}><Square /> Termină tura</button>
          </div>
        )}
      </div>
    </main>
  );
}

/** Pașii concreți de recuperare a permisiunilor (iPhone și Android). */
export function PermissionHelp({ need }: { need: 'gps' | 'motion' | 'both' }) {
  const gps = need !== 'motion', motion = need !== 'gps';
  return (
    <div className="small stack" style={{ gap: 6 }}>
      <div><b>iPhone</b></div>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {gps && <li>Setări → Confidențialitate și securitate → Servicii de localizare: <b>activat</b>; la „Site-uri Safari”: <b>Când se folosește aplicația</b>.</li>}
        {gps && <li>Setări → Aplicații → Safari → Localizare: <b>Întreabă</b> sau <b>Permite</b>.</li>}
        {motion && <li>Setări → Aplicații → Safari → <b>Acces la mișcare și orientare</b>: activat.</li>}
        <li>Închide complet ShockGrid (glisează-l din comutatorul de aplicații), redeschide-l și apasă <b>Permite</b> la întrebări.</li>
      </ol>
      <div><b>Samsung / Android (Chrome)</b></div>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        <li>În Chrome: iconița din stânga adresei → Permisiuni{gps ? ' → Locație: Permite' : ''}{motion ? ' → Senzori de mișcare: Permite' : ''}.</li>
        <li>Aplicație instalată: ține apăsat pe iconiță → Informații aplicație → Permisiuni.</li>
        {gps && <li>Locația telefonului trebuie să fie pornită (bara de notificări → Locație).</li>}
      </ol>
      <p className="xs muted" style={{ margin: 0 }}>Numele exacte ale meniurilor pot diferi ușor între versiuni.</p>
    </div>
  );
}
