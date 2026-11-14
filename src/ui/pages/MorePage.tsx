import { t } from '../../i18n/ro';

export function MorePage() {
  const items: [string, string, string][] = [
    ['#/compare', t.nav.compare, 'Două trasee parcurse efectiv între aceleași puncte'],
    ['#/record', t.nav.record, 'Înregistrator propriu (P1): ecranul trebuie să rămână aprins'],
    ['#/about', t.nav.about, 'Surse, limitări, exporturi GeoJSON, ce date stocăm'],
    ['#/diag', t.nav.diag, 'Senzori, frecvență, GPS și permisiuni pe acest telefon'],
    ['#/settings', t.nav.settings, 'Ștergerea datelor locale, configurația (Developer)'],
    ['#/', t.nav.home, ''],
  ];
  return (
    <div className="stack">
      <h1>{t.nav.more}</h1>
      {items.map(([h, l, d]) => (
        <a key={h} href={h} className="btn big" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span>{l}</span>
          {d && <span className="small muted">{d}</span>}
        </a>
      ))}
    </div>
  );
}
