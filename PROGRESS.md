# PROGRESS — ShockGrid (GropiTM v7)

Fișier de reluare: ce merge, ce a fost verificat și cum, ce nu merge. Cel mai nou sus.

## Decizii și abateri de la specificație
- **Nume:** aplicația se numește **ShockGrid** (numele repo-ului și al echipei). Specificația v7 o numește „GropiTM”; e același produs. Repo: `Eric22220/ShockGrid`, URL `https://eric22220.github.io/ShockGrid/` (spec. 0.0 cerea `gh repo create gropitm`; utilizatorul a cerut explicit folosirea repo-ului existent).
- **Promptul „final”:** în folder există un singur fișier Markdown de specificație, `GropiTM_Prompt_ClaudeCode_v7.md`; el e tratat ca specificația finală.
- **Overpass blocat local:** din mediul de dezvoltare (sandbox) nu se poate accesa overpass-api.de. Graful se construiește în GitHub Actions (`.github/workflows/build-graph.yml`, rulare manuală), care comite `data/raw/overpass-timisoara.json.gz` și `public/data/graph-timisoara.json`, apoi declanșează deploy-ul. Rezultatul brut e comis, ca în spec. 8.1 (comprimat gzip, ca să nu umfle repo-ul).
- **Geometria grafului** e codificată polyline (precizie 5, ~1 m) în loc de liste de coordonate: fișierul e de câteva ori mai mic pe telefon. Muchia are 3 câmpuri în plus față de 7.4: `surface_kind`, `bicycle`, `name`.
- **Map-matching în firul principal, DSP în Web Worker:** procesarea grea (ZIP, gravitație, filtre, ferestre, șocuri) rulează în worker; potrivirea pe străzi rulează în firul principal, ca graful să existe o singură dată în memorie (important pe iPhone). Potrivirea durează sub o secundă pe o tură obișnuită.
- **Snapshot cu eșantioane:** `comfort-layer.json` păstrează pe muchie valorile `rms_v` ale ferestrelor valide (rotunjite, fără timpi), nu doar mediana, ca reagregarea snapshot + ture locale să fie exactă și independentă de ordine. Fără timpi individuali, fără ID-uri de dispozitiv, fără primii/ultimii 200 m.
- **Reagregare:** la import/ștergere se recalculează tot stratul (rapid la zeci de ture), nu doar muchiile atinse; diferența înainte/după se calculează pe muchiile atinse. Versiunea stratului crește la fiecare recalculare; cache-ul de costuri al rutării e indexat după versiune.
- **Pragurile claselor:** fixe din snapshot dacă există; altfel percentilele 20/40/60/80 din toate ferestrele valide (≥ 30); altfel valori implicite [1,0; 1,6; 2,4; 3,6] m/s² [EXPERIMENTAL]. Se pot fixa manual în Setări (Developer).
- **Ambiguitate carosabil/trotuar:** conform spec, orice fereastră ambiguă face muchia cel mult LOW_CONFIDENCE (`measured_max_ambiguous = 0`, configurabil).
- **Zona cu șoc — „treceri”:** numărul de treceri al zonei = trecerile muchiei pe care stă (din agregarea RVI), minim numărul de detectări. Nu publicăm trasee, deci nu putem număra trecerile prin rază din snapshot.
- **Ghidul Primăriei:** nu contrazice specificația. Notat: „treat gaps as unknown”, „Romanian first”, WCAG 2.1 AA, „private by default”, Sesizări ca unic canal pentru probleme (nu trimitem sesizări, doar link), `/api/zones` e BROWSER OK (opțional, neimplementat încă).

## Finisare finală (14.11.2026, noaptea)
Checkpoint: tag `checkpoint-before-final-polish` (commit 492c3ec; arborele identic cu HEAD de atunci, verificat cu `git archive`). Restaurare: `git checkout checkpoint-before-final-polish`.

**Probleme raportate de pe iPhone 14 și rezolvate:**
- **Harta întunecată prea întunecată:** în modul întunecat, harta nu mai e inversată, ci estompată (`brightness .8, contrast 1.06, saturate .78`): străzile rămân deschise, etichetele lizibile, culorile A–E și ruta albastră ies în evidență. Stil „Întunecată” opțional (inversare mai deschisă) și „Luminoasă” în Hartă → Straturi. Punctul „Locația mea” mai mare, cu halou pulsatil; marcajele rapoartelor mai mari, deasupra altor straturi.
- **Panoul de rută acoperea prea mult:** `SnapSheet` cu 3 poziții (compact ~186 px pe 390×844, extins ~56%, complet), tragere cu viteză, apăsare pe mâner, săgeți din tastatură, derulare internă, `safe-area`. La fiecare schimbare, traseul A→B e reîncadrat între planificator și panou (verificat: ambele ace vizibile, 470 px de hartă liberă pe iPhone 14).
- **Prezentarea rutei:** în poziția compactă: destinația, minute, km, problemele cunoscute, disponibilitatea măsurătorilor („Fără măsurători de confort pe această rută” / „Măsurat X% · Y% confortabil”), „Recomandată” doar când datele o susțin. Extins: verdictul onest, alternativele, „Ce poți face” (Vezi ruta / Urmărește-mă / Înregistrează, fără promisiuni de navigație pas cu pas), opțiuni de rutare (trotuare, pavaj OSM).

