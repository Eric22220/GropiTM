// Actualizarea aplicației instalate (PWA). Service worker-ul nou se activează imediat (skipWaiting +
// clientsClaim), deci și utilizatorii existenți primesc versiunea nouă. Pagina se reîncarcă automat DOAR
// când nu se pierde nimic: nu în timpul unei ture și nu cu un formular de raport deschis. Altfel apare un
// banner „Versiune nouă”, iar reîncărcarea se face la următorul moment sigur.
import { Workbox } from 'workbox-window';

let wb: Workbox | null = null;
let pending = false;
let blocked: () => boolean = () => false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const updatePending = () => pending;
export function subscribeUpdate(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** reîncarcă dacă există o versiune nouă și momentul e sigur; întoarce true dacă a reîncărcat */
export function reloadIfSafe(): boolean {
  if (!pending || blocked()) return false;
  location.reload();
  return true;
}

export function initUpdates(isBusy: () => boolean) {
  blocked = isBusy;
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  wb = new Workbox(`${base}sw.js`, { scope: base });
  wb.addEventListener('controlling', (e) => {
    if (!e.isUpdate) return;
    pending = true;
    emit();
    reloadIfSafe();
  });
  wb.register().catch((e) => console.warn('SW', e));
  const check = () => { wb?.update().catch(() => {}); };
  setInterval(check, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  addEventListener('hashchange', () => { reloadIfSafe(); });
}

export async function checkForUpdate(): Promise<'pending' | 'current' | 'unavailable'> {
  if (!wb) return 'unavailable';
  try { await wb.update(); } catch { return 'unavailable'; }
  await new Promise((r) => setTimeout(r, 1500));
  return pending ? 'pending' : 'current';
}
