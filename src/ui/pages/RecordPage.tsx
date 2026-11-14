import { useEffect, useRef, useState } from 'react';
import { Recorder, buildZipFromSession, recDelete, requestMotionPermission, type LiveStats } from '../../capture/recorder';
import { recSessions } from '../../storage/idb';
import { importBytes } from '../../state/store';
import { fmt, fmtDur, shareOrDownload } from '../format';

export function RecordPage() {
  const rec = useRef<Recorder | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [form, setForm] = useState({ label: '', device: '', bike: '', mount: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [orphans, setOrphans] = useState<string[]>([]);
  const [lastZip, setLastZip] = useState<Uint8Array | null>(null);

  useEffect(() => {
    recSessions().then(setOrphans).catch(() => {});
  }, []);
  useEffect(() => {
    if (!rec.current) return;
    const id = setInterval(() => setStats(rec.current?.stats() ?? null), 500);
    return () => clearInterval(id);
  }, [stats !== null]);

  const start = () => {
    // iOS: permisiunea se cere primul lucru, sincron, în handlerul click-ului
    const perm = requestMotionPermission();
    perm.then(async (p) => {
      if (p !== 'granted') { setMsg({ kind: 'err', text: `Permisiunea pentru senzorii de mișcare: ${p}. Vezi ecranul Diagnostic.` }); return; }
      const r = new Recorder({ label: form.label || 'tură', device: form.device, bike: form.bike, mount: form.mount, platform: navigator.platform });
      rec.current = r;
      await r.begin();
      setStats(r.stats());
      setMsg(null);
    }).catch((e) => setMsg({ kind: 'err', text: (e as Error).message }));
  };

  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setStats(null);
    const zip = await r.stop();
    setLastZip(zip);
    try {
      await importBytes(`${r.session}.zip`, zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, null);
      await recDelete(r.session);
      setMsg({ kind: 'ok', text: 'Tura a fost salvată și procesată. O găsești în „Ture”.' });
    } catch (e) {
      setMsg({ kind: 'err', text: `Tura e salvată local, dar procesarea a eșuat: ${(e as Error).message}. Folosește „Exportă tura”.` });
    }
  };

  const recover = async (s: string) => {
    const zip = await buildZipFromSession(s, { label: 'tură recuperată' });
    setLastZip(zip);
    try {
      await importBytes(`${s}.zip`, zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, null);
      await recDelete(s);
      setOrphans((o) => o.filter((x) => x !== s));
      setMsg({ kind: 'ok', text: 'Înregistrarea întreruptă a fost recuperată.' });
    } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); }
  };

  if (stats) {
    return (
      <div className="stack">
        <h1>În tură</h1>
        {stats.problems.length > 0 && <div className="redbanner" role="alert">{stats.problems.join(' · ')}</div>}
        {stats.wakeLock !== 'on' && <div className="redbanner">Ține ecranul aprins: setează închiderea automată a ecranului la 10 minute. (Wake Lock: {stats.wakeLock})</div>}
        <div className="grid2">
          <div className="card"><div className="small muted">timp</div><div className="bignum">{fmtDur(stats.elapsed_s)}</div></div>
          <div className="card"><div className="small muted">frecvență (5 s)</div><div className="bignum">{fmt(stats.fs, 0, 'Hz')}</div></div>
          <div className="card"><div className="small muted">GPS: fixuri / precizie</div><div className="bignum">{stats.fixes} / {fmt(stats.acc, 0, 'm')}</div></div>
          <div className="card"><div className="small muted">viteză</div><div className="bignum">{fmt(stats.speed === null ? null : stats.speed * 3.6, 0, 'km/h')}</div></div>
        </div>
        <div className="grid2">
          {stats.paused ? <button className="big" onClick={() => rec.current?.resume()}>Reia</button> : <button className="big" onClick={() => rec.current?.pause()}>Pauză</button>}
          <button className="big danger" onClick={stop}>Stop</button>
        </div>
        <button className="big" onClick={() => { rec.current?.mark(); setMsg({ kind: 'info', text: 'Reper marcat.' }); }}>Marchează reper (doar din oprire)</button>
        {msg && <p className={`banner ${msg.kind}`}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Înregistrator propriu</h1>
      <p className="banner warn small">P1, experimental. Pentru turele de teren folosește <b>Sensor Logger</b> (merge și cu ecranul stins). Un site web nu poate citi senzorii cu ecranul stins: ecranul trebuie să rămână aprins, iar telefonul fixat ferm pe ghidon.</p>
      {orphans.length > 0 && (
        <div className="card">
          <b>Înregistrare întreruptă găsită</b>
          {orphans.map((s) => (
            <div key={s} className="row"><span className="small">{s}</span><button onClick={() => recover(s)}>Recuperează</button><button className="danger" onClick={async () => { await recDelete(s); setOrphans((o) => o.filter((x) => x !== s)); }}>Șterge</button></div>
          ))}
        </div>
      )}
      <div className="grid2">
        {(['label', 'device', 'bike', 'mount'] as const).map((k) => (
          <label key={k} className="small">{{ label: 'Eticheta (ex. AB-traseu1-dus)', device: 'Telefon', bike: 'Bicicletă', mount: 'Suport' }[k]}
            <input type="text" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="small muted">Verifică întâi în Diagnostic frecvența și GPS-ul. Pe lumină, viteză normală, fără atingerea telefonului în mers.</p>
      <button className="primary big" onClick={start}>Pornește tura</button>
      {lastZip && <button onClick={() => shareOrDownload(`shockgrid-${Date.now()}.zip`, lastZip)}>Exportă tura (ZIP)</button>}
      {msg && <p className={`banner ${msg.kind}`}>{msg.text}</p>}
    </div>
  );
}
