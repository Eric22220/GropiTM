import { useState } from 'react';
import type { DeclaredSurface } from '../../core/types';
import { t } from '../../i18n/ro';
import { getRideFile, removeRide, reprocessRide, setDeclaredSurface, setIncluded, setRideFields, useApp } from '../../state/store';
import { fmt, fmtDateTime, fmtLen, shareOrDownload } from '../format';

export function RidesPage() {
  const rides = useApp((s) => s.rides);
  const cfgVersion = useApp((s) => s.settings.cfg.processing_version);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const sorted = [...rides].sort((a, b) => b.processed.meta.start_ms - a.processed.meta.start_ms);
  return (
    <div className="stack">
      <h1>{t.nav.rides} ({rides.length})</h1>
      <p className="small muted">Turele sunt private și rămân pe acest dispozitiv (IndexedDB). Nimic nu se încarcă automat. Includerea în stratul de confort e o alegere explicită, pe tură.</p>
      {msg && <p className="banner info small" role="status">{msg}</p>}
      {!rides.length && <p>{t.home.noRides} <a href="#/import">{t.home.importBtn}</a></p>}
      {sorted.map((r) => {
        const p = r.processed;
        const s = p.summary;
        return (
          <div key={r.ride_id} className="card stack">
            <div>
              <b>{p.meta.label || r.file_name}</b>
              <div className="small muted">{fmtDateTime(p.meta.start_ms)} · {p.meta.source === 'sensorlogger' ? 'Sensor Logger' : p.meta.source} · {p.meta.device ?? ''} · id {r.ride_id}</div>
              <div className="small">{fmtLen(s.distance_m)} · {fmt(s.fs_median, 0, 'Hz')} · {s.n_fix} fixuri · {s.n_windows_valid}/{s.n_windows} ferestre valide · {s.n_shocks} șocuri · potrivite {p.match.windows_matched}</div>
              {p.processing_version !== cfgVersion && <div className="banner warn small">Procesată cu {p.processing_version}; configurația curentă e {cfgVersion}.</div>}
            </div>
            <label className="check"><input type="checkbox" checked={r.included} onChange={(e) => setIncluded(r.ride_id, e.target.checked)} />Inclusă în stratul de confort</label>
            <div className="grid2">
              <label className="small">Eticheta
                <input type="text" defaultValue={p.meta.label ?? ''} placeholder="ex. AB-traseu1-dus" onBlur={(e) => setRideFields(r.ride_id, { label: e.target.value })} />
              </label>
              <label className="small">Suprafața declarată
                <select value={p.meta.declared_surface ?? ''} onChange={(e) => setDeclaredSurface(r.ride_id, (e.target.value || null) as DeclaredSurface)}>
                  <option value="">{t.import.declaredNone}</option>
                  <option value="carosabil">{t.surface.carosabil}</option>
                  <option value="pista">{t.surface.pista}</option>
                  <option value="trotuar">{t.surface.trotuar}</option>
                  <option value="mixt">{t.surface.mixt}</option>
                </select>
              </label>
              <label className="small">Confort perceput (1–5)
                <select value={r.perceived ?? ''} onChange={(e) => setRideFields(r.ride_id, { perceived: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">nenotat</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <a className="btn" href={`#/map/${r.ride_id}`}>Pe hartă</a>
              <a className="btn" href={`#/ride/${r.ride_id}`}>Replay</a>
              <button disabled={!!busy} onClick={async () => {
                const f = await getRideFile(r.ride_id);
                if (!f) { setMsg('Fișierul original nu mai e disponibil.'); return; }
                await shareOrDownload(r.file_name.endsWith('.zip') ? r.file_name : `${r.file_name}.zip`, f);
              }}>Exportă tura</button>
              <button disabled={!!busy} onClick={async () => {
                setBusy(r.ride_id);
                try { await reprocessRide(r.ride_id); setMsg('Tura a fost reprocesată.'); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
              }}>{busy === r.ride_id ? 'Se reprocesează…' : 'Reprocesează'}</button>
              <button className="danger" onClick={async () => { if (confirm('Ștergi tura de pe acest dispozitiv? Contribuția ei dispare din hartă. Nu se poate anula.')) await removeRide(r.ride_id); }}>{t.common.delete}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
