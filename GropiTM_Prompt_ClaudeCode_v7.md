# PROMPT PENTRU CLAUDE CODE — GropiTM v7: harta confortului velo, șocuri punctuale și ruta cea mai netedă
UniHack 2026 · Green Mobility · Timișoara · stop coding: duminică 15.11, dimineața

Acest prompt e autosuficient și înlocuiește toate versiunile anterioare. Nu ai acces la conversațiile din care a rezultat. Valorile marcate **[EXPERIMENTAL]** sunt puncte de plecare care se ajustează pe date reale, nu constante dovedite.

**Document oficial:** în workspace se află „Timișoara City Data and Services Guide", primit la UniHack. Citește-l integral înainte de implementare. Pentru serviciile Primăriei, datele publice, integrare și adoptabilitate are prioritate față de acest prompt. Dacă găsești o contradicție, o notezi în `PROGRESS.md` și urmezi documentul oficial.

**Poziționare:** GropiTM este un **strat de informații despre confortul deplasării pe bicicletă**, construit din vibrații măsurate, cu comparare și optimizare de trasee. Nu este o aplicație generală de navigație, nu este o alternativă la Timișoara City App, nu este o platformă de sesizări și nu garantează trasee sigure. **Confortul și siguranța sunt concepte diferite:** „cu vibrații mai puține" nu se scrie niciodată ca „mai sigur".

**Indicele se numește RVI (Relative Vibration Index).** Este relativ: valabil pentru combinația telefon + bicicletă + suport + viteză în care a fost măsurat.

---


**Situația inițială a repository-ului:** repository-ul GitHub `Eric22220/ShockGrid` conține doar un vechi `index.html`, folosit pentru testarea accelerometrului și giroscopului. Folderul local `C:\Users\Eric\Desktop\ShockGrid` conține specificația v7, ghidul Primăriei și arhivele din `sample-data/`; este posibil să nu fie încă un repository Git inițializat.

Verifică mai întâi dacă folderul local are `.git` și dacă este conectat la repository-ul corect. Nu presupune că este deja clonat.

Salvează versiunea existentă de pe GitHub pe ramura `prototip-vechi`, verifică faptul că ramura a fost publicată, apoi implementează noua aplicație pe `main`, fără force push și fără să pierzi fișierele locale de specificație sau test. Nu include datele brute din `sample-data/` în commituri.

Nu crea un repository suplimentar: folosește exclusiv `Eric22220/ShockGrid`.
## 0.0. Pornirea: un singur prompt, de la zero la aplicația pe telefon
Utilizatorul lucrează pe **Windows**, cu tine în Claude Code, și nu are experiență cu deploy-ul. Construiești tot proiectul din acest prompt. La început:
1. Verifici ce e instalat: `node -v` (necesar ≥ 20), `npm -v`, `git --version`, `gh --version`. Pentru ce lipsește, îi dai comanda exactă de instalare cu `winget` (ex. `winget install OpenJS.NodeJS.LTS`, `winget install Git.Git`, `winget install GitHub.cli`) și aștepți confirmarea.
2. `gh auth status`; dacă nu e autentificat, îi ceri să ruleze `gh auth login` (GitHub.com, HTTPS, autentificare prin browser).
3. Creezi proiectul, faci primul commit, apoi `gh repo create gropitm --public --source . --push`. Repo-ul trebuie să fie public: GitHub Pages pe cont gratuit cere asta. Înainte de push verifici că `rides/` e în `.gitignore`.
4. Activezi GitHub Pages cu sursa „GitHub Actions": `gh api -X POST repos/{owner}/gropitm/pages -f build_type=workflow` (dacă eșuează, îi spui exact unde să dea click: Settings → Pages → Source: GitHub Actions).
5. După fiecare push important verifici deploy-ul cu `gh run watch` și îi afișezi URL-ul: `https://<utilizator>.github.io/gropitm/`.
6. La final scrii în `README.md` și afișezi în terminal secțiunea „Pe telefon, pas cu pas" (3.4).

Nu ceri parole și nu pui niciun token în cod.

## 0. Cum lucrezi

- Construiești efectiv aplicația. După ce ai citit promptul și repo-ul, nu te opri la plan: implementezi faza, rulezi testele, repari, verifici build-ul, treci mai departe.
- Întrebi doar când răspunsul schimbă produsul sau te blochează. Nu ceri aprobare pentru fiecare fișier.
- Dacă o cerință de aici e greșită tehnic, spui de ce, propui varianta corectă și o aplici dacă e sigur.
- Nu declari nimic „testat" sau „funcțional" fără să fi rulat verificarea. Nu inventezi cifre. Datele sintetice apar doar în teste unitare și sunt etichetate.
- La finalul fiecărei faze scrii în `PROGRESS.md`: ce merge, ce a fost verificat și cum, ce nu merge.
- **Ordinea fazelor e obligatorie.** Echipa iese pe bicicletă sâmbătă dimineață și înregistrează cu Sensor Logger. Până atunci trebuie să meargă importul exportului Sensor Logger. Tot restul se dezvoltă pe datele acelei ture.

---

## 1. Produsul

**GropiTM măsoară cât de denivelate sunt străzile și pistele din Timișoara, folosind telefonul fixat pe ghidonul bicicletei, și recomandă ruta cea mai netedă dintre două puncte.**

Utilizatori:
- bicicliștii care fac naveta zilnic;
- curierii pe bicicletă, pentru care vibrațiile înseamnă oboseală și colete deteriorate;
- Primăria, care primește o hartă măsurată a segmentelor cele mai degradate.

De ce nu „detectăm gropi": un biciclist ocolește o groapă, iar ca s-o înregistrezi trebuie s-o lovești. Rugozitatea suprafeței (pavaj, asfalt crăpat, rosturi, șine de tramvai, borduri coborâte) nu se poate ocoli și se măsoară continuu, pe tot traseul, ca medie pe câteva secunde. Semnalul e mai stabil decât un vârf izolat.

Ce construim, în ordinea priorității (dacă timpul e scurt: importul real, RVI, șocuri candidate de bază, harta reactivă cu persistență și comparația de trasee vin înaintea rutării automate; confirmarea complexă a șocurilor poate rămâne la markerii `CANDIDATE`):
1. **Import** al turelor înregistrate cu Sensor Logger; apoi (P1) **înregistrare** proprie pe telefon, fără laptop și fără internet.
2. **Indice de vibrație** pe ferestre scurte, din accelerația verticală.
3. **Harta confortului**: segmentele de stradă colorate după vibrația măsurată.
4. **Rutare A→B**: cea mai scurtă rută comparată cu cea mai netedă, cu metri măsurați, estimați și necunoscuți.
5. **Comparația a două trasee parcurse efectiv** între aceleași puncte.
5b. **Șocuri punctuale**: locurile unde a apărut un șoc vertical puternic (rost, capac, bordură, groapă), ca puncte pe hartă cu rază de incertitudine, confirmate prin treceri repetate. Sunt „șoc posibil", nu „groapă": nu identificăm tipul obstacolului.
6. P2: textul unei sesizări pentru segmentele cele mai degradate.

Ce NU promitem, nicăieri în UI sau în pitch:
- că rutele sunt „mai sigure" (nu avem date de accidente);
- reducerea accidentelor, a emisiilor sau a timpilor;
- că valorile sunt comparabile între telefoane, biciclete sau suporturi diferite fără calibrare;
- că o stradă nemăsurată e netedă.

Inspirație, menționată onest: SmartRoadSense (Universitatea din Urbino) estimează rugozitatea drumurilor cu telefoane în mașini. Contribuția noastră: adaptarea la bicicletă, rutarea pe baza vibrației măsurate, separarea clară între măsurat, estimat din OpenStreetMap și necunoscut, și date reale din Timișoara.

---

## 2. Ce știm deja din datele reale ale echipei (13.11.2026)

Fișiere în `sample-data/legacy/`: test de birou pe Samsung S26 Ultra (Chrome) și iPhone 14 (Safari), telefon mișcat și lovit ușor. **Teste de senzori, nu măsurători de drum.**