**Audit de fluxuri (Chromium, 390×844 / 412×915 / 1440×900 / 844×390 landscape; GPS simulat prin suprascrierea `navigator.geolocation`, pentru că browserul de test nu are GPS):** Locația mea → punct + con de direcție + urmărire; căutare „Bulevardul Eroilor” (index local) și „Strada Paris 2” (Photon, rezultate reale din Cetate); selectare → rută 583 m cu „Fără măsurători…”; extins/complet/compact prin apăsare și prin tragere reală; „Urmărește-mă” (558 m · 2 min, fără indicații de viraj) și Oprește; raport nou → marcaj pe hartă → editare → ștergere; import prin `<input type=file>` real cu exportul iPhone → pagina turei „nu putem estima confortul” (staționar); reimport → mesaj informativ cu „Deschide tura”; ștergerea turei → listă goală și toast; tură live pornită → Hartă/Traseu/Mai mult/Ture → înregistrarea continuă (15 m → 55 m) → Stop/Termină → procesată, watcher-ele GPS oprite; GPS refuzat → „Nu avem locația ta” + „Alege punctul de plecare”; desktop: panoul devine flotant în stânga; landscape: butoanele panoului rămân vizibile, fără derulare orizontală.

**Bug-uri găsite în audit și reparate:**
- O tură fără date de la senzorii de mișcare (permisiune refuzată pe iPhone sau browser fără IMU) eșua la procesare („motion.csv nu conține date”). Acum se importă cu traseul GPS, durata din GPS și mesajul „tura are doar traseul GPS… nu putem măsura vibrațiile”.
- Chrome pe desktop trimite evenimente `devicemotion` goale: erau numărate ca date și apărea „senzorii s-au oprit”. Acum sunt ignorate („senzorii nu trimit date”).
- Căutarea locală nu găsea strada când textul avea număr („Strada Paris 2”).
- Două butoane de localizare suprapuse → un singur buton (urmărește / oprește urmărirea), reținut în sesiune.
- Două benzi roșii simultane în tură → doar cea mai importantă.
- „Harta s-a actualizat” apărea și când nu se schimba nimic → mesaj explicit „Harta nu s-a schimbat: …”.
- Reimportul apărea ca eroare → informare cu link spre tura existentă.
- Titluri goale pe Compară/Grafic; acțiune duplicată „Șterge toate datele” în Parametri (rămâne în Confidențialitate).
- Leaflet: straturi adăugate pe o hartă deja eliminată (vizibil la reîncărcarea modulelor în dezvoltare) → gardă `alive(map)`; ErrorBoundary prinde orice altă eroare de ecran.

**Actualizări pentru utilizatorii existenți:** service worker-ul nou se activează imediat (`skipWaiting` + `clientsClaim`), deci și instalările vechi îl primesc; reîncărcarea paginii se face automat doar când e sigur — nu în timpul unei ture, al unui raport deschis sau al unui import; altfel apare „Versiune nouă instalată · Reîncarcă”. Verificare la revenirea în aplicație și la 30 min; buton „Caută actualizări” în Mai mult (cu versiunea și ora build-ului). Worker-ul de procesare se încarcă la pornire, ca o actualizare în timpul turei să nu-l facă indisponibil.

**Teste:** 108/108 (13 fișiere). Noi: import → hartă actualizată → reimport refuzat → ștergerea scoate exact contribuția (muchiile identice cu starea dinainte) prin store; staționar → zero RVI, zero străzi colorate; GPS > 20 m → zero potriviri; tură doar GPS; logica panoului (poziție după tragere); numărul casei în căutarea locală.

**Nevalidat:** nimic din această etapă nu a fost testat pe iPhone/Samsung fizic (senzori, Wake Lock, cameră, instalare, tastatura iOS). Nicio calibrare a claselor: nu există încă o tură reală pe bicicletă.

