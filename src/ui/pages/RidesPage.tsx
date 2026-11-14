import { Bike, FileDown, GitCompare, Play, Upload } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { recoverSession, rideActive, subscribeRide } from '../../services/ride';
import { recDelete, recSessions } from '../../storage/idb';
import { useApp } from '../../state/store';
import { fmtLen } from '../format';
import { Banner, Item, toast } from '../kit';
import { go } from '../App';

export function RidesPage() {
  const rides = useApp((s) => s.rides);
  const reviews = useApp((s) => s.reviews);
  const recording = useSyncExternalStore(subscribeRide, rideActive);
  const [orphans, setOrphans] = useState<string[]>([]);
  useEffect(() => { if (!recording) recSessions().then(setOrphans).catch(() => {}); }, [recording]);
  const sorted = [...rides].sort((a, b) => b.processed.meta.start_ms - a.processed.meta.start_ms);
  return (
    <main className="screen"><div className="wrap stack">
      <h1>Ture</h1>
      {recording ? (
        <a className="card tint-danger" href="#/record" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="row"><span className="chip live"><span className="rec-dot" /> În curs</span><b>Tura ta se înregistrează</b></div>
          <p className="small" style={{ margin: '8px 0 0' }}>Deschide ecranul turei</p>
        </a>
      ) : (
        <div className="grid2">
          <a className="card tint-primary" href="#/record" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Play style={{ color: 'var(--primary)' }} /><h3 style={{ marginTop: 8 }}>Pornește o tură</h3><p className="xs muted" style={{ margin: 0 }}>Înregistrează vibrațiile cu acest telefon, ecranul aprins</p>
          </a>
          <a className="card tint-comfort" href="#/import" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Upload style={{ color: 'var(--comfort)' }} /><h3 style={{ marginTop: 8 }}>Importă</h3><p className="xs muted" style={{ margin: 0 }}>ZIP din Sensor Logger (merge și cu ecranul blocat)</p>
          </a>
        </div>
      )}
      {orphans.map((s) => (
        <Banner key={s} kind="warn">
          O tură a fost întreruptă înainte de oprire.
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm primary" onClick={async () => { const r = await recoverSession(s); setOrphans((o) => o.filter((x) => x !== s)); if (r.rideId) go(`/ride/${r.rideId}`); else toast(r.error ?? 'Nu s-a putut recupera.'); }}>Recuperează</button>
            <button className="btn sm ghost" onClick={async () => { if (confirm('Ștergi datele turei întrerupte? Nu se poate anula.')) { await recDelete(s); setOrphans((o) => o.filter((x) => x !== s)); } }}>Șterge</button>
          </div>
        </Banner>
      ))}
      <div className="row spread">
        <div className="section-label" style={{ margin: '8px 4px 0' }}>Istoric ({rides.length})</div>
        {rides.length >= 2 && <a className="btn sm ghost" href="#/compare"><GitCompare /> Compară</a>}
      </div>
      {!rides.length ? (
        <div className="empty card"><Bike aria-hidden="true" /><p>Încă nu ai ture pe acest telefon.</p></div>
      ) : (
        <div className="list">
          {sorted.map((r) => {
            const p = r.processed;
            const unreviewed = p.shocks.filter((s) => s.located && !reviews[`${r.ride_id}:${s.id}`]).length;
            return (
              <Item key={r.ride_id} href={`#/ride/${r.ride_id}`} icon={p.meta.source === 'sensorlogger' ? <FileDown /> : <Bike />} tone={p.meta.source === 'sensorlogger' ? 'comfort' : 'primary'}
                title={p.meta.label || r.file_name.replace(/\.zip$/i, '')}
                sub={`${new Date(p.meta.start_ms).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })} · ${fmtLen(p.summary.distance_m)}${p.meta.source === 'sensorlogger' ? ' · Sensor Logger' : ''}`}
                right={unreviewed > 0 ? <span className="badge warn">{unreviewed} de verificat</span> : undefined} />
            );
          })}
        </div>
      )}
      <p className="xs muted">Turele rămân doar pe acest telefon. Nimic nu se încarcă automat.</p>
    </div></main>
  );
}