| Constatare | Consecință |
|---|---|
| Ambele telefoane: ~58,8 Hz; Nyquist ≈ 29 Hz | Filtrele se calculează din frecvența măsurată. |
| Chrome pe Samsung rotunjește accelerația la 0,1 m/s² și rotația la 0,1 °/s; iPhone nu | Orice prag adaptiv are un minim; pe asfalt neted variația poate fi aproape 0. |
| Goluri în flux: Samsung 4,2 s și 1,0 s; iPhone 8 goluri >500 ms în 91 s | Detecția golurilor e obligatorie; ferestrele cu goluri se exclud. |
| Prototipul vechi a salvat doar `acceleration`, nu `accelerationIncludingGravity` | Noul înregistrator salvează obligatoriu `accelerationIncludingGravity`. |
| GPS Samsung: fix la ~0,5 s, precizie 3,9–6,1 m, câmpul `speed` prezent | Viteza vine din `speed`, nu din diferența de poziții. |
| GPS pe loc: suma pașilor = 27 m în 74 s fără mișcare; `speed` < 0,15 m/s | Distanța se calculează integrând `speed` (secțiunea 6.6). |
| iPhone: 0 fixuri GPS, nicio eroare salvată | Cauza nu se poate afla din date. Ecranul Diagnostic salvează codul de eroare. |
| Fișierul iPhone a fost salvat prin Excel ca .xlsx, cu tot CSV-ul într-o coloană; CSV-ul Samsung începe cu BOM | Importul acceptă doar CSV/ZIP brut și elimină BOM. |

### 2.1. Export real Sensor Logger, iPhone 14 (13.11.2026, 23:23, 238 s, telefon practic nemișcat în interior)
Fișier în `sample-data/sensorlogger/iphone14-2026-11-13_23-23-49.zip`. **Test staționar, nu tură.** Constatări măsurate:

| Constatare | Consecință |
|---|---|
| `AccelerometerUncalibrated.csv`: 100 Hz (pas median 9,98 ms), **niciun gol** în 238 s, coloane `time,seconds_elapsed,z,y,x`, unități **g**, gravitația inclusă (modulul median ≈ 1,00 g, adică 9,81 m/s²), fără rotunjire; vârf 48 m/s² la manevrarea telefonului | De 1,7× mai rapid și fără goluri față de browser. Se înmulțește cu 9,80665. Algoritmul estimează singur gravitația (6.2), deci varianta necalibrată e suficientă. |
| `GyroscopeUncalibrated.csv`: 100 Hz, rad/s, aceleași coloane | Se convertește în °/s. Necalibrat înseamnă un mic offset; irelevant pentru pragul de 300 °/s. |
| `Accelerometer.csv`, `Gravity.csv`, `Gyroscope.csv`, `Annotation.csv`: **fișiere goale (0 octeți)**, deși `Metadata.csv` le listează ca active | Importul nu se bazează pe ele; folosește variantele `Uncalibrated` și tratează fișierele goale fără eroare. Cauza golirii nu e cunoscută. |
| `Location.csv`: ~1 Hz, coloane `time,seconds_elapsed,altitude,speedAccuracy,bearingAccuracy,latitude,altitudeAboveMeanSeaLevel,bearing,horizontalAccuracy,verticalAccuracy,longitude,speed`; `speed`, `bearing`, `speedAccuracy` = **−1 când sunt invalide**; precizie 4,5–61 m (în interior) | `−1` devine `null`. **GPS-ul iPhone-ului funcționează în Sensor Logger**, deci problema anterioară ținea de pagina web și permisiuni, nu de hardware. |
| `time` în nanosecunde epoch; `seconds_elapsed` relativ la start; `Metadata.csv` conține `recording epoch time` (ms), platformă, versiunea aplicației, `sampleRateMs` | Sincronizarea senzor–GPS se face pe `time`. Metadatele merg în `meta`. |

### 2.2. Export real Sensor Logger, Samsung S26 Ultra / Android (14.11.2026, 00:10, 49 s, test scurt, nu tură)
Fișier în `sample-data/sensorlogger/samsung-2026-11-14_00-10-08.zip`. Constatări măsurate:

| Constatare | Consecință |
|---|---|
| Unități **m/s²** (nu g, ca pe iOS): `TotalAcceleration` are modulul median 9,85 | Detecția unității după modulul la repaus e obligatorie (7.3). |
| `TotalAcceleration.csv` și `AccelerometerUncalibrated.csv` sunt **identice**: accelerația brută cu gravitație, ~58,5 Hz (pas 17,1 ms), fără goluri, fără rotunjire | Aceasta e sursa de accelerație pe Android. |
| `Accelerometer.csv` (fără gravitație) și `Gravity.csv`: pas fix de exact 10,0 ms (100 Hz), deși senzorul brut dă ~58,5 Hz | Sunt senzori virtuali, calculați de sistem; conținutul peste ~29 Hz nu e măsurat. **Nu se folosesc pentru RVI**; `Gravity` doar pentru verificare. Prima mostră din `Accelerometer` e (0,0,0). |
| `Gyroscope.csv` și `GyroscopeUncalibrated.csv`: ~58,5 Hz, rad/s | Se folosește `Gyroscope.csv`. |
| `Location.csv`: ~1,3 Hz, precizie mediană 4,0 m, are `speedAccuracy`; **ordinea coloanelor diferă de iOS** (`time,seconds_elapsed,mslAltitudeAccuracy,bearingAccuracy,speedAccuracy,verticalAccuracy,horizontalAccuracy,speed,altitudeAboveMeanSeaLevel,bearing,altitude,longitude,latitude`); câmpuri goale posibile | Coloanele se citesc după nume, niciodată după poziție. Câmp gol → `null`. |
| `Metadata.csv`: `platform=android`, `device name=SM-S948B`, aceleași coloane ca pe iOS | Platforma decide doar unitățile și fișierul de accelerație. |
| Mișcare scurtă (frecvență dominantă ~2,2 Hz, tipică pentru mers pe jos sau ținut în mână), deplasare ~16 m | Util pentru testul de import, nu pentru măsurători de drum. |

**Decizie de procesare, pentru ambele platforme:** RVI și șocurile se calculează din **accelerația brută cu gravitație** (iOS: `AccelerometerUncalibrated` × 9,80665; Android: `TotalAcceleration`), cu gravitația estimată de algoritmul nostru (6.2). Așa, cele două telefoane trec prin exact același lanț de procesare. Frecvența efectivă (`fs`) se măsoară pe fiecare fișier: iPhone ~100 Hz, Samsung ~58,5 Hz; filtrele se calculează din ea.

---

## 3. Arhitectura

### 3.1. Fără backend
Totul rulează în browser și ca site static:
- înregistrarea, procesarea, harta și rutarea rulează pe telefon sau în browserul laptopului;
- graful străzilor din Timișoara e un fișier JSON generat o dată, din OpenStreetMap, de un script;
- stratul de confort publicat (snapshot) e un fișier JSON generat din turele echipei de un script și livrat odată cu aplicația;
- **turele importate local actualizează imediat harta și rutarea, în aceeași sesiune, fără rebuild, redeploy sau server** (8.6). Snapshotul servește pentru demo și publicarea rezultatelor agregate.

Terminologie obligatorie, în cod, UI și pitch:
- `live recording`: captare directă din browser cu înregistratorul propriu (P1), cu ecranul aprins;
- `post-import processing`: import Sensor Logger, procesare și actualizare imediată după import.
Procesarea după import nu se prezintă niciodată ca telemetrie live. (Sensor Logger are și streaming HTTP, dar el cere un server care primește datele; nu intră în MVP.)

Motive: nimic de administrat noaptea, nimic de plătit, ușor de preluat de Primărie, iar demo-ul nu depinde de rețea.