**Următorii pași:** tura reală (lista rapidă din `docs/TEREN.md`); pe iPhone: instalare, import Sensor Logger din Fișiere, tură live de 2 minute cu ecranul aprins, o fotografie într-un raport; apoi `inspect` / `build-layer` / `validate` pe laptop și calibrarea pe segmentele de referință.

## Phase 2 — produs mobil (14.11.2026, seara)
Checkpoint înainte de redesign: tag `checkpoint-pre-redesign` (commit 64697a0), 40/40 teste.

**Implementat (P0–P2):**
- Design system nou (`src/ui/styles.css`): Inter auto-găzduit (OFL), tokeni, albastru electric / turcoaz / portocaliu / roșu, mod întunecat cu tile-uri OSM atenuate, bottom sheets, ținte ≥ 44 px; iconițe lucide (ISC). Contrastul AA e **testat** (`test/contrast.test.ts`, 28 perechi în ambele teme; a corectat turcoazul și albastrul din modul întunecat).
- Navigare în 4 zone (Hartă, Traseu, Ture, Mai mult); detaliile tehnice (RVI brut, parametri, OSM, validare, diagnostic) mutate în „Instrumente avansate”. ErrorBoundary pe ecrane.
- Traseu prin adrese: `src/services/geocode.ts` — index local de străzi din graful OSM (offline) + Photon (komoot) cu debounce 350 ms, anulare, cache, timeout 6 s, filtrare pe zona Timișoarei; recente locale; alegere pe hartă; inversare; conectare la graf prin `snapNode`; sensuri unice/trotuare ca înainte. **Justificare:** Photon e făcut pentru autocomplete (Nominatim interzice); indexul local acoperă străzile fără rețea.
- Alternative de rută: `src/core/routeplan.ts` — scurtă/echilibrată/confort, fără duplicate, ascunde rutele „de confort” majoritar necunoscute, verdict onest (`nodata` / `insufficient` / `same` / `better`), probleme cunoscute pe rută (zone cu șoc + rapoarte locale). „Pornește” = urmărirea poziției pe rută și distanța rămasă.
- Locația mea: `src/services/location.ts` — un singur `watchPosition` partajat, oprit la ultima eliberare; cerc de precizie, mod urmărire (se oprește la tragerea hărții), direcție/viteză doar când sunt credibile; mesaje pentru refuz/expirare/fără semnal/HTTP.
- Tură live: `src/capture/live.ts` rulează **aceleași** funcții din nucleu pe o fereastră glisantă de ~30 s la fiecare 5 s; `Recorder` cu dependențe injectabile, sesiune globală (`src/services/ride.ts`) care continuă la schimbarea ecranului; afișează doar viteză, distanță, durată, GPS, stare, denivelări candidate; detectarea opririi; „Marchează” pentru un raport ulterior; la oprire procesare completă ca la import.
- Verificarea după tură (`ReviewScreen`): „Am observat N posibile denivelări…”, mini-hartă, ora, strada aproximativă, intensitate; Da (+ tip) → raport local legat de șoc; Nu → detectarea respinsă; Nu știu → rămâne neverificată. Confirmările nu intră în costul rutei.
- Rapoarte manuale: IndexedDB v2 (migrare testată de la v1), marcaj rapid, tip, fotografie micșorată și re-encodată (fără EXIF/GPS), descriere, editare, ștergere, export GeoJSON, text și link pentru Sesizări. Eticheta „Salvat doar pe acest telefon” peste tot; nicio afirmație de publicare.
- Descrierea repo-ului actualizată (fără „GropiTM” și fără promisiuni de real-time); topics adăugate. Analiză backend comunitar: `docs/BACKEND-COMUNITAR.md` (neimplementat, intenționat).

**Verificat:** 102/102 teste (11 fișiere; 62 noi: geocoding cu Photon simulat — rezultate, cache, HTTP/offline/timeout/anulare; locație — refuz, expirare, oprirea watcher-ului; rute 100% necunoscute; tură start/pauză/oprire cu IMU simulat la 100 Hz; analiza live = procesarea completă; șoc candidat; confirmare/respingere; rapoarte CRUD + ștergerea tuturor datelor; local vs public; migrarea IndexedDB; compatibilitatea GitHub Pages pe `dist/`). În Chromium (dev server) la 390×844 și 412×915, temă luminoasă și întunecată: căutare reală Photon („iulius” → Iulius Town/Mall, Lipovei), stradă locală „victoriei”, rută Piața Victoriei → Iulius Town 1,72 km cu mesajul „Nu avem încă suficiente măsurători…”; raport creat/listat/editat cu text Sesizări; tură sintetică (generată în consolă, apoi ștearsă) → verificare 2 denivelări → Da/Groapă + Nu; GPS refuzat de browserul de test → mesaj corect. Audit ținte < 44 px: doar un link inline (excepție WCAG).
**Nu a fost testat pe telefoane fizice:** senzori, Wake Lock, permisiunea iOS, camera, instalarea PWA.
**Bug-uri găsite și reparate:** harta ecranului Traseu nu se inițializa când ecranul se deschidea direct în căutare; contrast insuficient la butonul turcoaz (4,0:1) și la tab-ul activ în modul întunecat (4,3:1).

