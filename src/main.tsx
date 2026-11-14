import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import * as store from './state/store';
import { initUpdates } from './services/update';
import { rideActive } from './services/ride';
import { warmWorker } from './worker/client';
import '@fontsource-variable/inter';
import './ui/styles.css';

const { init } = store;
// doar în dezvoltare: acces la store din consolă pentru testele manuale
if (import.meta.env.DEV) (window as unknown as { __sg: typeof store }).__sg = store;
// worker-ul de procesare se încarcă de la început, ca o actualizare a aplicației în timpul unei ture să nu-l facă indisponibil
warmWorker();
initUpdates(() => rideActive() || location.hash.startsWith('#/report') || location.hash.startsWith('#/import'));
init().catch((e) => console.error('init', e));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