### 3.2. Un singur nucleu de procesare
Algoritmii există o singură dată, în TypeScript pur, în `src/core/` (fără React, fără DOM). Același cod rulează:
- live pe telefon, într-un Web Worker;
- la import și replay în browser;
- în scripturile Node din `scripts/` (rulate cu `tsx`).

Nu scrii a doua implementare în Python.

### 3.3. Stack și licențe
| Parte | Alegere |
|---|---|
| Aplicație | React + TypeScript + Vite, PWA cu `vite-plugin-pwa` (MIT) |
| Hartă | **Leaflet (BSD-2) direct**, printr-un hook propriu. **Nu `react-leaflet`**: are licența Hippocratic-2.1, nu MIT. |
| Grafice | `uPlot` (MIT) |
| Stocare | IndexedDB prin `idb` (ISC) |
| Arhive | `fflate` (MIT) pentru ZIP |
| Teste | Vitest |
| Scripturi | Node + `tsx` |
| Licență cod | MIT, după verificare cu `npx license-checker --summary` |
| Licență date | `graph-timisoara.json` e derivat din OpenStreetMap, iar stratul de confort e legat de muchiile lui, deci **ambele se publică sub ODbL 1.0**, cu atribuirea „© OpenStreetMap contributors". Nu se relicențiază MIT. README explică separarea: codul MIT, datele ODbL. |
| Texte UI | Toate textele într-un fișier `src/i18n/ro.ts` (română), cu structura pregătită pentru `en.ts`. |

Fără alte dependențe mari fără un motiv scris în `PROGRESS.md`.

### 3.4. Cum ajunge aplicația pe telefon (pune asta și în README, pas cu pas)
Senzorii și GPS-ul merg doar pe HTTPS. Deci:

**Varianta principală: GitHub Pages.**
1. Repo public pe GitHub, workflow GitHub Actions care face `npm ci && npm run build` și publică `dist/` pe Pages la fiecare push pe `main`.
2. `base` în `vite.config.ts` și `scope`/`start_url` în manifest corecte pentru subcalea `/<nume-repo>/`.
3. Pe Samsung: deschizi URL-ul în Chrome → meniu → „Adaugă pe ecranul de pornire" / „Instalează aplicația".
4. Pe iPhone: Safari → Partajare → „Adaugă pe ecranul principal".

**Varianta de dezvoltare rapidă: tunel HTTPS spre laptop.**
1. `npm run dev -- --host`
2. `cloudflared tunnel --url http://localhost:5173` (fără cont) dă un URL `https://….trycloudflare.com`.
3. În `vite.config.ts`: `server.allowedHosts: ['.trycloudflare.com']`, altfel Vite refuză hostul.
4. Deschizi URL-ul pe telefon. Datele din IndexedDB sunt legate de origine: cele înregistrate pe URL-ul tunelului nu apar pe GitHub Pages. **Turele reale se înregistrează doar pe versiunea de pe GitHub Pages.**

**Depanare pe Samsung:** USB, opțiuni dezvoltator → depanare USB, apoi `chrome://inspect` pe laptop pentru consola telefonului.

**Datele de pe telefon pe laptop:** butonul „Exportă tura" creează un ZIP și îl trimite prin Web Share API (Drive, WhatsApp, e-mail către tine) sau îl descarcă dacă partajarea nu e disponibilă.

**Importul unei ture direct pe telefon, fără laptop** (fluxul principal, scris în README cu exact acești pași):
1. În Sensor Logger: înregistrarea → Export → ZIP (CSV) → salvează în Descărcări (Android) sau în Fișiere (iPhone).
2. În GropiTM: „Importă tura" → se deschide selectorul de fișiere → alegi ZIP-ul.
3. Aplicația afișează progresul procesării, apoi rezumatul și harta actualizată.
Selectorul folosește `<input type="file" accept=".zip,application/zip">`. ZIP-ul se citește cu `fflate` în Web Worker. Se testează pe Samsung cu ZIP-ul real din `sample-data/` copiat pe telefon.

Harta are nevoie de internet pentru tile-urile OSM; procesarea și rutarea merg și fără.

### 3.5. Colectarea datelor: Sensor Logger întâi, înregistratorul propriu după
Un site web nu poate citi senzorii cu ecranul stins, iar browserul dă date mai slabe (2 și 2.1). De aceea:
1. **Principal pentru pilot:** turele de teren se înregistrează cu aplicația gratuită **Sensor Logger** (Android și iOS), care merge și în fundal. GropiTM importă ZIP-ul ei. Fluxul demo: **Sensor Logger → import ZIP → procesare RVI → segmente OSM colorate → comparația a două rute reale → recomandare condiționată de acoperirea datelor.** În pitch se spune deschis că pilotul a folosit Sensor Logger pentru colectare.
2. **Înregistratorul propriu (PWA)** rămâne în produs, dar e **P1**: telefonul pe ghidon cu ecranul aprins, Screen Wake Lock (Chrome Android; Safari iOS 16.4+, iar în aplicațiile instalate pe ecranul principal de la iOS 18.4), banner roșu la orice întrerupere. Dacă nu primește Wake Lock: „Ține ecranul aprins: setează închiderea ecranului la 10 minute".
3. Ambele surse ajung în același model intern și trec prin același nucleu de procesare.

---

## 4. Faze și definiția lui „gata"

### Faza 0 — Import Sensor Logger, scheletul și deploy-ul (primele ore)
1. Schelet Vite + React + TS + PWA, workflow GitHub Pages, deploy funcțional.
2. Importul Sensor Logger (7.3) pe exportul real din `sample-data/sensorlogger/`, cu teste.
3. Script `npm run inspect -- <ride.zip>` (acceptă și exportul GropiTM, și cel Sensor Logger): durată, mostre, frecvență mediană, goluri >100 ms, fixuri GPS, precizie mediană, fixuri cu precizie ≤ 20 m, distanță.
4. Ecran „Importă tura" în aplicație: alegi ZIP-ul, vezi rezumatul de la punctul 3 și traseul pe hartă.

**Gata când:** `inspect` pe exportul iPhone real raportează 100 Hz, 0 goluri, 237 fixuri, iar ecranul de import îl afișează de pe URL-ul GitHub Pages, pe telefon. `PROGRESS.md` conține rezultatul.

### Faza 0b — Înregistratorul propriu (P1, după Faza 4 dacă timpul e scurt)
Diagnostic (5.3), captare (5.1, 5.2, 5.4), IndexedDB în loturi de ~1 s cu recuperare după reîncărcare, ecranul „În tură", export ZIP (7.1). Gata când o plimbare de 10 minute afară pe Samsung produce un ZIP cu ≥ 50 Hz și GPS ≥ 0,5 Hz.

### Faza 1 — Turele de teren (sâmbătă dimineață, pe lumină)
Protocolul din secțiunea 9. Între timp, tu lucrezi la Faza 2 pe exportul Sensor Logger existent, pe datele legacy și pe teste sintetice.

### Faza 2 — Graful străzilor și nucleul de vibrație (sâmbătă)
Secțiunile 6 și 8.1.

### Faza 3 — Map-matching, harta confortului, replay (sâmbătă după-amiază)
Secțiunile 8.2, 8.3 și 10.

### Faza 4 — Rutarea și comparația traseelor (sâmbătă seara)
Secțiunile 8.4 și 8.5.

### Faza 5 — Validare, README, demo (sâmbătă noapte – duminică dimineață)
Secțiunea 11 și `npm run validate`, README, `LIMITARI.md`, scenariul demo, video de rezervă.

P2, doar dacă rămâne timp: textul unei sesizări pentru segmentele din clasa cea mai slabă, buton care deschide `https://sesizari.primariatm.ro/`; filtrul „expunere la trafic auto" (8.4); normalizarea după viteză (6.5).

Nu implementăm: backend, conturi, detecția căzăturilor, apeluri de urgență, limitarea vitezei, navigație pas cu pas, mod auto, ML antrenat, chatbot, gamification, trimitere automată de sesizări.

---

## 5. Captarea

