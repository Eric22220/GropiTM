import { AlertTriangle, CheckCircle2, ChevronRight, Info, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ComfortClass } from '../core/aggregate';
import { CLASS_COLORS } from './format';

export function Sheet({ title, onClose, children, full, label, actions }: { title?: ReactNode; onClose?: () => void; children: ReactNode; full?: boolean; label?: string; actions?: ReactNode }) {
  return (
    <section className={`sheet ${full ? 'full' : ''}`} role="dialog" aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      <div className="handle" aria-hidden="true" />
      {(title || onClose) && (
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          {onClose && <button className="icon-btn flat" onClick={onClose} aria-label="Închide"><X /></button>}
        </div>
      )}
      <div className="sheet-body">{children}</div>
    </section>
  );
}

export type Snap = 'peek' | 'half' | 'full';
const ORDER: Snap[] = ['peek', 'half', 'full'];

/** alege poziția după tragere: viteza contează, altfel cea mai apropiată înălțime */
export function snapAfterDrag(h: number, v: number, heights: Record<Snap, number>, from: Snap): Snap {
  const i = ORDER.indexOf(from);
  if (v < -0.45) return ORDER[Math.min(2, i + 1)];
  if (v > 0.45) return ORDER[Math.max(0, i - 1)];
  return ORDER.reduce((best, s) => (Math.abs(heights[s] - h) < Math.abs(heights[best] - h) ? s : best), 'peek' as Snap);
}

/**
 * Panou de jos cu trei poziții: compact (doar rezumatul), extins (~55%) și complet.
 * Se trage de mâner, se apasă pe mâner pentru a trece la următoarea poziție, sau din tastatură.
 */
export function SnapSheet({ snap, onSnap, peek, children, label, onHeight }: { snap: Snap; onSnap: (s: Snap) => void; peek: ReactNode; children?: ReactNode; label: string; onHeight?: (h: number) => void }) {
  const ref = useRef<HTMLElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ H: 600, peekH: 180 });
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number; t: number; moved: boolean } | null>(null);
  useEffect(() => {
    const el = ref.current, parent = el?.parentElement, pk = peekRef.current;
    if (!el || !parent || !pk) return;
    const measure = () => setBox({ H: parent.clientHeight, peekH: Math.ceil(pk.getBoundingClientRect().height) + 26 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    ro.observe(pk);
    return () => ro.disconnect();
  }, []);
  const heights: Record<Snap, number> = {
    peek: Math.min(box.peekH, Math.max(box.H * 0.5, box.H - 120)),
    half: Math.max(Math.min(box.peekH + 40, box.H - 60), Math.round(box.H * 0.56)),
    full: box.H - 12,
  };
  const h = drag ?? heights[snap];
  useEffect(() => { if (drag === null) onHeight?.(heights[snap]); }, [snap, drag, heights[snap]]); // eslint-disable-line react-hooks/exhaustive-deps
  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button:not(.grab-btn), a, input')) return;
    start.current = { y: e.clientY, h: heights[snap], t: performance.now(), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dy = e.clientY - s.y;
    if (Math.abs(dy) > 6) s.moved = true;
    if (s.moved) setDrag(Math.max(heights.peek * 0.7, Math.min(heights.full, s.h - dy)));
  };
  const up = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved) { setDrag(null); return; }
    const dy = e.clientY - s.y;
    const v = dy / Math.max(1, performance.now() - s.t);
    const next = snapAfterDrag(s.h - dy, v, heights, snap);
    setDrag(null);
    onSnap(next);
  };
  const cycle = () => onSnap(snap === 'full' ? 'peek' : ORDER[ORDER.indexOf(snap) + 1]);
  return (
    <section ref={ref} className={`sheet snap ${drag !== null ? 'dragging' : ''}`} style={{ height: h }} role="dialog" aria-label={label}>
      <div className="sheet-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <button className="grab-btn" onClick={cycle} aria-label={snap === 'full' ? 'Restrânge panoul' : 'Extinde panoul'} aria-expanded={snap !== 'peek'}
          onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); onSnap(ORDER[Math.min(2, ORDER.indexOf(snap) + 1)]); } if (e.key === 'ArrowDown') { e.preventDefault(); onSnap(ORDER[Math.max(0, ORDER.indexOf(snap) - 1)]); } }} />
        <div ref={peekRef} className="sheet-peek">{peek}</div>
      </div>
      <div className={`sheet-body ${snap === 'peek' && drag === null ? 'locked' : ''}`}>{children}</div>
    </section>
  );
}

export function Banner({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  const Ic = kind === 'ok' ? CheckCircle2 : kind === 'info' ? Info : AlertTriangle;
  return <div className={`banner ${kind}`} role={kind === 'danger' ? 'alert' : undefined}><Ic aria-hidden="true" /><div>{children}</div></div>;
}

export function Item({ icon, tone, title, sub, href, onClick, right, chevron = true }: { icon?: ReactNode; tone?: 'primary' | 'comfort' | 'danger' | 'warn'; title: ReactNode; sub?: ReactNode; href?: string; onClick?: () => void; right?: ReactNode; chevron?: boolean }) {
  const inner = (
    <>
      {icon && <span className={`ic ${tone ?? ''}`} aria-hidden="true">{icon}</span>}
      <span className="grow"><div className="t">{title}</div>{sub && <div className="s">{sub}</div>}</span>
      {right}
      {chevron && (href || onClick) && <ChevronRight className="chev" aria-hidden="true" />}
    </>
  );
  if (href) return <a className="item" href={href}>{inner}</a>;
  if (onClick) return <button className="item" onClick={onClick}>{inner}</button>;
  return <div className="item">{inner}</div>;
}

export function ClassBadge({ c }: { c: ComfortClass }) {
  return <span className="cls" style={{ background: CLASS_COLORS[c] }} aria-label={`clasa ${c}`}>{c}</span>;
}

export function Stat({ v, unit, l, big }: { v: ReactNode; unit?: string; l: string; big?: boolean }) {
  return <div className={`stat ${big ? 'big' : ''}`}><div className="v">{v}{unit && <small>{unit}</small>}</div><div className="l">{l}</div></div>;
}

export function Header({ title, back, right }: { title: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <div className="header">
      {back && <a className="icon-btn flat" href={back} aria-label="Înapoi"><ChevronRight style={{ transform: 'rotate(180deg)' }} /></a>}
      <h1>{title}</h1>
      {right}
    </div>
  );
}

// ---- toast simplu, global ----
let toastMsg: string | null = null;
let toastTimer: number | null = null;
const tl = new Set<() => void>();
export function toast(msg: string) {
  toastMsg = msg;
  tl.forEach((l) => l());
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastMsg = null; tl.forEach((l) => l()); }, 3200);
}
export function Toaster() {
  const m = useSyncExternalStore((l) => { tl.add(l); return () => tl.delete(l); }, () => toastMsg);
  return m ? <div className="toast" role="status" aria-live="polite">{m}</div> : null;
}

export function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => { const h = setTimeout(() => setD(v), ms); return () => clearTimeout(h); }, [v, ms]);
  return d;
}
