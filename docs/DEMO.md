# Demo de 2 minute

Fluxul: **Sensor Logger → import ZIP → procesare RVI → segmente OSM colorate → comparația a două rute reale → recomandare condiționată de acoperirea datelor.** Fără date fictive.

**Pregătire:** stratul publicat are deja câțiva km măsurați (`npm run build-layer`); pe telefon, în ShockGrid → Rută, A și B sunt alese; o tură reală nouă (ZIP) e în Fișiere/Descărcări, neimportată.

1. **Problema (15 s):** „O pistă pe hartă nu-ți spune cât de rău te zdruncină. Asta contează pentru cine face naveta zilnic și pentru curierii care duc mâncare.”
2. **Măsurătoarea (25 s):** Importă tura → ZIP-ul Sensor Logger real → progres → rezumat. Hartă: segmentul neted față de pavaj (atingere pe segment: RVI, clasă, treceri, sursa). Replay: semnalul real.
3. **Comparația (30 s):** Compară → două trasee parcurse cu aceeași bicicletă și același telefon: distanța, RVI cu interval, doza de vibrații, verdictul („diferență neconcludentă” dacă intervalele se suprapun). Notele bicicliștilor, din `eval/`.
4. **Rutarea (25 s):** Rută: cea mai scurtă vs echilibrat/curier; metrii măsurați, estimați și necunoscuți; avertismentul de date insuficiente pe o rută nemăsurată. **Momentul decisiv:** importă tura nouă → „Ce s-a schimbat pe hartă” (km, muchii noi, treceri) → ruta se recalculează; spune dacă recomandarea s-a schimbat sau de ce nu. Dacă nu s-a schimbat, nu se inventează o schimbare.
5. **Încrederea (15 s):** repetabilitatea între treceri și obstacolele de referință detectate, cu numitori (Despre date → Validare); o zonă cu șoc pe hartă, cu semnalul ei real.
6. **Adoptarea (10 s):** cod MIT, date ODbL, fără server, fără conturi; export GeoJSON pentru departamentul municipal responsabil de infrastructura velo (beneficiar posibil, nu partener confirmat) și o listă de segmente pentru Sesizări. Cifra de urmărit: reproductibilitatea RVI între treceri, apoi km de rețea velo măsurați.

Nu se prezintă un procent obținut din câteva ture ca beneficiu general. Confortul nu e siguranță.

**Rezervă:** aplicația instalată merge fără internet pentru import, procesare, rutare și replay (tile-urile deja văzute rămân în cache); plus video înregistrat al demo-ului.
