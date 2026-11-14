import { Bike, Map as MapIcon, Menu, Navigation } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { rideActive, subscribeRide } from '../services/ride';
import { subscribeUpdate, updatePending } from '../services/update';
import { useApp } from '../state/store';
import { ErrorBoundary } from './ErrorBoundary';
import { Header, Toaster } from './kit';
import { AdvancedPage } from './pages/AdvancedPage';
import { ComparePage } from './pages/ComparePage';
import { DataPage } from './pages/DataPage';
import { ImportPage } from './pages/ImportPage';
import { MapScreen } from './pages/MapScreen';
import { MethodologyPage } from './pages/MethodologyPage';
import { MorePage } from './pages/MorePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { RecordScreen } from './pages/RecordScreen';
import { ReplayPage } from './pages/ReplayPage';
import { ReportScreen } from './pages/ReportScreen';
import { ReportsPage } from './pages/ReportsPage';
import { ReviewScreen } from './pages/ReviewScreen';
import { RideDetail } from './pages/RideDetail';
import { RidesPage } from './pages/RidesPage';
import { RouteScreen } from './pages/RouteScreen';

function useHash() {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setH(location.hash.slice(1) || '/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return h;
}

export function go(path: string) { location.hash = path; }

type Tab = 'map' | 'route' | 'rides' | 'more';
const TABS: { id: Tab; href: string; label: string; Icon: typeof MapIcon }[] = [
  { id: 'map', href: '#/', label: 'Hartă', Icon: MapIcon },
  { id: 'route', href: '#/route', label: 'Traseu', Icon: Navigation },
  { id: 'rides', href: '#/rides', label: 'Ture', Icon: Bike },
  { id: 'more', href: '#/more', label: 'Mai mult', Icon: Menu },
];

export function App() {
  const path = useHash();
  const [pathname, query = ''] = path.split('?');
  const [, base = '', arg, arg2] = pathname.split('/');
  const params = new URLSearchParams(query);
  const recording = useSyncExternalStore(subscribeRide, rideActive);
  const mapStyle = useApp((s) => s.settings.mapStyle);
  const updateReady = useSyncExternalStore(subscribeUpdate, updatePending);
  let page: JSX.Element;
  let tab: Tab = 'map';
  let navHidden = false;
  switch (base) {
    case '': case 'map': page = <MapScreen focus={arg} />; break;
    case 'route': tab = 'route'; page = <RouteScreen focus={params.get('focus')} />; break;
    case 'rides': tab = 'rides'; page = <RidesPage />; break;
    case 'import': tab = 'rides'; page = <ImportPage />; break;
    case 'record': tab = 'rides'; navHidden = true; page = <RecordScreen />; break;
    case 'ride': tab = 'rides'; page = arg2 === 'replay' ? <main className="screen"><div className="wrap"><Header title="Grafic vibrații" back={`#/ride/${arg}`} /><ReplayPage id={arg} /></div></main> : <RideDetail id={arg} />; break;
    case 'review': tab = 'rides'; page = <ReviewScreen id={arg} />; break;
    case 'compare': tab = 'rides'; page = <main className="screen"><div className="wrap"><Header title="Compară ture" back="#/rides" /><ComparePage /></div></main>; break;
    case 'report': tab = 'map'; navHidden = true; page = <ReportScreen id={arg} quick={params.get('quick') === '1'} lat={Number(params.get('lat'))} lon={Number(params.get('lon'))} />; break;
    case 'reports': tab = 'more'; page = <ReportsPage />; break;
    case 'more':
      tab = 'more';
      page = arg === 'method' ? <MethodologyPage /> : arg === 'data' ? <DataPage /> : arg === 'privacy' ? <PrivacyPage /> : arg === 'advanced' ? <AdvancedPage sub={arg2} /> : <MorePage />;
      break;
    default: page = <MapScreen />;
  }
  return (
    <div className={`app tiles-${mapStyle}`}>
      <ErrorBoundary resetKey={pathname}>{page}</ErrorBoundary>
      {!navHidden && (
        <nav className="nav" aria-label="Navigare principală">
          {TABS.map(({ id, href, label, Icon }) => (
            <a key={id} href={href} aria-current={tab === id ? 'page' : undefined}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {id === 'rides' && recording && <i className="dot" aria-label="tură în curs" />}
            </a>
          ))}
        </nav>
      )}
      {updateReady && <button className="update-pill" onClick={() => location.reload()}>Versiune nouă instalată · Reîncarcă</button>}
      <Toaster />
    </div>
  );
}