### 5.1. Mișcare
- iOS: `DeviceMotionEvent.requestPermission()` se apelează primul, direct în handlerul click-ului, înainte de orice `await`. Pe Android funcția nu există.
- Pentru fiecare `devicemotion`:
  - `t` = `performance.timeOrigin + e.timeStamp` (ms epoch). Dacă `e.timeStamp` lipsește sau e 0: `performance.timeOrigin + performance.now()` și `meta.motion_clock = "receive"`.
  - `agx, agy, agz` = `accelerationIncludingGravity` (**obligatoriu**);
  - `ax, ay, az` = `acceleration` (poate fi `null`);
  - `ra, rb, rg` = `rotationRate` în °/s (poate fi `null`);
  - `interval` raportat de browser.
- `null` rămâne `null`, nu devine 0. Loturile se scriu ca typed arrays.

### 5.2. GPS
- `watchPosition` cu `{ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }`.
- Pentru fiecare fix: `fix_t` = `position.timestamp`, `recv_t`, `lat`, `lon`, `acc`, `alt`, `alt_acc`, `speed`, `heading`. `speed`/`heading` lipsă sau `NaN` → `null`. **Viteza lipsă e necunoscută, nu zero.**
- Fiecare eroare se salvează cu `code` și `message`.

### 5.3. Ecranul Diagnostic
Afișează și permite copierea: `isSecureContext`, originea, dacă pagina e într-un iframe, user agent; existența `DeviceMotionEvent`, `requestPermission`, `accelerationIncludingGravity`, `rotationRate`; frecvența măsurată pe 5 s; dacă toate valorile sunt multipli de 0,1 (mesaj: „Browserul rotunjește la 0,1 m/s²"); starea permisiunii de geolocație; rezultatul unui `getCurrentPosition` cu codul tradus: 1 `PERMISSION_DENIED`, 2 `POSITION_UNAVAILABLE`, 3 `TIMEOUT`, plus `INSECURE_CONTEXT` și `UNSUPPORTED`.

Pentru `PERMISSION_DENIED` pe iPhone, afișează, în ordine:
1. Setări › Confidențialitate și securitate › Servicii de localizare: activate.
2. Același meniu › Site-uri Safari: „În timpul utilizării" sau „Întreabă".
3. Safari › „aA" › Setări site web › Localizare: „Întreabă" sau „Permite".
4. Deschide aplicația direct, nu încorporată în altă pagină.

### 5.4. Evenimente
`ride_start, pause, resume, ride_stop, visibility_hidden, visibility_visible, wakelock_acquired, wakelock_released, wakelock_error, motion_gap, gps_error, gps_stale` (niciun fix > 5 s), `mount_shift`.

---

## 6. Indicele de vibrație

Toți parametrii stau într-un obiect `VibrationConfig`, salvat în fiecare rezultat cu `processing_version`.

### 6.1. Validare
- Mostră invalidă: `NaN`, `Infinity` sau `|a| > 160 m/s²` pe o axă.
- `fs` = 1000 / mediana intervalelor pe ultimele 2 s. Interval > 100 ms = gol.
- Ferestre cu gol, cu pagina ascunsă sau cu `fs < 40 Hz` **[EXPERIMENTAL]** sunt excluse, cu motivul salvat.

### 6.2. Componenta verticală, independentă de cum e prins telefonul
1. `g_hat` = filtru trece-jos de ordin 1 pe `accelerationIncludingGravity`, τ = 1,0 s **[EXPERIMENTAL]**, `α = dt / (τ + dt)` cu `dt` real.
2. `u = g_hat / |g_hat|`; `d = a_G − g_hat`; **`a_v = d · u`**.
3. Semnul convenției browserului nu contează: `g_hat` vine din același semnal, iar indicele folosește pătrate.
4. Dacă `accelerationIncludingGravity` lipsește (fișiere vechi): `|acceleration|`, cu `orientation_aware = false`.

### 6.3. Filtrare
Trece-sus Butterworth de ordin 2 (biquad) pe `a_v`, `f_hp = 4 Hz` **[EXPERIMENTAL]**, coeficienți recalculați când `fs` variază cu peste 10%. Motiv: pedalarea la 60–100 rpm înseamnă 1–1,7 Hz, iar balansul corpului ajunge la ~3,3 Hz. Valoarea se verifică pe spectrul unui segment neted din tura reală; rezultatul se scrie în `PROGRESS.md`.

### 6.4. Ferestre
- Fereastră de 2 s cu pas de 1 s **[EXPERIMENTAL]**.
- Pentru fiecare: `t_start, t_end`, poziția (interpolată după timp între fixuri, nu ultimul fix), raza de incertitudine `r = max(acc1, acc2) + v·0,3 s`, viteza medie, `rms_v` (RMS al lui `a_v` filtrat, în m/s²), `vdv_part = Σ a_v⁴·dt`, `p95_abs`, `gyro_max`, `valid` și `reason`.
- Excluse din indice, dar păstrate: viteză necunoscută, viteză < 2,5 m/s sau > 9 m/s **[EXPERIMENTAL]** (pornire, oprire, mers pe jos), `gyro_max > 300 °/s` **[EXPERIMENTAL]** (mâna, nu drumul), schimbarea orientării telefonului > 15° într-o secundă **[EXPERIMENTAL]** (`mount_shift`).

### 6.5. Viteza
Vibrația crește cu viteza; SmartRoadSense a găsit o lege de putere între indice și viteză. Pentru MVP: indicele se compară doar între ferestre din banda 2,5–9 m/s, iar viteza medie apare lângă fiecare valoare. P2: estimezi exponentul din datele proprii (regresie log-log pe aceleași segmente la viteze diferite) și oferi un indice normalizat, marcat ca experimental.

### 6.6. Distanța
Principal: `Σ v·dt` din câmpul `speed`, doar cu ambele viteze prezente, `v ≥ 0,5 m/s`, `dt ≤ 3 s`. Rezervă (fără `speed`): poziții mediate pe ferestre de 5 s, pași < 2 m ignorați. Teste: fișierul GPS Samsung staționar real → < 5 m; sintetic la 5 m/s cu zgomot GPS corelat de ~4 m → ±10%.

### 6.7. Doza de vibrații a unui traseu
Pentru o porțiune parcursă: `VDV = (Σ a_v⁴·dt)^(1/4)` în m/s^1,75, după definiția din ISO 2631-1. **Nu aplicăm ponderarea în frecvență din standard**, deci în UI scrie „doză de vibrații (inspirată din ISO 2631, neponderată)", nu „conform ISO".

### 6.8. Clasele de confort
Cinci clase A (neted) … E (foarte denivelat), cu praguri pe `rms_v`:
- inițial, pragurile = percentilele 20/40/60/80 ale tuturor ferestrelor valide din turele echipei **[EXPERIMENTAL]**;
- după tura de teren, se verifică pe segmentele de referință (9.2): segmentul neted trebuie să iasă A–B, pavajul D–E; dacă nu, pragurile se ajustează și se documentează;
- pragurile sunt valabile pentru combinația telefon + bicicletă + suport din tura de calibrare; în UI scrie asta.

Accesibilitate: clasa apare și ca literă și text, nu doar culoare; paleta e lizibilă pentru daltoniști.

### 6.9. Starea fiecărui segment
- `MEASURED`: ≥ 3 ferestre valide **și** ≥ 2 treceri distincte, precizie GPS mediană ≤ 10 m, viteză mediană în banda 2,5–9 m/s **[EXPERIMENTAL]**.
- `LOW_CONFIDENCE`: are ferestre valide, dar nu îndeplinește toate condițiile de mai sus. Se afișează cu clasa, dar hașurat și cu motivul („o singură trecere", „GPS slab").
- `UNKNOWN`: nicio fereastră validă. **Nu primește RVI, clasă sau culoare de confort.**

### 6.10. Șocuri punctuale
Strat secundar față de RVI, cu același semnal `bp` (6.3).
- **Prag adaptiv local:** `med` și `σ = max(1,4826·MAD, σ_min)` pe `|bp|` din ultimele 20 s de mers valid, cu `σ_min = 0,15 m/s²` **[EXPERIMENTAL]**; baseline-ul se îngheață în timpul unui șoc.
- **Declanșare:** `z = (|bp| − med)/σ > 6` **și** `|bp| > 4 m/s²` **[EXPERIMENTAL, ambele]**; se încheie când `z < 3` timp de 150 ms.
- **Grupare:** vârfurile mai apropiate de `max(0,4 s, 1,3 m / v)` formează un singur șoc. Motiv: roata din față și cea din spate lovesc același obstacol la distanța ampatamentului, ~1,05 m, adică ~0,19 s la 20 km/h. Dacă al doilea vârf apare la `1,05 m / v ± 30%`, se salvează `double_hit = true`; e o ipoteză de verificat pe date, nu o dovadă.
- **Cooldown** 0,5 s.
- **Marcare, fără ștergere:** viteză necunoscută sau în afara benzii 2,5–9 m/s, `gyro_max > 300 °/s`, schimbarea orientării telefonului > 15°, gol de senzor în ±1 s → `NEEDS_REVIEW` cu motivul.
- **Localizare:** interpolare între fixurile din jur, rază `r = max(acc1, acc2) + v · 0,3 s`; fără fix la ≤ 3 s → `UNLOCATED`.
- **Valori salvate:** `peak` (m/s²), `z_peak`, `double_hit`, viteza, raza, motivul, muchia potrivită.
- **Agregare:** șocuri din treceri distincte la distanță ≤ `max(8 m, √(r1² + r2²))` formează un punct. Pentru fiecare punct: `treceri` (de câte ori a trecut traseul prin rază) și `detectări`.
  - `REPEATED`: ≥ 2 treceri distincte cu detectare și `detectări / treceri ≥ 0,5`;
  - `CANDIDATE`: o singură detectare;
  - `REJECTED`: marcat manual.
- Cu GPS de ~5 m nu putem separa două obstacole la câțiva metri unul de altul din treceri diferite. UI-ul numește punctul „zonă cu șoc", cu raza vizibilă.

---

## 7. Formate de date

### 7.1. Export GropiTM (ZIP)
- `meta.json`: `format_version: 1`, `app_version`, user agent, `motion_clock`, rezoluția observată, `label` (ex. „tură de teren", „test birou"), dispozitiv, bicicletă și suport (completate de utilizator), start, stop.
- `motion.csv`: `t, interval, agx, agy, agz, ax, ay, az, ra, rb, rg`
- `gps.csv`: `fix_t, recv_t, lat, lon, acc, alt, alt_acc, speed, heading`
- `events.csv`: `t, type, detail`

### 7.2. Format vechi BikeGuard
CSV mișcare: `type, utc, elapsed_ms, x, y, z, method, magnitude, shock_signal, rot_alpha, rot_beta, rot_gamma, latitude, longitude, accuracy_m, gps_age_ms`. CSV GPS: `type, utc, latitude, longitude, accuracy_m, speed_mps, heading_deg`. Elimină BOM, marchează `orientation_aware = false` și eticheta **„Test de senzori — nu reprezintă măsurători de drum."** `.xlsx` se refuză cu mesaj clar.

### 7.3. Sensor Logger
Structura iOS e descrisă în 2.1, pe un export real. Importul:
- găsește fișierele după nume în ZIP, indiferent de subfolder; un fișier gol e tratat ca senzor absent;
- accelerație brută cu gravitație: `TotalAcceleration.csv` (Android), altfel `AccelerometerUncalibrated.csv` (iOS și Android); unitatea se detectează din mediana modulului: ~1 → g (×9,80665), ~9,81 → m/s², altceva → eroare explicită. `Accelerometer.csv` și `Gravity.csv` nu se folosesc pentru RVI (2.2);
- giroscop: `Gyroscope.csv` dacă are date, altfel `GyroscopeUncalibrated.csv`; rad/s → °/s;
- coloanele se citesc după nume; ordinea diferă între platforme (2.1, 2.2);
- locație: `Location.csv`; valorile `−1` la `speed`, `bearing`, `speedAccuracy`, `bearingAccuracy` devin `null`;
- timpul: `time` (ns epoch) → ms;
- `Metadata.csv` → `meta`, plus `source: "sensorlogger"`;
- `Annotation.csv`, dacă are rânduri: adnotările cu timpul lor devin evenimente `annotation` (folosite la validarea șocurilor și la suprafața declarată, 8.2); formatul exact se inspectează pe un export cu adnotări;
- documentează structura în `docs/sensorlogger-format.md`; testul de import rulează pe exportul real.

Testele de import rulează pe ambele exporturi reale (iPhone și Samsung) și verifică: platforma, unitatea detectată, `fs`, numărul de fixuri, că gravitația estimată are ~9,81 m/s². Ce lipsește se marchează, nu se inventează.

### 7.4. Graful (`public/data/graph-timisoara.json`)
Noduri `[id, lat, lon]`, muchii `[id, from, to, length_m, geometry, highway, surface, smoothness, bike_infra, oneway_bike, osm_way_id]`, plus `meta` cu data descărcării și atribuirea „© OpenStreetMap contributors, ODbL".

### 7.4b. Zonele cu șoc (`public/data/shock-zones.json` și `.geojson`)
Pe punct: `lat, lon, radius_m, status, passes, detections, peak_median, double_hit_ratio, speed_median, last_seen, edge_id, surface_kind, processing_version`. Fără timpi individuali ai turelor. Licență ODbL (legat de muchii OSM).

### 7.5. Stratul de confort (`public/data/comfort-layer.json`)
Pe muchie: `edge_id, rms_median, class, n_windows, n_passes, n_rides, speed_median, gps_acc_median, status, surface_kind, ambiguous_ratio, last_seen`, plus `meta`: `processing_version`, pragurile claselor, descrierea telefonului, bicicletei și suportului, lista turelor sursă.

---

## 8. Graful, map-matching, harta, rutarea

### 8.1. Construirea grafului (`npm run build-graph`)
- O singură interogare Overpass pentru municipiul Timișoara (relația administrativă, nu un dreptunghi), cu un `User-Agent` care numește proiectul. Rezultatul brut se salvează în `data/raw/` și se comite, ca să nu fie descărcat din nou.
- **Graful de măsurare** (pentru map-matching și hartă) conține tot pe ce poate merge efectiv o bicicletă: `highway` în `cycleway, residential, living_street, unclassified, tertiary, secondary, primary, service, track, path, pedestrian, footway, steps` (ultimele doar ca să nu atribuim greșit măsurătorile), inclusiv trotuarele desenate separat (`footway=sidewalk`). Excluse: `motorway, trunk`, `access=private`.
- Fiecare muchie primește `surface_kind`: `carosabil` (străzi), `pista` (`highway=cycleway` sau `footway`/`path` cu `bicycle=designated`), `trotuar` (`footway=sidewalk` sau `footway` fără drept explicit pentru biciclete), `alee` (`path`, `pedestrian`, `track`).
- **Graful de rutare** e un subset: implicit exclude `steps` și trotuarele/aleile fără `bicycle=yes|designated`; există o opțiune vizibilă „permite trotuarele fără marcaj pentru biciclete", oprită implicit. Aplicația nu interpretează legislația; spune doar ce conține OSM.
- Raportezi în `PROGRESS.md` câți km de `footway=sidewalk` desenați separat există în Timișoara. Unde OSM nu desenează trotuarul separat (are doar eticheta `sidewalk=*` pe stradă), trotuarul și carosabilul sunt o singură linie și **nu pot fi separate** din GPS.
- `bike_infra`: `separated` (`highway=cycleway` sau `cycleway*=track`), `lane` (`cycleway*=lane`), `shared` (restul). OpenStreetMap nu are verificată completitudinea pistelor din Timișoara: o lipsă înseamnă „necunoscut", nu „fără pistă".
- Sensul unic se respectă, cu excepția `oneway:bicycle=no` și `cycleway=opposite*`.
- Noduri doar la intersecții și capete; muchiile păstrează geometria completă.
- Test: graful e conex în componenta principală; raportezi numărul de noduri, muchii și km în `PROGRESS.md`.

### 8.2. Map-matching (`src/core/mapmatch.ts`)
Simplu și verificabil:
1. Pentru fiecare fix GPS valid (`acc ≤ 20 m`): muchiile candidate la ≤ `max(15 m, acc)`, folosind un index spațial (grilă sau `rbush`, MIT).
2. Cost = distanța perpendiculară + penalizare dacă direcția de mers diferă cu peste 45° de direcția muchiei (în oricare sens) + penalizare dacă muchia nu e aceeași sau adiacentă cu cea anterioară.
3. Se alege costul minim; sărituri imposibile (muchii neadiacente la < 3 s) se marchează și se ignoră.
4. Fiecare fereastră de vibrație primește muchia pe care stă cea mai mare parte a ei.
5. **Ambiguitatea carosabil / trotuar / pistă:** dacă în raza de incertitudine există muchii aproape paralele (diferență de direcție < 20°) cu `surface_kind` diferit, iar distanțele lor față de fix diferă cu mai puțin de `max(3 m, acc / 2)`, potrivirea e ambiguă. Atunci:
   - dacă tura are o **suprafață declarată** (câmp la import: `carosabil` / `trotuar` / `pista` / `mixt`, sau adnotare Sensor Logger pe porțiune), se alege muchia de acel tip;
   - altfel fereastra primește muchia cea mai apropiată, dar segmentul rezultat e cel mult `LOW_CONFIDENCE`, cu motivul „ambiguitate carosabil/trotuar".
   Un trotuar pavat și asfaltul de lângă el vibrează foarte diferit; o atribuire greșită strică harta, deci ambiguitatea se arată, nu se ascunde.

Test pe tura reală: un desen de control cu traseul GPS și muchiile alese; procentul ferestrelor potrivite se scrie în `PROGRESS.md`.

### 8.3. Agregare pe muchii și harta (`npm run build-layer -- rides/*.zip`)
- RVI-ul muchiei = mediana `rms_v` a ferestrelor valide potrivite; starea după 6.9.
- Trecerile distincte: intrări separate pe muchie la > 30 s distanță.
- Harta: OpenStreetMap cu atribuirea „© OpenStreetMap contributors", centrată pe Timișoara (45,7537; 21,2257). `MEASURED` colorate pe clase; `LOW_CONFIDENCE` hașurate; `UNKNOWN` fără culoare de confort. Click pe muchie: starea, RVI și clasa, sursa măsurătorii (GropiTM sau Sensor Logger), data și ora ultimei măsurători, ferestre, treceri, ture, viteza mediană, precizia GPS mediană, versiunea algoritmului. Eticheta `surface` din OSM poate apărea separat, ca „suprafață declarată în OSM", fără să devină RVI.
- Strat separat, comutabil: **zone cu șoc** (6.10), puncte cu cercul de incertitudine; `REPEATED` cu marker plin, `CANDIDATE` cu marker gol, `NEEDS_REVIEW` ascunse implicit. Click: vârful în m/s², treceri / detectări, viteza, `double_hit`, data, plus un grafic de ±3 s din semnalul real al celei mai puternice detectări.
- Pe hartă se vede și `surface_kind` (carosabil / trotuar / pistă / alee) al fiecărui segment măsurat.
- Opțional, dacă nu întârzie MVP-ul: cartierul măsurătorii din `GET https://cont.primariatm.ro/api/zones` (GeoJSON, permis din browser), descărcat o dată și păstrat în cache, cu sursa afișată. Nu se fac interogări repetate.
- Tile-uri: fără descărcare în masă pentru offline. README notează că, în producție, Primăria ar folosi propriul server de tile-uri.

### 8.4. Rutarea (`src/core/route.ts`)
A* cu euristica distanței Haversine (admisibilă, pentru că toate costurile ≥ lungimea) și heap binar.

Cost pe muchie: `cost = length × (1 + w_c · P_confort)`.

**Șocurile punctuale (6.10) nu intră în cost.** Efectul lor e deja inclus parțial în RVI-ul segmentului, iar o penalizare separată ar număra de două ori același fenomen. RVI e indicatorul principal pentru segmente și rutare; șocurile sunt un strat informativ. O eventuală penalizare separată (P2) cere o regulă explicită documentată, doar pentru zone `REPEATED`, și un test care arată că nu dublează penalizarea RVI.

`P_confort` **[EXPERIMENTAL, toate valorile]**:
- `MEASURED`: A = 0, B = 0,15, C = 0,4, D = 0,9, E = 1,6;
- `LOW_CONFIDENCE`: jumătate din valoarea clasei;
- `UNKNOWN`: `P_unknown = 0,3`, neutru, configurabil, afișat în UI. Nu se inventează RVI.
- Opțiune separată, **oprită implicit**: „folosește tipul suprafeței declarat în OSM" (`sett`, `cobblestone`, `unhewn_cobblestone` → 1,2; `paving_stones` → 0,5; `smoothness` `bad`/`very_bad` → 1,0). Când e pornită, metrii respectivi apar ca „estimat din OSM", niciodată ca măsurați.

Profiluri:
- „Cea mai scurtă": `w_c = 0`;
- „Echilibrat": `w_c = 1`;
- „Confort maxim (curier)": `w_c = 3`.

P2: termenul `w_t · P_trafic` din tipul străzii (`primary` fără pistă separată = penalizare mare, `residential` mică). În UI se numește „evită străzile principale fără pistă", **nu** „rută sigură".

Pentru fiecare rută afișată:
- lungimea (m) și timpul estimat la 15 km/h;
- metrii pe clase A–E, separat pentru **măsurat**, **estimat din OSM** și **necunoscut**;
- diferența față de ruta cea mai scurtă: „+X m (+Y%), −Z m în clasele D–E măsurate".

**Regula de onestitate:** dacă peste 50% din lungimea rutei e `UNKNOWN`, aplicația afișează „Prea puține date pentru o recomandare de confort pe această rută" și nu o numește „mai netedă". Procentul măsurat apare lângă fiecare rută.

Dacă rutarea automată nu e stabilă până la demo, fallback-ul obligatoriu e comparația a două ture măsurate (8.5), prezentată ca atare, nu ca rutare automată.

Teste: graf mic cu rezultat cunoscut; `w_c = 0` dă exact drumul minim; creșterea lui `w_c` nu crește niciodată suma `Σ length × P_confort` a rutei alese (proprietate a drumului minim parametric; metrii dintr-o anumită clasă, de exemplu E, pot totuși varia în ambele sensuri); sensurile unice sunt respectate; A* și Dijkstra dau același cost pe 100 de perechi aleatoare din graful real.

### 8.5. Comparația a două trasee parcurse efectiv
Ecran „Compară": alegi două ture (sau porțiuni din ture) între aceleași puncte. Pentru fiecare: distanța (6.6), durata, viteza medie, RVI agregat (mediana pe distanță), doza de vibrații (6.7), procentul de traseu cu ferestre valide, numărul trecerilor, timpul pe clase, graficul `rms_v` în funcție de distanță (uPlot), traseul pe hartă.

Incertitudine: intervalul RVI agregat prin bootstrap pe blocuri de 10 ferestre consecutive (ferestrele vecine se suprapun și sunt corelate, deci bootstrap-ul pe ferestre individuale ar da un interval prea îngust), 1000 de reeșantionări, interval 2,5–97,5%, afișat ca „RVI 0,82 (0,74–0,91)". Dacă intervalele celor două trasee se suprapun, concluzia afișată e „diferență neconcludentă". Dacă vitezele mediane diferă cu peste 20% **[EXPERIMENTAL]**, apare avertismentul „comparație afectată de diferența de viteză" și nu se afișează un câștigător.

Acesta e nucleul demo-ului: totul vine din măsurători, nimic din estimări.

---

### 8.6. Actualizare reactivă după import (cerință critică pentru demo)
Fluxul care trebuie să meargă cap-coadă în aceeași sesiune:
1. Import tura 1 → RVI pe ferestre, șocuri, map-matching.
2. Harta se actualizează imediat.
3. Import turele 2, 3, 4 → reagregare pe muchiile OSM existente.
4. Se actualizează starea (`MEASURED` / `LOW_CONFIDENCE` / `UNKNOWN`) și încrederea fiecărei muchii și zone cu șoc.
5. Se invalidează orice cache de costuri sau trasee care depinde de stratul de confort.
6. Comparația A→B deschisă se recalculează automat.
7. Se afișează diferența înainte/după import: km acoperiți, muchii noi măsurate, muchii care și-au schimbat starea sau clasa, treceri adăugate, schimbarea RVI pe muchiile atinse, și dacă ruta recomandată s-a schimbat. Dacă nu s-a schimbat, UI-ul spune „ruta recomandată a rămas aceeași" și de ce (ex. „segmentele noi nu sunt pe rutele dintre A și B").

