import { useMemo, useState } from 'react';
import { CLASSES } from '../../core/aggregate';
import { compareVerdict, traceStats } from '../../core/compare';
import { t } from '../../i18n/ro';
import { useApp } from '../../state/store';
import { UPlot } from '../charts/UPlot';
import { RideMiniMap } from '../components/RideMiniMap';
import { fmt, fmtDur, fmtLen } from '../format';

export function ComparePage() {
  const rides = useApp((s) => s.rides);
  const th = useApp((s) => s.layer.thresholds);
  const thSrc = useApp((s) => s.layer.thresholds_source);
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const [ra, setRa] = useState<[number, number] | null>(null);
  const [rb, setRb] = useState<[number, number] | null>(null);
  const A = rides.find((r) => r.ride_id === a)?.processed;
  const B = rides.find((r) => r.ride_id === b)?.processed;
  const sa = useMemo(() => (A ? traceStats(A, th, ra ?? undefined) : null), [A, th, ra]);
  const sb = useMemo(() => (B ? traceStats(B, th, rb ?? undefined) : null), [B, th, rb]);
  const verdict = sa && sb ? compareVerdict(sa, sb) : null;

  const chart = useMemo(() => {
    if (!sa || !sb) return null;
    const maxD = Math.max(sa.distance_m, sb.distance_m);
    const xs: number[] = [];
    for (let d = 0; d <= maxD; d += 10) xs.push(d);
    const bin = (s: typeof sa) => {
      const out = new Array<number | null>(xs.length).fill(null);
      s.series.dist.forEach((d, i) => { const k = Math.round(d / 10); if (k >= 0 && k < out.length && s.series.rms[i] !== null) out[k] = s.series.rms[i]; });
      return out;
    };
    return [xs, bin(sa), bin(sb)] as [number[], (number | null)[], (number | null)[]];
  }, [sa, sb]);

  if (rides.length < 2) return <div><h1>{t.compare.title}</h1><p>{t.compare.needTwo} <a href="#/import">{t.home.importBtn}</a></p></div>;

  const opts = rides.map((r) => <option key={r.ride_id} value={r.ride_id}>{r.processed.meta.label || r.file_name} · {fmtLen(r.processed.summary.distance_m)}</option>);
  const rangeCtl = (p: typeof A, r: [number, number] | null, setR: (v: [number, number] | null) => void) => {
    if (!p) return null;
    const total = Math.max(1, p.summary.distance_m);
    const cur = r ?? [0, total];
    return (
      <div className="small">
        Porțiunea: {fmtLen(cur[0])} – {fmtLen(cur[1])}
        <input type="range" min={0} max={total} step={10} value={cur[0]} aria-label="începutul porțiunii" onChange={(e) => setR([Math.min(Number(e.target.value), cur[1] - 10), cur[1]])} />
        <input type="range" min={0} max={total} step={10} value={cur[1]} aria-label="sfârșitul porțiunii" onChange={(e) => setR([cur[0], Math.max(Number(e.target.value), cur[0] + 10)])} />
      </div>
    );
  };

  return (
    <div className="stack">
      <h1>{t.compare.title}</h1>
      <p className="small muted">Totul vine din măsurători, nimic din estimări. Alege două ture (sau porțiuni) între aceleași puncte, cu același telefon, aceeași bicicletă și același suport.</p>
      <div className="grid2">
        <label>{t.compare.pick1}<select value={a} onChange={(e) => { setA(e.target.value); setRa(null); }}><option value="">—</option>{opts}</select>{rangeCtl(A, ra, setRa)}</label>
        <label>{t.compare.pick2}<select value={b} onChange={(e) => { setB(e.target.value); setRb(null); }}><option value="">—</option>{opts}</select>{rangeCtl(B, rb, setRb)}</label>
      </div>
      {sa && sb && (
        <>
          {verdict && <p className={`banner ${verdict.kind === 'winner' ? 'ok' : 'warn'}`}>{verdict.text}</p>}
          <div className="tablewrap">
            <table>
              <thead><tr><th></th><th>Traseul 1 <span className="muted small">(albastru)</span></th><th>Traseul 2 <span className="muted small">(portocaliu)</span></th></tr></thead>
              <tbody>
                <tr><th>distanța</th><td>{fmtLen(sa.distance_m)}</td><td>{fmtLen(sb.distance_m)}</td></tr>
                <tr><th>durata</th><td>{fmtDur(sa.duration_s)}</td><td>{fmtDur(sb.duration_s)}</td></tr>
                <tr><th>viteza medie / mediană</th><td>{fmt(sa.speed_mean, 1)} / {fmt(sa.speed_median, 1, 'm/s')}</td><td>{fmt(sb.speed_mean, 1)} / {fmt(sb.speed_median, 1, 'm/s')}</td></tr>
                <tr><th>{t.rviLabel} (95%)</th><td>{fmt(sa.rvi, 2)} {sa.ci ? `(${fmt(sa.ci[0], 2)}–${fmt(sa.ci[1], 2)})` : ''}</td><td>{fmt(sb.rvi, 2)} {sb.ci ? `(${fmt(sb.ci[0], 2)}–${fmt(sb.ci[1], 2)})` : ''}</td></tr>
                <tr><th>{t.vdvLabel}</th><td>{fmt(sa.vdv, 2, 'm/s^1,75')}</td><td>{fmt(sb.vdv, 2, 'm/s^1,75')}</td></tr>
                <tr><th>ferestre valide</th><td>{sa.n_valid}/{sa.n_windows} ({fmt(sa.valid_pct, 0)}%)</td><td>{sb.n_valid}/{sb.n_windows} ({fmt(sb.valid_pct, 0)}%)</td></tr>
                <tr><th>timp pe clase (s)</th><td>{CLASSES.map((c) => `${c}:${sa.time_by_class[c]}`).join(' ')}</td><td>{CLASSES.map((c) => `${c}:${sb.time_by_class[c]}`).join(' ')}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="small muted">Interval prin bootstrap pe blocuri de 10 ferestre consecutive, 1000 de reeșantionări. Clase: {thSrc}. Dacă vitezele mediane diferă cu peste 20%, nu se afișează un câștigător.</p>
          {chart && (
            <UPlot
              data={chart}
              series={[
                { label: 'rms_v traseul 1', stroke: '#2166ac', width: 2, spanGaps: false },
                { label: 'rms_v traseul 2', stroke: '#e66101', width: 2, dash: [6, 4] },
              ]}
              height={220}
              xLabel="distanța (m)"
              ariaLabel="rms_v în funcție de distanță pentru cele două trasee"
            />
          )}
          {A && <RideMiniMap p={A} extra={B} />}
        </>
      )}
    </div>
  );
}
