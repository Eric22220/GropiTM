import { Bookmark, Camera, Check, Copy, ExternalLink, Share2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { nearestStreetName } from '../../services/geocode';
import { prepPhoto } from '../../services/photo';
import { createReport, quickMark, REPORT_TYPES, sesizareText, updateReport, VISIBILITY_LABEL } from '../../services/reports';
import type { ReportType } from '../../storage/idb';
import { removeReport, saveReport, useApp } from '../../state/store';
import { Banner, Header, toast } from '../kit';
import { gpsQuality, useLocation } from '../map/me';
import { useLeaflet } from '../map/useLeaflet';
import { go } from '../App';

export function ReportScreen({ id, lat, lon }: { id?: string; quick?: boolean; lat?: number; lon?: number }) {
  const existing = useApp((s) => (id && id !== 'new' ? s.reports.find((r) => r.id === id) : undefined));
  const graph = useApp((s) => s.graph);
  const isNew = !existing;
  const given = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 ? ([lat!, lon!] as [number, number]) : null;
  const loc = useLocation(isNew && !given);
  const start: [number, number] | null = existing ? [existing.lat, existing.lon] : given ?? (loc.fix ? [loc.fix.lat, loc.fix.lon] : null);
  const [type, setType] = useState<ReportType>(existing?.type ?? 'nespecificat');
  const [desc, setDesc] = useState(existing?.description ?? '');
  const [photo, setPhoto] = useState<Blob | null>(existing?.photo ?? null);
  const [point, setPoint] = useState<[number, number] | null>(start);
  const [saving, setSaving] = useState(false);
  const fileIn = useRef<HTMLInputElement | null>(null);
  const { ref, map } = useLeaflet({ zoom: 18, center: start ?? undefined });
  // poziția inițială apare odată cu primul fix GPS
  useEffect(() => { if (!point && start) { setPoint(start); map?.setView(start, 18); } }, [start?.[0], start?.[1], map]);
  useEffect(() => {
    if (!map) return;
    const upd = () => { const c = map.getCenter(); setPoint([c.lat, c.lng]); };
    map.on('moveend', upd);
    return () => { map.off('moveend', upd); };
  }, [map]);
  const street = useMemo(() => (graph && point ? nearestStreetName(graph, point[0], point[1]) : null), [graph, point]);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  const acc = existing ? existing.acc : given ? null : loc.fix?.acc ?? null;

  const save = async () => {
    if (!point) return;
    setSaving(true);
    try {
      const r = existing
        ? updateReport(existing, { type, description: desc, photo, lat: point[0], lon: point[1] })
        : createReport({ lat: point[0], lon: point[1], acc, type, description: desc, photo });
      if (r.type === 'nespecificat') r.status = 'draft';
      await saveReport(r);
      toast(existing ? 'Raport actualizat (doar pe acest telefon).' : 'Raport salvat pe acest telefon.');
      go(existing ? '/reports' : '/');
    } finally { setSaving(false); }
  };
  const mark = async () => {
    if (!point) return;
    await saveReport(quickMark(point[0], point[1], acc));
    toast('Locul a fost marcat. Completezi raportul mai târziu.');
    go('/');
  };

  return (
    <main className="screen" style={{ paddingBottom: 32 }}><div className="wrap stack">
      <Header title={isNew ? 'Raportează o problemă' : existing.status === 'draft' ? 'Completează raportul' : 'Raportul tău'} back={isNew ? '#/' : '#/reports'} />
      {isNew && <Banner kind="info">Oprește-te într-un loc sigur înainte să completezi.</Banner>}
      <div style={{ position: 'relative' }}>
        <div ref={ref} className="map inline tall" role="application" aria-label="Mută harta pentru a ajusta locul problemei" />
        <div className="pick-center" aria-hidden="true"><div className="pin" style={{ background: '#c2261b' }}><span>!</span></div></div>
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>
        {point ? <>{street ? <b>{street}</b> : 'Punct ales'} · mută harta ca să ajustezi locul{!existing && !given && loc.fix && <> · GPS {gpsQuality(loc.fix.acc).label}</>}</> : loc.message ?? 'Se caută poziția GPS… sau mută harta la locul problemei.'}
      </p>
      {!point && <button className="btn block" onClick={() => { const c = map?.getCenter(); if (c) setPoint([c.lat, c.lng]); }}>Folosește centrul hărții</button>}
      {isNew && <button className="btn block lg" onClick={mark} disabled={!point}><Bookmark /> Marchează pentru mai târziu</button>}
      <h2>Ce problemă este?</h2>
      <div className="choice-grid" role="group" aria-label="Tipul problemei">
        {REPORT_TYPES.map((x) => <button key={x.id} className="choice" aria-pressed={type === x.id} onClick={() => setType(x.id)}><b>{x.label}</b>{x.hint && <span>{x.hint}</span>}</button>)}
      </div>
      <h2>Fotografie și detalii <span className="muted small">(opțional)</span></h2>
      <input ref={fileIn} type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await prepPhoto(f)); e.target.value = ''; }} />
      {photoUrl ? (
        <div style={{ position: 'relative' }}><img src={photoUrl} alt="Fotografia problemei" className="photo-thumb" /><button className="icon-btn" style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => setPhoto(null)} aria-label="Elimină fotografia"><X /></button></div>
      ) : <button className="btn block ghost" onClick={() => fileIn.current?.click()}><Camera /> Adaugă o fotografie</button>}
      <label className="field"><span>Descriere</span><textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1000} placeholder="ex. groapă adâncă lângă bordură, pe banda de biciclete" /></label>
      <button className="btn primary block lg" onClick={save} disabled={!point || saving}><Check /> {existing ? 'Salvează modificările' : 'Salvează raportul'}</button>
      <p className="xs muted" style={{ textAlign: 'center' }}>{VISIBILITY_LABEL.device}. Nu e trimis nimănui automat. Fotografia e micșorată și fără metadate GPS.</p>
      {existing && existing.status === 'local' && <SesizareBox text={sesizareText(existing, street)} photo={existing.photo} />}
      {existing && <button className="btn danger block" onClick={async () => { if (confirm('Ștergi raportul de pe acest telefon? Nu se poate anula.')) { await removeReport(existing.id); go('/reports'); } }}><Trash2 /> Șterge raportul</button>}
    </div></main>
  );
}

function SesizareBox({ text, photo }: { text: string; photo: Blob | null }) {
  return (
    <div className="card stack">
      <h3>Trimite la Primărie (opțional)</h3>
      <p className="small muted">Canalul oficial pentru probleme în spațiul public este Sesizări. Copiază textul și, dacă vrei, atașează fotografia acolo.</p>
      <pre>{text}</pre>
      <div className="grid2">
        <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); toast('Text copiat'); } catch { toast('Nu am putut copia; selectează textul manual.'); } }}><Copy /> Copiază</button>
        <a className="btn primary" href="https://sesizari.primariatm.ro/" target="_blank" rel="noopener"><ExternalLink /> Sesizări</a>
      </div>
      {'share' in navigator && <button className="btn ghost block" onClick={async () => {
        const files = photo ? [new File([photo], 'problema.jpg', { type: 'image/jpeg' })] : [];
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        try { await navigator.share(files.length && nav.canShare?.({ files }) ? { text, files } : { text }); } catch { /* anulat */ }
      }}><Share2 /> Partajează text{photo ? ' și fotografie' : ''}</button>}
    </div>
  );
}
