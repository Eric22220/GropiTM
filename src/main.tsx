import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import * as store from './state/store';
import './ui/styles.css';

const { init } = store;
// doar în dezvoltare: acces la store din consolă pentru testele manuale
if (import.meta.env.DEV) (window as unknown as { __sg: typeof store }).__sg = store;
registerSW({ immediate: true });
init().catch((e) => console.error('init', e));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
