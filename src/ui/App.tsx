import { useEffect, useState } from 'react';
import { t } from '../i18n/ro';
import { useApp } from '../state/store';
import { AboutPage } from './pages/AboutPage';
import { ComparePage } from './pages/ComparePage';
import { DiagnosticPage } from './pages/DiagnosticPage';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { MapPage } from './pages/MapPage';
import { MorePage } from './pages/MorePage';
import { RecordPage } from './pages/RecordPage';
import { ReplayPage } from './pages/ReplayPage';
import { RidesPage } from './pages/RidesPage';
import { RoutePage } from './pages/RoutePage';
import { SettingsPage } from './pages/SettingsPage';

function useHash() {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setH(location.hash.slice(1) || '/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return h;
}

export function go(path: string) {
  location.hash = path;
}

const NAV: [string, string, string][] = [
  ['/map', t.nav.map, '🗺'],
  ['/route', t.nav.route, '↗'],
  ['/import', t.nav.import, '⤓'],
  ['/rides', t.nav.rides, '≡'],
  ['/more', t.nav.more, '⋯'],
];

export function App() {
  const path = useHash();
  const ready = useApp((s) => s.ready);
  const [, base, arg] = path.split('/');
  let page: JSX.Element;
  switch (base) {
    case 'map': page = <MapPage focus={arg} />; break;
    case 'route': page = <RoutePage />; break;
    case 'import': page = <ImportPage />; break;
    case 'rides': page = <RidesPage />; break;
    case 'ride': page = <ReplayPage id={arg} />; break;
    case 'compare': page = <ComparePage />; break;
    case 'about': page = <AboutPage />; break;
    case 'diag': page = <DiagnosticPage />; break;
    case 'settings': page = <SettingsPage />; break;
    case 'record': page = <RecordPage />; break;
    case 'more': page = <MorePage />; break;
    default: page = <HomePage />;
  }
  const fullMap = base === 'map' || base === 'route';
  return (
    <div className={`app ${fullMap ? 'app-map' : ''}`}>
      <header className="topbar">
        <a href="#/" className="brand" aria-label="ShockGrid, acasă">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
          <span>{t.app.name}</span>
        </a>
        {!ready && <span className="muted small">{t.common.loading}</span>}
      </header>
      <main className={fullMap ? 'main-map' : 'main'} id="main">{page}</main>
      <nav className="bottomnav" aria-label="Navigare principală">
        {NAV.map(([p, label, icon]) => {
          const active = `/${base}` === p || (p === '/more' && ['about', 'diag', 'settings', 'record', 'compare', 'more'].includes(base));
          return (
            <a key={p} href={`#${p}`} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
              <span aria-hidden="true" className="navicon">{icon}</span>
              <span>{label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