## Stare (14.11.2026)

### Faza 0 — import Sensor Logger, schelet, deploy: GATA
- Ramura `prototip-vechi` publicată (vechiul `index.html`, commit 5499550); aplicația nouă pe `main`, fără force push. `sample-data/`, `rides/`, PDF-ul ghidului: în `.gitignore`, necomise.
- GitHub Pages trecut de pe „legacy (branch)” pe „GitHub Actions”. Workflow `deploy.yml`: `npm ci → npm test → npm run build → deploy`. **Verificat:** rulările 43546834469, 43547092995, 43547344661 = success; `https://eric22220.github.io/ShockGrid/` răspunde 200 (index, manifest, sw.js).
- `npm run inspect` pe exporturile reale (verificat local):
  - iPhone 14: ios, unitate g, AccelerometerUncalibrated + GyroscopeUncalibrated, 238,4 s, 23877 mostre, **100,2 Hz, 0 goluri > 100 ms**, **237 fixuri**, precizie mediană 6,8 m, 169 fixuri ≤ 20 m, 6,0 m, gravitație estimată 9,810 m/s². → criteriul fazei 0 îndeplinit.
  - Samsung SM-S948B: android, m/s², TotalAcceleration + Gyroscope, 49,5 s, 58,5 Hz, 0 goluri, 72 fixuri, precizie 4,0 m, distanță 0,0 m (toate vitezele < 0,5 m/s; spec. 2.2 estima ~16 m deplasare pe jos, sub pragul de integrare), gravitație 9,766.
- **Bug critic găsit și reparat:** exporturile Sensor Logger sunt ZIP64 (dimensiuni 0xFFFFFFFF în antete). `unzipSync` din fflate cerea un buffer de 4 GB în browser („Array buffer allocation failed”), deși în Node mergea. Cititor propriu de director central ZIP64 (`src/core/io/zip.ts`) + test. **Verificat în browser** (Chromium, dev server): import iPhone 192 ms, Samsung 53 ms, prin Web Worker; reimportul aceleiași ture e refuzat cu mesaj.
- Ecranul Import: alegere ZIP, progres, rezumat (cifrele de mai sus), traseul pe hartă, diferența înainte/după pe strat.

### Faza 2 — graful străzilor și nucleul de vibrație: GATA (de calibrat pe date reale)
- Graful: GitHub Actions, relația OSM 6927733 (Timișoara, admin_level=8). Prima rulare: **23460 noduri, 32981 muchii, 1689,8 km; `footway=sidewalk` desenat separat: 228,6 km; piste (`highway=cycleway`): 37,7 km; 90 de componente, cea principală 98,5% din noduri.** (Prima rulare n-a putut face push din cauza unui commit paralel; workflow-ul face acum `pull --rebase`.)
- Nucleul (`src/core/`): validare mostre, fs local, gravitație LP τ=1 s, a_v = d·u, HP Butterworth 4 Hz cu coeficienți recalculați la ±10% fs, ferestre 2 s/1 s cu motivele de excludere, șocuri cu prag adaptiv MAD, grupare roată față/spate, double_hit, NEEDS_REVIEW, distanță (viteză / poziții), VDV.
- **Nevalidat încă pe tură reală:** filtrul de 4 Hz pe spectrul unui segment neted, pragurile claselor, pragurile de șoc (lipsesc turele de teren).

### Fazele 3–4 — map-matching, hartă, replay, rutare, comparație: IMPLEMENTATE
- Map-matching cu index pe grilă (60 m), cost distanță + direcție + adiacență, salturi imposibile ignorate (confirmare după 3 fixuri), ambiguitate carosabil/trotuar/pistă, suprafață declarată.
- Harta: MEASURED pe clase (paletă pentru daltoniști + literă), LOW_CONFIDENCE întrerupt, UNKNOWN fără culoare; panou pe segment cu toate câmpurile 8.3; zone cu șoc comutabile, cu semnalul de ±3 s.
- Rutarea: A* + heap binar, profiluri 0/1/3, P_unknown reglabil, trotuare opționale, estimare OSM opțională, metri pe clase măsurat/estimat/necunoscut, regula de 50%.
- Comparația: RVI ponderat cu distanța, bootstrap pe blocuri de 10, VDV, timp pe clase, avertisment viteză > 20%, grafic rms_v vs distanță, porțiuni.
- Actualizare reactivă (8.6): strat = agregare(snapshot, ture locale) cu versiune; cache rutare indexat după versiune; diferența înainte/după + dacă ruta recomandată s-a schimbat și de ce.