Arhitectura:
- Rezultatul procesării fiecărei ture (ferestre potrivite pe muchii, cu trecerea, plus șocurile) se salvează în IndexedDB ca înregistrare separată, cu `ride_id` și `processing_version`.
- `ride_id` = hash din sursa datelor (pentru Sensor Logger: `device id` + `recording epoch time` din `Metadata.csv`; pentru GropiTM: id-ul turei). Importul unei ture deja existente (local sau în snapshot) e refuzat cu mesaj, ca trecerile să nu se numere de două ori. Snapshotul conține lista `ride_id` incluse.
- Stratul de confort e o stare derivată, cu un număr de versiune: `comfortLayer = aggregate(snapshot, turele locale)`. La orice import sau ștergere se recalculează doar muchiile atinse, iar versiunea crește.
- Rutarea primește versiunea stratului; cache-urile de cost sunt indexate după ea, deci o versiune nouă le invalidează automat.
- Procesarea rulează în Web Worker, cu progres afișat; UI-ul nu se blochează.
- Ștergerea unei ture scoate exact contribuția ei.
- Agregarea e independentă de ordinea importurilor.

Teste automate obligatorii:
- pe un graf sintetic controlat: două rute între A și B; după importul unei ture sintetice care face ruta scurtă `MEASURED` în clasa E, ruta recomandată la `w_c = 3` se schimbă; după ștergerea turei, revine;
- importul aceleiași ture de două ori nu schimbă stratul;
- importul în ordinea 1-2-3 și 3-1-2 dă același strat;
- versiunea stratului crește la import și la ștergere, iar un traseu calculat cu versiunea veche e recalculat.

