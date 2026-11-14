import { ArrowDownUp, ArrowLeft, Bike, Check, History, LocateFixed, Map as MapIcon, MapPin, Navigation, Search, Square, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProfileKey, RouteOptions } from '../../core/route';
import { planRoutes, type PlanResult, type RouteOptionView } from '../../core/routeplan';
import { haversine, pointSegment, TM_PROJ } from '../../core/geo';
import { requestMotionPermission } from '../../capture/recorder';
import { geocoder, GeocodeError, buildStreetIndex, nearestStreetName, searchStreets, type Place, type StreetEntry } from '../../services/geocode';
import { locationPermission, type LocState } from '../../services/location';
import { startRide } from '../../services/ride';
import { addRecent, clearRecent, getRouter, setPlan, snapNode, updateSettings, useApp } from '../../state/store';
import { t } from '../../i18n/ro';
import { CLASS_COLORS, fmtLen } from '../format';
import { Banner, SnapSheet, toast, useDebounced, type Snap } from '../kit';
import { drawComfort, pinIcon, routeLatLngs } from '../map/draw';
import { useLocation, useMeLayer } from '../map/me';
import { L, useLayerGroup, useLeaflet } from '../map/useLeaflet';
import { go } from '../App';

const PROFILE_LABEL: Record<ProfileKey, string> = { shortest: 'Cea mai scurtă', balanced: 'Echilibrată', courier: 'Confort maxim' };
const MY_LOC = (lat = 0, lon = 0): Place => ({ id: 'me', name: 'Locația mea', detail: 'GPS', lat, lon, kind: 'mylocation', source: 'gps' });
let streetIndexCache: { g: unknown; idx: StreetEntry[] } | null = null;