### Faza 0b — înregistratorul propriu (P1): IMPLEMENTAT, netestat pe telefon
- devicemotion (permisiunea iOS cerută sincron în click), watchPosition, Wake Lock, loturi de 1 s în IndexedDB, recuperare după reîncărcare, banner roșu, Pauză/Stop/Reper, export ZIP (7.1) prin Web Share. Diagnostic (5.3) cu pașii pentru PERMISSION_DENIED pe iPhone.

### Teste (Vitest)
36 trecute, 2 sărite până la graful real (schema + A* vs Dijkstra pe 100 de perechi). Acoperă: CSV/BOM/null, ns epoch, unitate, Sensor Logger sintetic + ambele exporturi reale, ZIP64, format vechi, refuz .xlsx, export ShockGrid, biquad la 100/58,5/40 Hz, invarianța la rotire, RMS, excluderi (viteză, gol, giroscop, fs), VDV, distanță (staționar < 5 m; 5 m/s ±10% ambele metode), șocuri + double_hit, A* (drum minim, sens unic, trotuare), regula 50%, 8.6 (schimbarea rutei după import și revenirea după ștergere, dublura, ordinea, versiunea/cache-ul), monotonia Σ length·P, map-matching (ambiguitate, suprafață declarată, precizie > 20 m).

### Verificări cap-coadă (14.11, după graful real)
- Graful comis (commit 9802683 de la GitHub Actions): `graph-timisoara.json` 4,3 MB, servit de Pages comprimat **1,05 MB**; `data/raw/overpass-timisoara.json.gz` 1,2 MB.
- Teste: **40/40** (inclusiv schema grafului real, A* = Dijkstra pe 100 de perechi aleatoare, tură sintetică pe străzi reale: 100% ferestre potrivite, 86% pe muchiile rutei).
- Browser (dev server, viewport mobil 375–420 px, Chromium): 3 ture SINTETICE (generate în consolă, șterse apoi) pe ruta Piața Victoriei → nord, cu vibrații diferite pe porțiuni + un impuls: import 116–196 ms fiecare; după a 2-a trecere 27 muchii MEASURED noi, după a 3-a 42 MEASURED; zona cu șoc REPEATED 3/3; „ruta recomandată s-a schimbat” / „a rămas aceeași: segmentele atinse sunt pe rută…”; panoul segmentului cu toate câmpurile 8.3; rutarea curier ocolește segmentul E pe străzi nemăsurate → regula de 50% afișează „Prea puține date…” (corect); Compară pe trecerile identice → „Diferență neconcludentă”.
- Exporturile reale `sample-data`: fixurile sunt la ~43 m de cea mai apropiată muchie (înregistrate în interior) → 0 potriviri, corect (raza 15–20 m).
- Producție (`https://eric22220.github.io/ShockGrid/`, Chromium): pagina se încarcă, graful devine „ready”, fără erori JS (doar 404 pentru fișierele de date încă nepublicate, acum înlocuite cu un snapshot gol valid).
- Performanță: tură sintetică de 30 min la 100 Hz (ZIP 2,6 MB) — parsare 0,3 s + procesare 0,3 s pe laptop, heap +12 MB (după trecerea la parsarea în flux a fișierelor mari).
- Licențe producție (citite din node_modules): fflate MIT, idb ISC, leaflet BSD-2-Clause, react/react-dom/scheduler/loose-envify/js-tokens MIT, uplot MIT. (`npx license-checker` n-a putut fi rulat în mediul local.)
- `build-layer` și `validate` rulate pe exporturile de test: funcționează, 0 muchii (staționar); ieșirile au fost șterse, nu se publică.

### Ce lipsește / următorii pași
- Turele de teren (Faza 1) și calibrarea pe ele: `npm run inspect`, `build-layer`, `validate` pe `rides/`. Snapshotul publicat e gol până atunci (harta arată doar turele importate pe telefon).
- Test pe telefoanele reale (iPhone Safari, Samsung Chrome): import, instalare PWA, înregistrator.
- Testul cu utilizatori: neefectuat.
