import { useMemo, useState } from 'react';
import { CLASSES } from '../../core/aggregate';
import { PROFILES, type ProfileKey, type RouteStats } from '../../core/route';
import { t } from '../../i18n/ro';
import { computeRoutes, setAB, updateSettings, useApp } from '../../state/store';
import { CLASS_COLORS, fmt, fmtLen } from '../format';
import { drawComfort } from '../map/draw';
import { L, useLayerGroup, useLeaflet } from '../map/useLeaflet';

export function RoutePage() {
  const graph = useApp((s) => s.graph);
  const graphStatus = useApp((s) => s.graphStatus);
  const layer = useApp((s) => s.layer);
  const ab = useApp((s) => s.ab);
  const settings = useApp((s) => s.settings);
  const [panelOpen, setPanelOpen] = useState(true);
  const { ref, map } = useLeaflet({
    onClick: (lat, lon) => {
      if (!ab.a || (ab.a && ab.b)) setAB({ a: [lat, lon], b: null });
      else setAB({ a: ab.a, b: [lat, lon] });
    },
  });
  // recalculare automată la orice versiune nouă a stratului (8.6.6)
  const routes = useMemo(
    () => (graph ? computeRoutes(layer, settings.profile) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, layer, ab, settings.profile, settings.route],
  );

  useLayerGroup(map, (g) => { if (graph) drawComfort(g, graph, layer, () => {}); }, [graph, layer]);
  useLayerGroup(map, (g) => {
    if (!graph) return;
    const draw = (edges: { edge: number; forward: boolean }[], color: string, weight: number, dash?: string) => {
      const pts: [number, number][] = [];
      for (const { edge, forward } of edges) {
        const geo = graph.geometry(edge);
        const seq = forward ? geo : [...geo].reverse();
        pts.push(...(pts.length ? seq.slice(1) : seq));
      }
      return L.polyline(pts, { color, weight, opacity: 0.9, dashArray: dash, interactive: false }).addTo(g);
    };
    if (routes?.shortest) draw(routes.shortest.r.edges, '#222', 9, '2 10');
    if (routes?.chosen && settings.profile !== 'shortest') draw(routes.chosen.r.edges, '#00b3a4', 5);
    if (ab.a) L.marker(ab.a, { icon: L.divIcon({ className: '', html: '<div style="background:#1d5c2e;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff">A</div>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(g);
    if (ab.b) L.marker(ab.b, { icon: L.divIcon({ className: '', html: '<div style="background:#8a1111;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff">B</div>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(g);
  }, [graph, routes, ab, settings.profile]);

  const s = routes?.shortest?.s;
  const c = routes?.chosen?.s;
  return (
    <>
      <div ref={ref} className="mapbox" role="region" aria-label="Harta pentru alegerea punctelor A și B" />
      <div className="overlay bottom" style={{ maxHeight: panelOpen ? '62%' : undefined }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b>{!ab.a ? t.route.tapA : !ab.b ? t.route.tapB : 'Rută A → B'}</b>
          <div className="row">
            {ab.a && <button onClick={() => setAB({ a: null, b: null })}>{t.route.reset}</button>}
            <button onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}>{panelOpen ? '▾' : '▴'}</button>
          </div>
        </div>
        {panelOpen && (
          <div className="stack">
            {graphStatus !== 'ready' && <p className="banner warn small">{graphStatus === 'loading' ? 'Se încarcă graful străzilor…' : 'Rutarea are nevoie de graful străzilor, care nu e disponibil încă. Comparația a două ture măsurate funcționează (ecranul Compară).'}</p>}
            <div className="toggle-row" role="group" aria-label="Profil">
              {(Object.keys(PROFILES) as ProfileKey[]).map((p) => (
                <button key={p} aria-pressed={settings.profile === p} onClick={() => updateSettings({ profile: p })}>{t.route.profiles[p]}</button>
              ))}
            </div>
            {routes?.error && <p className="banner err small">{routes.error}</p>}
            {s && (
              <>
                <div className="tablewrap">
                  <table>
                    <thead><tr><th></th><th>{t.route.profiles.shortest}<br /><span className="muted small">linie neagră punctată</span></th>{settings.profile !== 'shortest' && <th>{t.route.profiles[settings.profile]}<br /><span className="muted small">linie turcoaz</span></th>}</tr></thead>
                    <tbody>
                      <Row label="lungime" a={fmtLen(s.length)} b={c && fmtLen(c.length)} show={settings.profile !== 'shortest'} />
                      <Row label="timp la 15 km/h" a={fmt(s.minutes, 0, 'min')} b={c && fmt(c.minutes, 0, 'min')} show={settings.profile !== 'shortest'} />
                      <Row label="măsurat" a={pct(s.measured_pct)} b={c && pct(c.measured_pct)} show={settings.profile !== 'shortest'} />
                      <Row label="estimat din OSM" a={fmtLen(s.osm_m)} b={c && fmtLen(c.osm_m)} show={settings.profile !== 'shortest'} />
                      <Row label="necunoscut" a={pct(s.unknown_pct)} b={c && pct(c.unknown_pct)} show={settings.profile !== 'shortest'} />
                      <Row label="D–E măsurat" a={fmtLen(s.de_measured_m)} b={c && fmtLen(c.de_measured_m)} show={settings.profile !== 'shortest'} />
                    </tbody>
                  </table>
                </div>
                <ClassBar s={s} label={t.route.profiles.shortest} />
                {c && settings.profile !== 'shortest' && <ClassBar s={c} label={t.route.profiles[settings.profile]} />}
                {c && settings.profile !== 'shortest' && <Verdict s={s} c={c} />}
              </>
            )}
            <details>
              <summary>Opțiuni</summary>
              <label className="small">{t.route.unknownPenalty}: <b>{settings.route.p_unknown.toFixed(2)}</b>
                <input type="range" min={0} max={1.6} step={0.05} value={settings.route.p_unknown} onChange={(e) => updateSettings({ route: { ...settings.route, p_unknown: Number(e.target.value) } })} />
              </label>
              <label className="check small"><input type="checkbox" checked={settings.route.allowSidewalks} onChange={(e) => updateSettings({ route: { ...settings.route, allowSidewalks: e.target.checked } })} />{t.route.allowSidewalks}</label>
              <label className="check small"><input type="checkbox" checked={settings.route.useOsmSurface} onChange={(e) => updateSettings({ route: { ...settings.route, useOsmSurface: e.target.checked } })} />{t.route.useOsm}</label>
              <p className="small muted">{t.route.noShockCost} Cost = lungime × (1 + w_c · P_confort); w_c: scurtă 0, echilibrat 1, curier 3. Aplicația nu interpretează legislația; spune doar ce conține OSM. Confortul nu e siguranță.</p>
            </details>
          </div>
        )}
      </div>
    </>
  );
}

const pct = (v: number) => `${fmt(v, 0)}%`;

function Row({ label, a, b, show }: { label: string; a: string; b?: string; show: boolean }) {
  return <tr><th>{label}</th><td>{a}</td>{show && <td>{b ?? '—'}</td>}</tr>;
}

function ClassBar({ s, label }: { s: RouteStats; label: string }) {
  const parts = [
    ...CLASSES.map((k) => ({ k, m: s.byClass.measured[k], color: CLASS_COLORS[k], txt: `${k} măsurat` })),
    ...CLASSES.map((k) => ({ k, m: s.byClass.low[k], color: CLASS_COLORS[k], txt: `${k} încredere scăzută`, low: true })),
    { k: 'osm', m: s.osm_m, color: '#999', txt: 'estimat din OSM' },
    { k: 'unk', m: s.unknown_m, color: '#ddd', txt: 'necunoscut' },
  ].filter((p) => p.m > 0);
  return (
    <div className="small">
      <div>{label}: metri pe clase</div>
      <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }} aria-hidden="true">
        {parts.map((p, i) => <div key={i} title={p.txt} style={{ width: `${(100 * p.m) / s.length}%`, background: 'low' in p ? `repeating-linear-gradient(45deg, ${p.color} 0 4px, #fff 4px 6px)` : p.color }} />)}
      </div>
      <div className="muted">{parts.map((p) => `${p.txt}: ${fmtLen(p.m)}`).join(' · ')}</div>
    </div>
  );
}

function Verdict({ s, c }: { s: RouteStats; c: RouteStats }) {
  if (c.insufficient) return <p className="banner warn small"><b>{t.route.insufficient}</b> {fmt(c.unknown_pct, 0)}% din lungime e necunoscută; ruta nu se numește „mai netedă”.</p>;
  const dl = c.length - s.length;
  const dde = s.de_measured_m - c.de_measured_m;
  if (Math.abs(dl) < 1 && Math.abs(dde) < 1) return <p className="banner info small">Ruta de confort coincide cu cea mai scurtă (măsurat {fmt(c.measured_pct, 0)}%).</p>;
  return (
    <p className="banner ok small">
      Ruta de confort: +{fmtLen(dl)} (+{fmt((100 * dl) / Math.max(1, s.length), 0)}%), −{fmtLen(dde)} în clasele D–E măsurate. Măsurat {fmt(c.measured_pct, 0)}% din lungime. Comparația e despre vibrații, nu despre siguranță.
    </p>
  );
}
