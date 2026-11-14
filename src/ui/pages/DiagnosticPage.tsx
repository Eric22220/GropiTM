import { Fragment, useState } from 'react';
import { requestMotionPermission } from '../../capture/recorder';

const GEO_CODES: Record<number, string> = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };

export function DiagnosticPage() {
  const [lines, setLines] = useState<[string, string][]>(() => base());
  const [geoCode, setGeoCode] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const add = (k: string, v: string) => setLines((l) => [...l.filter(([x]) => x !== k), [k, v]]);

  const run = () => {
    const perm = requestMotionPermission(); // primul apel, sincron (iOS)
    setRunning(true);
    perm.then((p) => {
      add('permisiune mișcare', p);
      if (p !== 'granted') { setRunning(false); return; }
      const ts: number[] = [];
      let tenth = true, seen = 0, hasAG = false, hasRot = false;
      const on = (e: DeviceMotionEvent) => {
        ts.push(performance.now());
        const g = e.accelerationIncludingGravity;
        if (g && g.x !== null) {
          hasAG = true;
          seen++;
          for (const v of [g.x, g.y, g.z]) if (v !== null && Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) tenth = false;
        }
        if (e.rotationRate && e.rotationRate.alpha !== null) hasRot = true;
      };
      addEventListener('devicemotion', on);
      setTimeout(() => {
        removeEventListener('devicemotion', on);
        const dur = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / 1000 : 0;
        add('frecvență măsurată (5 s)', dur ? `${(ts.length - 1) / dur > 0 ? ((ts.length - 1) / dur).toFixed(1) : 0} Hz (${ts.length} evenimente)` : '0 Hz — niciun eveniment');
        add('accelerationIncludingGravity', hasAG ? 'da' : 'nu');
        add('rotationRate', hasRot ? 'da' : 'nu');
        if (seen > 20) add('rotunjire', tenth ? 'Browserul rotunjește la 0,1 m/s²' : 'fără rotunjire la 0,1');
        setRunning(false);
      }, 5000);
    }).catch((e) => { add('permisiune mișcare', 'eroare: ' + (e as Error).message); setRunning(false); });

    // geolocație
    if (!isSecureContext) { setGeoCode('INSECURE_CONTEXT'); add('geolocație', 'INSECURE_CONTEXT'); }
    else if (!('geolocation' in navigator)) { setGeoCode('UNSUPPORTED'); add('geolocație', 'UNSUPPORTED'); }
    else {
      navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then((s) => add('permisiune geolocație', s.state)).catch(() => add('permisiune geolocație', 'nu poate fi citită'));
      navigator.geolocation.getCurrentPosition(
        (p) => { setGeoCode('OK'); add('geolocație', `OK: precizie ${p.coords.accuracy.toFixed(0)} m, viteză ${p.coords.speed ?? 'necunoscută'}`); },
        (e) => { const c = GEO_CODES[e.code] ?? String(e.code); setGeoCode(c); add('geolocație', `${c} (${e.code}): ${e.message}`); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    }
  };

  const text = lines.map(([k, v]) => `${k}: ${v}`).join('\n');
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return (
    <div className="stack">
      <h1>Diagnostic</h1>
      <button className="primary big" onClick={run} disabled={running}>{running ? 'Se măsoară 5 s… ține telefonul nemișcat' : 'Testează senzorii și GPS-ul'}</button>
      <div className="card">
        <dl className="kv small">{lines.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
      </div>
      <button onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copiat' : 'Copiază rezultatul'}</button>
      {geoCode === 'PERMISSION_DENIED' && isIOS && (
        <div className="banner warn">
          <b>Localizarea e refuzată pe iPhone. Verifică, în ordine:</b>
          <ol>
            <li>Setări › Confidențialitate și securitate › Servicii de localizare: activate.</li>
            <li>Același meniu › Site-uri Safari: „În timpul utilizării” sau „Întreabă”.</li>
            <li>Safari › „aA” › Setări site web › Localizare: „Întreabă” sau „Permite”.</li>
            <li>Deschide aplicația direct, nu încorporată în altă pagină.</li>
          </ol>
        </div>
      )}
      <p className="small muted">Pentru turele de teren, Sensor Logger dă date mai bune (100 Hz pe iPhone, fără goluri) și merge cu ecranul stins.</p>
    </div>
  );
}

function base(): [string, string][] {
  const D = typeof DeviceMotionEvent !== 'undefined' ? (DeviceMotionEvent as unknown as { requestPermission?: unknown }) : undefined;
  let framed = false;
  try { framed = window.self !== window.top; } catch { framed = true; }
  return [
    ['isSecureContext', String(isSecureContext)],
    ['origine', location.origin],
    ['în iframe', framed ? 'da' : 'nu'],
    ['user agent', navigator.userAgent],
    ['DeviceMotionEvent', D ? 'da' : 'nu'],
    ['requestPermission', D && typeof D.requestPermission === 'function' ? 'da (iOS)' : 'nu'],
    ['Wake Lock', 'wakeLock' in navigator ? 'da' : 'nu'],
    ['mod instalat (standalone)', matchMedia('(display-mode: standalone)').matches ? 'da' : 'nu'],
  ];
}