Pe date reale: `PROGRESS.md` conține diferența înainte/după pentru importul fiecărei ture de teren.

## 9. Turele de teren (protocol pentru echipă; pune-l în `docs/TEREN.md`)

### 9.1. Siguranță
Pe lumină, suport ferm pe ghidon, viteză normală, fără atingerea telefonului în mers, fără manevre forțate peste obstacole.

### 9.2. Segmente de referință (pentru calibrarea claselor)
- un segment de pistă cu asfalt bun, ~200 m;
- un segment cu pavaj sau piatră cubică, ~100–200 m;
- fiecare parcurs de 2 ori; început și sfârșit marcate în aplicație cu butonul „Marchează reper" (salvează un eveniment cu poziția), apăsat doar din oprire.

### 9.2b. Suprafețe diferite
- Când mergi pe trotuar, fă o înregistrare separată pentru porțiunea respectivă sau adaugă o adnotare în Sensor Logger **din oprire** (ex. „trotuar de aici", „carosabil de aici"). La import se setează suprafața declarată.
- Pe străzi cu pistă pe trotuar, mergi pe pistă; pe străzi fără pistă, alege carosabilul sau trotuarul după cum e sigur și legal, nu după ce vrei să măsori.

### 9.2c. Șocuri de referință
- Pe traseu, alege 5–10 obstacole vizibile și sigure de trecut cu bicicleta la viteză normală: rosturi de pod, capace de canal ușor denivelate, treceri peste șine de tramvai în unghi corect, borduri coborâte. Nimic periculos.
- Notează-le înainte, pe jos sau din oprire: o adnotare în Sensor Logger („capac canal") sau o listă cu adresa aproximativă. Sunt adevărul de teren pentru validarea șocurilor.
- Treci peste fiecare de 2–3 ori, în același sens.

### 9.2d. Verificarea Sensor Logger înainte de tură
Pe ambele telefoane: o înregistrare de 2 minute **cu ecranul blocat și telefonul în mișcare** (pe jos, afară). Verificat cu `npm run inspect`: frecvența, golurile, fixurile GPS. Până la acest test, înregistrarea cu ecranul blocat nu e considerată verificată.

### 9.3. Comparația A→B (nucleul demo-ului)
- Alegeți două puncte A și B la ~1,5–2,5 km, cu 2–3 trasee posibile, legale și sigure pentru biciclete, diferite ca suprafață.
- Traseele se aleg **înainte** de măsurare. Se prezintă ce iese, inclusiv „alternativa mai lungă nu e semnificativ mai netedă", dacă asta arată datele. Nu se selectează traseele după rezultat.
- Fiecare traseu: A→B și B→A, ideal de 2 ori.
- Același telefon, aceeași bicicletă, același suport, aceeași presiune în roți, viteză obișnuită.
- După fiecare traseu, fiecare biciclist notează confortul perceput de la 1 la 5, pe hârtie sau în aplicație, separat de măsurători.

### 9.4. Înregistrarea
- **Sensor Logger** pe telefonul fixat pe ghidon: senzori activi Accelerometer, Gravity, Gyroscope, versiunile Uncalibrated și Location, frecvența la 100 Hz. Înainte de plecare, un test de 30 s cu export, verificat cu `npm run inspect`.
- Ambele telefoane au obținut GPS în Sensor Logger (iPhone 13.11, Samsung 14.11, precizie mediană ~4 m pe Samsung).
- Dacă înregistratorul propriu e gata, rulează în paralel pe celălalt telefon.
- O înregistrare separată pentru fiecare traseu, cu nume clar: `ref-neted-1`, `AB-traseu1-dus`, `AB-traseu1-intors` etc.
- La întoarcere: exporturile copiate pe laptop în `rides/`.

### 9.5. Testul cu utilizatori
Dacă e timp, 3–5 persoane încearcă pe telefon: importă o tură, înțeleg harta, aleg A și B, interpretează comparația. Rezultatele (ce au înțeles, ce nu, citate scurte cu acordul lor) merg în `docs/TESTARE-UTILIZATORI.md`. Dacă testul nu s-a făcut, fișierul spune asta. Nu se inventează participanți sau feedback.

---

## 10. Interfața

Română întâi, engleză opțională; WCAG 2.1 AA: contrast ≥ 4,5:1, butoane ≥ 44 px, etichete pentru cititoare de ecran, clasa nu doar prin culoare.

1. **Acasă:** „Importă tura (Sensor Logger)", „Pornește tura" (P1), ultima tură, acces la Hartă, Rută, Compară, Ture, Despre date, Diagnostic.
2. **Înainte de tură:** permisiuni, verificarea frecvenței și a GPS-ului, câmpuri pentru telefon / bicicletă / suport, mesajul despre fixarea telefonului.
3. **În tură:** cifre mari, banner roșu la probleme, Pauză / Stop, „Marchează reper".
4. **Hartă confort** (8.3).
5. **Rută** (8.4): A și B prin atingere pe hartă, profilul, rutele desenate, tabelul comparativ, avertismentul de date insuficiente.
6. **Compară** (8.5).
7. **Ture:** listă, export, ștergere, reprocesare cu altă configurație.
8. **Replay:** graficul `a_v` filtrat și `rms_v` pe ferestre, cursor sincronizat cu harta.
9. **Despre date:** surse (măsurători proprii, OpenStreetMap cu data, Sensor Logger dacă e cazul), versiunea procesării, limitările.
10. **Setări:** ștergerea tuturor datelor locale, `VibrationConfig` în modul Developer.

Lângă fiecare cifră: sursa și data. Valorile necunoscute apar ca „necunoscut", nu ca 0.

### Confidențialitate (și pagina „Ce date stocăm")
- Turele personale sunt private și rămân pe dispozitiv (IndexedDB). Nimic nu se încarcă automat.
- Exporturile Sensor Logger conțin coordonate GPS și deplasarea utilizatorului; folderul `rides/` e în `.gitignore` și **nu se publică** în repo.
- Stratul publicat conține doar valori agregate pe muchii, fără timpi individuali, fără ID-uri de dispozitiv, fără începutul și sfârșitul turelor (primii și ultimii 200 m ai fiecărei ture se exclud).
- Includerea unei ture în stratul agregat e o alegere explicită, pe tură.
- Buton „Șterge toate datele locale" și ștergere pe tură.
- Fără analytics, trackere sau fonturi și scripturi de pe servicii terțe; singurele cereri externe sunt tile-urile OSM și, opțional, `/api/zones`.
- Pagina „Ce date stocăm" spune: ce stocăm, unde (telefon; repo doar agregat), pentru ce (harta de confort), cât timp (până la ștergerea de către utilizator).

### Exporturi pentru preluare
- `comfort-layer.geojson`: muchiile `MEASURED` și `LOW_CONFIDENCE`, cu `rvi`, `class`, `status`, `passes`, `last_seen`, `speed_median`, `gps_acc_median`, `processing_version`, atribuirea OSM și licența ODbL în proprietățile colecției.
- Același conținut și ca JSON simplu.
- Butoane de descărcare pe pagina „Despre date".

### Snapshot pentru demo
`npm run build-layer` produce stratul din turele reale și îl comite în `public/data/`. Harta, rutarea și comparația merg din acest snapshot, fără server și fără internet după prima încărcare (cu excepția tile-urilor deja în cache). Turele folosite pentru comparație se includ în snapshot doar ca segmentele dintre A și B, nu ca ture complete.

---

## 11. Validare (`npm run validate`) — rezultatele merg în demo

Toate rezultatele se raportează cu numerele absolute și numitorii vizibili. Fără procente când n < 10.

1. **Repetabilitate (indicatorul tehnic principal):** pentru muchiile parcurse în ≥ 2 treceri **la viteze mediane care diferă cu cel mult 20%**, corelația Spearman între RVI din trecerea 1 și din trecerea 2, plus diferența relativă mediană. Câte muchii, câte treceri, câte excluse din cauza vitezei.
2. **Separarea referințelor:** `rms_v` pe segmentul neted față de pavaj: medianele, intervalele intercuartile, câte ferestre.
3. **Acord cu percepția:** Spearman între doza de vibrații a traseelor și nota 1–5 dată de bicicliști. Cu sub 6 trasee, doar tabelul, fără coeficient.
4. **Comparația A→B:** tabelul din 8.5 pentru traseele parcurse.
5. **Map-matching:** procentul ferestrelor potrivite și procentul celor ambigue carosabil/trotuar.
6. **Șocuri:** pentru obstacolele de referință (9.2c), câte au fost detectate la ≤ `max(15 m, r)` și în câte din treceri (ex. „6 din 8 obstacole, 14 din 21 de treceri"); câte șocuri `REPEATED` nu corespund niciunui obstacol notat (nu sunt automat false: pot fi obstacole nenotate, dar se raportează separat); eroarea de localizare mediană.

Rezultatele se salvează în `eval/results-<data>.json` și apar în aplicație pe ecranul „Despre date".

---

## 12. Teste automate (Vitest)

Parsare CSV (BOM, coloane lipsă, `null`), format vechi, import Sensor Logger pe fișierul real, proiecția verticală invariantă la rotirea telefonului (același semnal rotit cu 90° dă același `a_v`), biquad la frecvențe diferite, excluderea ferestrelor (goluri, viteză, rotație), distanța (fișierul Samsung real < 5 m; sintetic ±10%), VDV pe semnal cunoscut, map-matching pe un traseu sintetic peste un graf mic, agregarea pe muchii, clasele, A* (8.4), regula de onestitate de 50%, schema JSON a grafului și a stratului.

---

## 13. Structura

```text
gropitm/
  src/
    core/        # TS pur: vibration.ts filters.ts gravity.ts distance.ts mapmatch.ts
                 # aggregate.ts classes.ts route.ts vdv.ts io/
    capture/     # sensors.ts gps.ts wakelock.ts recorder.ts
    storage/     # idb.ts
    worker/      # processing.worker.ts
    ui/          # pages/ components/ map/ charts/
  scripts/       # inspect.ts build-graph.ts build-layer.ts validate.ts
  public/data/   # graph-timisoara.json comfort-layer.json
  data/raw/      # răspunsul Overpass comis
  sample-data/   # legacy/ sensorlogger/
  rides/         # exporturi reale (nu se publică dacă echipa nu vrea)
  docs/          # TEREN.md sensorlogger-format.md
  eval/
  test/
  README.md  LIMITARI.md  PROGRESS.md  LICENSE
  .github/workflows/deploy.yml
```

---

## 14. Livrabile

Aplicația pe GitHub Pages; README cu pași Windows PowerShell (instalare Node, `npm ci`, `npm run dev`, tunelul, deploy, cum pui aplicația pe telefon, cum aduci exporturile pe laptop, cum rulezi scripturile); `LIMITARI.md`; `docs/TEREN.md`; testele și rezultatul lor; `eval/` cu rezultatele reale; `docs/TESTARE-UTILIZATORI.md`; `comfort-layer.geojson`; licența MIT pentru cod și ODbL pentru datele derivate din OSM, după verificarea dependențelor; niciun secret în repo (nu e nevoie de niciunul).

---

## 15. Demo de 2 minute (pune-l în `docs/DEMO.md`)

Fluxul arătat: **Sensor Logger → import ZIP → procesare RVI → segmente OSM colorate → comparația a două rute reale → recomandare condiționată de acoperirea datelor.** Fără date fictive.

Momentul decisiv: harta are deja câțiva km măsurați; alegi A și B și arăți ruta recomandată și procentul de date cunoscute; imporți o tură reală nouă; harta se actualizează pe loc, apar muchii noi și treceri noi; comparația se recalculează și explici dacă recomandarea s-a schimbat sau de ce nu. Dacă nu s-a schimbat, nu se inventează o schimbare.

1. **Problema (15 s):** „O pistă pe hartă nu-ți spune cât de rău te zdruncină. Asta contează pentru cine face naveta zilnic și pentru curierii care duc mâncare."
2. **Măsurătoarea (25 s):** importul unui ZIP Sensor Logger real; turele din Timișoara pe hartă; segmentul neted față de pavaj, cu semnalul real și RVI-ul lui.
3. **Comparația (30 s):** aceleași două puncte, două trasee parcurse cu aceeași bicicletă și același telefon: „cu X m mai lung, cu Y% mai puțină doză de vibrații, iar bicicliștii au dat note care confirmă diferența".
4. **Rutarea (25 s):** punctele A și B pe hartă; ruta cea mai scurtă față de cea mai netedă; metrii măsurați, estimați și necunoscuți; avertismentul de date insuficiente pe o rută nemăsurată.
5. **Încrederea (15 s):** repetabilitatea între treceri și obstacolele de referință detectate, cu numitori; o zonă cu șoc pe hartă, cu semnalul ei real.
6. **Adoptarea (10 s):** cod MIT, date ODbL, fără server, fără conturi; export GeoJSON care poate deveni un strat pentru departamentul municipal responsabil de infrastructura velo (beneficiar posibil, nu partener confirmat) și o listă de segmente pentru Sesizări. Cifra de urmărit: reproductibilitatea RVI între treceri, apoi kilometri de rețea velo măsurați.

Nu se prezintă un procent obținut din câteva ture ca beneficiu general.

Rezervă: replay complet fără internet, plus video înregistrat al demo-ului.
