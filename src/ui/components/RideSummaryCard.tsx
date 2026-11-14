import type { ProcessedRide } from '../../core/types';
import { t } from '../../i18n/ro';
import { fmt, fmtDur, fmtLen } from '../format';

export function RideSummaryCard({ p }: { p: ProcessedRide }) {
  const s = p.summary;
  const m = p.match;
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Rezumat</h2>
      <dl className="kv">
        <dt>sursa</dt><dd>{p.meta.source === 'sensorlogger' ? 'Sensor Logger' : p.meta.source === 'shockgrid' ? 'ShockGrid' : 'format vechi'} · {s.platform ?? t.common.unknown} · {p.meta.device ?? t.common.unknown}</dd>
        <dt>durata</dt><dd>{fmtDur(s.duration_s)}</dd>
        <dt>mostre</dt><dd>{s.n_motion} · frecvență mediană {fmt(s.fs_median, 1, 'Hz')}</dd>
        <dt>goluri &gt; 100 ms</dt><dd>{s.gaps_100ms} (maxim {fmt(s.max_gap_ms, 0, 'ms')})</dd>
        <dt>unitate detectată</dt><dd>{s.unit ?? t.common.unknown} · {s.accel_file ?? ''}</dd>
        <dt>gravitație estimată</dt><dd>{fmt(s.gravity_median, 2, 'm/s²')}</dd>
        <dt>fixuri GPS</dt><dd>{s.n_fix} ({fmt(s.gps_rate_hz, 2, 'Hz')}), precizie mediană {fmt(s.acc_median, 1, 'm')}, ≤ 20 m: {s.n_fix_le20}</dd>
        <dt>distanța</dt><dd>{fmtLen(s.distance_m)} ({s.distance_method === 'speed' ? 'din viteza GPS' : s.distance_method === 'positions' ? 'din poziții' : 'fără GPS'})</dd>
        <dt>ferestre</dt><dd>{s.n_windows}, valide pentru RVI: <b>{s.n_windows_valid}</b></dd>
        <dt>șocuri candidate</dt><dd>{s.n_shocks}</dd>
        <dt>potrivire pe străzi</dt><dd>{m.graph_available ? `${m.windows_matched} din ${m.windows_with_pos} ferestre cu poziție (ambigue carosabil/trotuar: ${m.windows_ambiguous}); fixuri ${m.fixes_matched}/${m.fixes_used}` : 'în așteptarea grafului'}</dd>
      </dl>
      {Object.keys(s.reasons).length > 0 && (
        <p className="small muted">Motivele ferestrelor: {Object.entries(s.reasons).map(([k, v]) => `${t.reasons[k] ?? k}: ${v}`).join(' · ')}</p>
      )}
      {p.meta.warnings.map((w) => <p key={w} className="banner warn small">{w}</p>)}
      {s.n_windows > 0 && s.n_windows_valid === 0 && (
        <p className="banner warn small">Nicio fereastră validă pentru RVI: pentru indice e nevoie de mers pe bicicletă la 2,5–9 m/s cu GPS. Testele staționare nu produc segmente măsurate.</p>
      )}
    </div>
  );
}
