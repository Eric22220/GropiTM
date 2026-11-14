import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DeclaredSurface } from '../../core/types';
import { importFile } from '../../state/store';
import { Banner, Header } from '../kit';
import { go } from '../App';

export function ImportPage() {
  const input = useRef<HTMLInputElement | null>(null);
  const [declared, setDeclared] = useState<DeclaredSurface>(null);
  const [busy, setBusy] = useState<{ stage: string; frac: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setBusy({ stage: 'citire fișier', frac: 0.02 });
    try {
      const { ride } = await importFile(f, declared, (stage, frac) => setBusy({ stage, frac }));
      go(ride.shocks.some((s) => s.located) ? `/review/${ride.ride_id}` : `/ride/${ride.ride_id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <main className="screen"><div className="wrap stack">
      <Header title="Importă din Sensor Logger" back="#/rides" />
      <ol className="small" style={{ paddingLeft: 20, color: 'var(--fg-2)' }}>
        <li>În Sensor Logger, deschide înregistrarea → <b>Export</b> → <b>ZIP (CSV)</b>.</li>
        <li>Salvează în <b>Fișiere</b> (iPhone) sau <b>Descărcări</b> (Android).</li>
        <li>Alege fișierul aici. Analiza se face pe telefon, după import.</li>
      </ol>
      <label className="field"><span>Pe ce ai mers mai ales? (opțional)</span>
        <select value={declared ?? ''} onChange={(e) => setDeclared((e.target.value || null) as DeclaredSurface)}>
          <option value="">nu știu / amestecat</option><option value="carosabil">carosabil</option><option value="pista">pistă de biciclete</option><option value="trotuar">trotuar</option><option value="mixt">mixt</option>
        </select>
      </label>
      <input ref={input} type="file" accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream,.csv,text/csv" className="sr-only" id="ridefile" onChange={(e) => onFile(e.target.files?.[0])} />
      <button className="btn primary block lg" disabled={!!busy} onClick={() => input.current?.click()}><Upload /> Alege fișierul ZIP</button>
      {busy && (
        <div className="card" aria-live="polite">
          <p className="small">Se analizează: {busy.stage}…</p>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(busy.frac * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.round(busy.frac * 100)}%` }} /></div>
        </div>
      )}
      {error && <Banner kind="danger"><b>Importul a eșuat.</b> {error}</Banner>}
      <p className="xs muted">Recomandat în Sensor Logger: Accelerometer, Gyroscope, versiunile Uncalibrated și Location, la 100 Hz. Fișierul rămâne doar pe acest telefon.</p>
    </div></main>
  );
}