export function RouteScreen({ focus }: { focus: string | null }) {
  const graph = useApp((s) => s.graph);
  const layer = useApp((s) => s.layer);
  const plan = useApp((s) => s.plan);
  const settings = useApp((s) => s.settings);
  const reports = useApp((s) => s.reports);
  const [editing, setEditing] = useState<'origin' | 'dest' | null>(focus === 'dest' && !plan.dest ? 'dest' : null);
  const [picking, setPicking] = useState<'origin' | 'dest' | null>(null);
  const [selected, setSelected] = useState<ProfileKey>('shortest');
  const [nav, setNav] = useState(false);
  const [snap, setSnap] = useState<Snap>('peek');
  const [sheetH, setSheetH] = useState(200);
  const usesMe = plan.origin?.kind === 'mylocation' || plan.dest?.kind === 'mylocation';
  const loc = useLocation(usesMe || nav);
  const [originFix, setOriginFix] = useState<[number, number] | null>(null);
  const { ref, map } = useLeaflet({ onDrag: () => setFollowNav(false) });
  const [followNav, setFollowNav] = useState(true);
  useMeLayer(map, loc, nav && followNav);

  // originea implicită: Locația mea, dacă permisiunea e deja acordată
  useEffect(() => {
    if (plan.origin) return;
    locationPermission().then((p) => { if (p === 'granted') void setPlan({ ...plan, origin: MY_LOC() }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // poziția GPS a originii se fixează la primul fix (nu recalculăm ruta la fiecare metru)
  useEffect(() => {
    if (usesMe && loc.fix && !originFix) setOriginFix([loc.fix.lat, loc.fix.lon]);
  }, [usesMe, loc.fix, originFix]);

  const pt = (p: Place | null): [number, number] | null => (!p ? null : p.kind === 'mylocation' ? originFix : [p.lat, p.lon]);
  const A = pt(plan.origin), B = pt(plan.dest);

  const result: PlanResult | null = useMemo(() => {
    if (!graph || !A || !B) return null;
    const src = snapNode(A[0], A[1]), dst = snapNode(B[0], B[1]);
    if (src < 0 || dst < 0) return { options: [], verdict: { kind: 'nodata', text: '' }, error: 'Punctul ales e prea departe de străzile pe care se poate merge cu bicicleta.' };
    if (src === dst) return { options: [], verdict: { kind: 'nodata', text: '' }, error: 'Pornirea și destinația sunt în același loc.' };
    const zones = layer.zones.filter((z) => z.status === 'REPEATED' || z.status === 'CANDIDATE');
    return planRoutes(graph, layer, getRouter()!, src, dst, settings.route, { zones, reports });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, layer, A?.[0], A?.[1], B?.[0], B?.[1], settings.route, reports]);

  useEffect(() => { if (result?.options.length && !result.options.some((o) => o.key === selected)) setSelected(result.options[result.options.length - 1].key); }, [result, selected]);
  useEffect(() => { if (result?.verdict.kind === 'better') setSelected(result.verdict.best); }, [result]);
  const chosen = result?.options.find((o) => o.key === selected) ?? result?.options[0] ?? null;
  const routePts = useMemo(() => (graph && chosen ? routeLatLngs(graph, chosen.r.edges) : []), [graph, chosen]);

  useLayerGroup(map, (g) => { if (graph) drawComfort(g, graph, layer, null, { dim: true }); }, [graph, layer]);
  const fitted = useRef('');
  useLayerGroup(map, (g) => {
    if (!graph || !result) { if (A) L.marker(A, { icon: pinIcon('A', '#1857f5') }).addTo(g); if (B) L.marker(B, { icon: pinIcon('B', '#c2261b') }).addTo(g); return; }
    for (const o of result.options) {
      if (o.key === chosen?.key) continue;
      L.polyline(routeLatLngs(graph, o.r.edges), { color: '#7d8796', weight: 6, opacity: 0.7, interactive: true }).on('click', () => setSelected(o.key)).addTo(g);
    }
    if (routePts.length) {
      L.polyline(routePts, { color: '#ffffff', weight: 10, opacity: 0.9, interactive: false }).addTo(g);
      const pl = L.polyline(routePts, { color: '#1857f5', weight: 6, opacity: 1, interactive: false }).addTo(g);
      const key = `${A}|${B}|${chosen?.key}|${snap}|${Math.round(sheetH / 8)}`;
      if (fitted.current !== key && !nav && snap !== 'full') {
        const top = 30 + (document.querySelector('.planner')?.getBoundingClientRect().bottom ?? 120);
        map!.fitBounds(pl.getBounds(), { paddingTopLeft: [28, top], paddingBottomRight: [28, sheetH + 24], maxZoom: 17 });
        fitted.current = key;
      }
    }
    if (A) L.marker(A, { icon: pinIcon('A', '#1857f5') }).addTo(g);
    if (B) L.marker(B, { icon: pinIcon('B', '#c2261b') }).addTo(g);
  }, [graph, result, chosen?.key, nav, snap, sheetH]);

  // ---- alegerea pe hartă ----
  const [pickLabel, setPickLabel] = useState<string>('');
  useEffect(() => {
    if (!picking || !map) return;
    const upd = () => { const c = map.getCenter(); setPickLabel((graph && nearestStreetName(graph, c.lat, c.lng)) || `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`); };
    upd();
    map.on('moveend', upd);
    return () => { map.off('moveend', upd); };
  }, [picking, map, graph]);

  const choose = async (field: 'origin' | 'dest', p: Place) => {
    const next = { ...plan, [field]: p };
    if (p.kind === 'mylocation') setOriginFix(loc.fix ? [loc.fix.lat, loc.fix.lon] : null);
    await setPlan(next);
    if (field === 'dest') await addRecent(p);
    setEditing(null);
    setPicking(null);
    fitted.current = '';
  };

  const swap = () => { void setPlan({ origin: plan.dest, dest: plan.origin }); fitted.current = ''; };

  const startNav = (record: boolean) => {
    if (record) {
      const perm = requestMotionPermission(); // iOS: prima instrucțiune din handlerul click-ului
      perm.then(async (p) => {
        if (p !== 'granted' && p !== 'unsupported') { toast('Fără acces la senzorii de mișcare: se înregistrează doar GPS-ul.'); }
        await startRide({ label: `Spre ${plan.dest?.name ?? 'destinație'}`, device: '', bike: '', mount: '' });
        go('/record');
      }).catch((e) => toast((e as Error).message));
      return;
    }
    setNav(true);
    setFollowNav(true);
  };

  // ---- navigare: distanța rămasă pe rută ----
  const navInfo = useMemo(() => {
    if (!nav || !loc.fix || routePts.length < 2) return null;
    const px = TM_PROJ.x(loc.fix.lon), py = TM_PROJ.y(loc.fix.lat);
    let best = Infinity, bi = 0, bt = 0;
    for (let i = 0; i + 1 < routePts.length; i++) {
      const [d, tt] = pointSegment(px, py, TM_PROJ.x(routePts[i][1]), TM_PROJ.y(routePts[i][0]), TM_PROJ.x(routePts[i + 1][1]), TM_PROJ.y(routePts[i + 1][0]));
      if (d < best) { best = d; bi = i; bt = tt; }
    }
    let rem = haversine(routePts[bi][0], routePts[bi][1], routePts[bi + 1][0], routePts[bi + 1][1]) * (1 - bt);
    for (let i = bi + 1; i + 1 < routePts.length; i++) rem += haversine(routePts[i][0], routePts[i][1], routePts[i + 1][0], routePts[i + 1][1]);
    return { rem, off: best > Math.max(40, loc.fix.acc * 1.5), arrived: rem < 30 };
  }, [nav, loc.fix, routePts]);

  return (
    <main className="screen-map" aria-label="Planificarea traseului">
      <div ref={ref} className="map" />
      {editing && <SearchOverlay field={editing} onClose={() => setEditing(null)} onPick={(p) => void choose(editing, p)} onMap={() => { setPicking(editing); setEditing(null); }} />}
      {picking && (
        <>
          <div className="pick-center" aria-hidden="true"><div className="pin" style={{ background: picking === 'origin' ? '#1857f5' : '#c2261b' }}><span>{picking === 'origin' ? 'A' : 'B'}</span></div></div>
          <div className="live-panel">
            <p className="small muted" style={{ margin: 0 }}>Mișcă harta până când acul e pe locul dorit</p>
            <p style={{ fontWeight: 650, margin: '4px 0 12px' }}>{pickLabel}</p>
            <div className="grid2">
              <button className="btn ghost" onClick={() => setPicking(null)}>Renunță</button>
              <button className="btn primary" onClick={() => { const c = map!.getCenter(); void choose(picking, { id: `map:${c.lat},${c.lng}`, name: pickLabel, detail: 'Punct ales pe hartă', lat: c.lat, lon: c.lng, kind: 'map', source: 'map' }); }}><Check /> Confirmă</button>
            </div>
          </div>
        </>
      )}
      {!picking && !nav && (
        <div className="planner">
          <div className="rail" aria-hidden="true"><i className="o" /><span className="dots" /><i className="d" /></div>
          <div className="fields">
            <button className={`pfield ${plan.origin ? '' : 'empty'}`} onClick={() => setEditing('origin')} aria-label={`De unde pleci: ${plan.origin?.name ?? 'nealeasă'}`}>
              <span>{plan.origin ? plan.origin.name : 'De unde pleci?'}</span>
            </button>
            <button className={`pfield ${plan.dest ? '' : 'empty'}`} onClick={() => setEditing('dest')} aria-label={`Unde mergi: ${plan.dest?.name ?? 'nealeasă'}`}>
              <span>{plan.dest ? plan.dest.name : 'Unde mergi?'}</span>
            </button>
          </div>
          <button className="icon-btn flat" onClick={swap} aria-label="Inversează pornirea cu destinația" disabled={!plan.origin && !plan.dest}><ArrowDownUp /></button>
        </div>
      )}
      {nav && (
        <div className="planner" style={{ padding: 12 }}>
          <div className="grow">
            <div className="small muted">Te urmărim pe ruta spre {plan.dest?.name} · fără indicații de viraj</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{navInfo ? (navInfo.arrived ? 'Ai ajuns' : `${fmtLen(navInfo.rem)} · ${Math.max(1, Math.round(navInfo.rem / 250))} min`) : loc.message ?? 'Se caută poziția…'}</div>
            {navInfo?.off && <div className="small" style={{ color: 'var(--warn)', fontWeight: 600 }}>Ești în afara rutei</div>}
          </div>
          {!followNav && <button className="icon-btn flat" onClick={() => setFollowNav(true)} aria-label="Recentrează"><LocateFixed /></button>}
          <button className="btn danger sm" onClick={() => setNav(false)}><Square /> Oprește</button>
        </div>
      )}
      {!picking && !nav && (
        <RouteSheet
          plan={plan} result={result} selected={selected} onSelect={setSelected} graphReady={!!graph}
          waitingGps={usesMe && !originFix} loc={loc} snap={snap} onSnap={setSnap} onHeight={setSheetH}
          onStart={startNav} onRecenter={() => { if (loc.fix) setOriginFix([loc.fix.lat, loc.fix.lon]); }}
          onEditOrigin={() => setEditing('origin')} onClear={() => { void setPlan({ ...plan, dest: null }); setSnap('peek'); }}
          route={settings.route}
        />
      )}
    </main>
  );
}

function RouteSheet({ plan, result, selected, onSelect, graphReady, waitingGps, loc, snap, onSnap, onHeight, onStart, onRecenter, onEditOrigin, onClear, route }: {
  plan: { origin: Place | null; dest: Place | null }; result: PlanResult | null; selected: ProfileKey; onSelect: (k: ProfileKey) => void; graphReady: boolean;
  waitingGps: boolean; loc: LocState; snap: Snap; onSnap: (s: Snap) => void; onHeight: (h: number) => void;
  onStart: (record: boolean) => void; onRecenter: () => void; onEditOrigin: () => void; onClear: () => void; route: RouteOptions;
}) {
  const simple = (title: string, body: ReactNode) => (
    <SnapSheet label={title} snap="peek" onSnap={() => {}} onHeight={onHeight} peek={<div className="stack" style={{ paddingTop: 2 }}><h2 className="sheet-title">{title}</h2>{body}</div>} />
  );
  if (!plan.dest || !plan.origin) return simple('Planifică un traseu', <p className="small muted">Alege de unde pleci și unde mergi. Îți arătăm cea mai scurtă rută și, unde avem măsurători, una mai confortabilă.</p>);
  if (!graphReady) return simple('Se încarcă străzile…', <div className="skeleton" aria-hidden="true" />);
  if (waitingGps) {
    const failed = loc.status === 'denied' || loc.status === 'unsupported' || loc.status === 'insecure' || loc.status === 'unavailable' || loc.status === 'timeout';
    return simple(failed ? 'Nu avem locația ta' : 'Se caută locația ta…', <>
      <p className="small muted">{loc.message ?? 'Așteptăm primul semnal GPS.'}</p>
      {failed && <button className="btn primary block" onClick={onEditOrigin}><MapPin /> Alege punctul de plecare</button>}
    </>);
  }
  if (!result) return null;
  if (result.error) return simple('Nu am găsit o rută', <><Banner kind="warn">{result.error}</Banner><button className="btn block" onClick={onEditOrigin}>Schimbă pornirea</button></>);
  const v = result.verdict;
  const chosen = result.options.find((o) => o.key === selected) ?? result.options[0];
  const recommended = v.kind === 'better' && chosen.key === v.best;
  const evidence = v.kind === 'nodata'
    ? { tone: 'warn', text: 'Fără măsurători de confort pe această rută' }
    : v.kind === 'insufficient'
      ? { tone: 'warn', text: `Măsurat ${Math.round(chosen.s.measured_pct)}% · prea puțin pentru o recomandare` }
      : { tone: 'comfort', text: `Măsurat ${Math.round(chosen.s.measured_pct)}%${chosen.knownGoodPct !== null ? ` · ${Math.round(chosen.knownGoodPct)}% confortabil` : ''}` };
  const problems = chosen.problems.zones + chosen.problems.reports;
  const peek = (
    <div>
      <div className="row nowrap spread" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h2 className="sheet-title">Spre {plan.dest.name}</h2>
          <div className="route-headline num">
            <b>{Math.max(1, Math.round(chosen.s.minutes))} min</b>
            <span>{fmtLen(chosen.s.length)}</span>
            {problems > 0 && <span className="badge danger">{problems} {problems === 1 ? 'problemă' : 'probleme'}</span>}
          </div>
        </div>
        <button className="icon-btn flat sm" onClick={onClear} aria-label="Închide ruta"><X /></button>
      </div>
      <div className="row" style={{ margin: '6px 0 12px', gap: 6 }}>
        <span className={`badge ${evidence.tone}`}>{evidence.text}</span>
        {result.options.length > 1 && <span className="badge primary">{recommended ? `Recomandată: ${PROFILE_LABEL[chosen.key].toLowerCase()}` : PROFILE_LABEL[chosen.key]}</span>}
      </div>
      <div className="grid2">
        <button className="btn primary" onClick={() => onStart(false)}><Navigation /> Urmărește-mă</button>
        <button className="btn" onClick={() => onStart(true)}><Bike /> Înregistrează</button>
      </div>
    </div>
  );
  return (
    <SnapSheet label="Rute" snap={snap} onSnap={onSnap} onHeight={onHeight} peek={peek}>
      <div className="stack">
        <Banner kind={v.kind === 'better' ? 'ok' : v.kind === 'same' ? 'info' : 'warn'}>{v.text}</Banner>
        <div role="radiogroup" aria-label="Alternative de rută">
          {result.options.map((o) => <RouteCard key={o.key} o={o} on={o.key === chosen.key} recommended={v.kind === 'better' && o.key === v.best} onClick={() => onSelect(o.key)} />)}
        </div>
        {result.options.length === 1 && v.kind !== 'better' && <p className="xs muted">Alternativele mai lungi nu sunt afișate: fără măsurători nu putem spune că sunt mai confortabile.</p>}
        <div className="section-label" style={{ marginTop: 18 }}>Ce poți face</div>
        <div className="list">
          <div className="item"><span className="ic"><MapIcon /></span><span className="grow"><div className="t">Vezi ruta</div><div className="s wrap">Doar pe hartă — ce faci acum.</div></span></div>
          <div className="item"><span className="ic primary"><Navigation /></span><span className="grow"><div className="t">Urmărește-mă</div><div className="s wrap">Punctul tău albastru pe rută și distanța rămasă. Fără indicații de viraj.</div></span></div>
          <div className="item"><span className="ic comfort"><Bike /></span><span className="grow"><div className="t">Înregistrează</div><div className="s wrap">Pornește o tură care măsoară vibrațiile. Ecranul rămâne aprins.</div></span></div>
        </div>
        <p className="xs muted">Confortul nu înseamnă siguranță: alege mereu drumul pe care îl consideri sigur.</p>
        {plan.origin.kind === 'mylocation' && <button className="btn sm ghost block" onClick={onRecenter}>Pornește de la poziția mea actuală</button>}
        <details className="card">
          <summary>Opțiuni de rutare</summary>
          <label className="switch"><input type="checkbox" checked={route.allowSidewalks} onChange={(e) => updateSettings({ route: { ...route, allowSidewalks: e.target.checked } })} />Permite trotuarele fără marcaj pentru biciclete</label>
          <label className="switch"><input type="checkbox" checked={route.useOsmSurface} onChange={(e) => updateSettings({ route: { ...route, useOsmSurface: e.target.checked } })} />Ține cont de pavajul declarat în OpenStreetMap (estimat, nu măsurat)</label>
          <p className="xs muted">Străzile nemăsurate primesc o penalizare neutră; șocurile punctuale nu intră în cost (sunt deja în indicele de vibrație).</p>
        </details>
      </div>
    </SnapSheet>
  );
}

function RouteCard({ o, on, recommended, onClick }: { o: RouteOptionView; on: boolean; recommended: boolean; onClick: () => void }) {
  const known = Object.values(o.knownByClass).reduce((a, b) => a + b, 0);
  return (
    <button className="route-card" role="radio" aria-checked={on} aria-pressed={on} onClick={onClick}>
      <div className="small" style={{ fontWeight: 650, color: 'var(--fg-2)' }}>{PROFILE_LABEL[o.key]}{recommended && <span className="badge comfort" style={{ marginLeft: 6 }}>recomandată</span>}</div>
      <div className="big num">{Math.max(1, Math.round(o.s.minutes))} min <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>· {fmtLen(o.s.length)}</span></div>
      <div className="bar" style={{ margin: '10px 0 6px' }} aria-hidden="true">
        {(['A', 'B', 'C', 'D', 'E'] as const).map((c) => <i key={c} style={{ width: `${(100 * o.knownByClass[c]) / o.s.length}%`, background: CLASS_COLORS[c] }} />)}
      </div>
      <div className="xs" style={{ color: 'var(--fg-2)' }}>
        {known > 0 ? <>Măsurat {Math.round(o.s.measured_pct)}% · confortabil (A–B) {Math.round(o.knownGoodPct ?? 0)}% din partea măsurată</> : 'Niciun segment măsurat'}
        {' · '}necunoscut {Math.round(o.s.unknown_pct)}%
        {(o.problems.zones > 0 || o.problems.reports > 0) && <span style={{ color: 'var(--danger)', fontWeight: 650 }}> · {o.problems.zones + o.problems.reports} probleme cunoscute</span>}
      </div>
      <span className="sr-only">{(['A', 'B', 'C', 'D', 'E'] as const).map((c) => `${t.classShort[c]} ${Math.round(o.knownByClass[c])} metri`).join(', ')}</span>
    </button>
  );
}

function SearchOverlay({ field, onClose, onPick, onMap }: { field: 'origin' | 'dest'; onClose: () => void; onPick: (p: Place) => void; onMap: () => void }) {
  const graph = useApp((s) => s.graph);
  const recent = useApp((s) => s.recent);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 350);
  const [remote, setRemote] = useState<{ q: string; places: Place[]; error: string | null; loading: boolean }>({ q: '', places: [], error: null, loading: false });
  const index = useMemo(() => {
    if (!graph) return [];
    if (streetIndexCache?.g !== graph) streetIndexCache = { g: graph, idx: buildStreetIndex(graph) };
    return streetIndexCache.idx;
  }, [graph]);
  const local = useMemo(() => searchStreets(index, q, 5), [index, q]);
  useEffect(() => {
    if (dq.trim().length < 3) { setRemote({ q: dq, places: [], error: null, loading: false }); return; }
    const ctl = new AbortController(); // cererea depășită se anulează
    setRemote((r) => ({ ...r, loading: true, error: null }));
    geocoder.search(dq, ctl.signal)
      .then((places) => setRemote({ q: dq, places, error: null, loading: false }))
      .catch((e: unknown) => { if (e instanceof GeocodeError && e.kind === 'aborted') return; setRemote({ q: dq, places: [], error: (e as Error).message, loading: false }); });
    return () => ctl.abort();
  }, [dq]);
  const remoteNew = remote.places.filter((p) => !local.some((l) => l.name === p.name && p.kind === 'street'));
  const nothing = q.trim().length >= 3 && !remote.loading && dq === q && local.length === 0 && remoteNew.length === 0;
  const pickMe = () => onPick(MY_LOC());

  return (
    <div className="overlay-full" role="dialog" aria-label={field === 'origin' ? 'Alege pornirea' : 'Alege destinația'}>
      <div className="search-head">
        <button className="icon-btn flat" onClick={onClose} aria-label="Înapoi"><ArrowLeft /></button>
        <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={field === 'origin' ? 'De unde pleci?' : 'Caută o adresă, stradă sau loc'} aria-label="Caută" enterKeyHint="search" autoComplete="off" />
        {q && <button className="icon-btn flat" onClick={() => setQ('')} aria-label="Șterge textul"><X /></button>}
      </div>
      <div className="search-body">
        <div className="list">
          <button className="item" onClick={pickMe}><span className="ic primary"><LocateFixed /></span><span className="grow"><div className="t">Locația mea</div><div className="s">Folosește GPS-ul telefonului</div></span></button>
          <button className="item" onClick={onMap}><span className="ic"><MapPin /></span><span className="grow"><div className="t">Alege pe hartă</div><div className="s">Mută harta până la punctul dorit</div></span></button>
        </div>
        {!q && recent.length > 0 && (
          <>
            <div className="row spread"><div className="section-label">Recente (doar pe acest telefon)</div><button className="btn sm ghost" style={{ minHeight: 36 }} onClick={() => void clearRecent()}>Șterge</button></div>
            <div className="list">{recent.map((p) => <PlaceRow key={p.id} p={p} icon={<History />} onClick={() => onPick(p)} />)}</div>
          </>
        )}
        {local.length > 0 && (<><div className="section-label">Străzi</div><div className="list">{local.map((p) => <PlaceRow key={p.id} p={p} icon={<MapPin />} onClick={() => onPick(p)} />)}</div></>)}
        {remoteNew.length > 0 && (<><div className="section-label">Adrese și locuri</div><div className="list">{remoteNew.map((p) => <PlaceRow key={p.id} p={p} icon={<Search />} onClick={() => onPick(p)} />)}</div></>)}
        <div style={{ marginTop: 14 }} aria-live="polite">
          {remote.loading && <p className="small muted">Se caută adrese…</p>}
          {remote.error && <Banner kind="warn">{remote.error} Poți alege o stradă din lista de mai sus sau un punct pe hartă.</Banner>}
          {nothing && !remote.error && <Banner kind="warn">Nu am găsit „{q}” în Timișoara. Încearcă alt nume sau alege punctul pe hartă.</Banner>}
          {q.trim().length > 0 && q.trim().length < 3 && local.length === 0 && <p className="small muted">Scrie cel puțin 3 litere.</p>}
          <p className="xs muted" style={{ marginTop: 16 }}>Străzile se caută local, din OpenStreetMap. Adresele și locurile se caută prin serviciul public Photon (komoot): textul căutat e trimis acolo; locația ta nu. Serviciul e gratuit și poate fi uneori indisponibil.</p>
        </div>
      </div>
    </div>
  );
}

function PlaceRow({ p, icon, onClick }: { p: Place; icon: JSX.Element; onClick: () => void }) {
  return <button className="item" onClick={onClick}><span className="ic">{icon}</span><span className="grow"><div className="t">{p.name}</div><div className="s">{p.detail}</div></span></button>;
}
