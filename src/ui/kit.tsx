import { AlertTriangle, CheckCircle2, ChevronRight, Info, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
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
