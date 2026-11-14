# ShockGrid — confortul pe bicicletă în Timișoara

**Aplicația (HTTPS, fără laptop):** https://eric22220.github.io/ShockGrid/

ShockGrid măsoară cât de denivelate sunt străzile și pistele din Timișoara cu telefonul fixat pe ghidon, colorează segmentele de stradă după vibrația măsurată și compară / recomandă rute mai netede. Este un **strat de informații despre confortul deplasării pe bicicletă** — nu o aplicație de navigație, nu o alternativă la Timișoara City App și nu o platformă de sesizări. **Confortul nu e siguranță:** „cu vibrații mai puține” nu înseamnă „mai sigur”.

Indicele se numește **RVI (Relative Vibration Index)**: RMS-ul accelerației verticale filtrate trece-sus (> 4 Hz) pe ferestre de 2 s. E relativ: valabil pentru combinația telefon + bicicletă + suport + viteză în care a fost măsurat.

Fluxul demo: **Sensor Logger → import ZIP → procesare RVI → segmente OSM colorate → comparația a două rute reale → recomandare condiționată de acoperirea datelor.** Procesarea se face după import (*post-import processing*), nu e telemetrie live.

## Pe telefon, pas cu pas

### Instalarea aplicației
**iPhone (Safari):**
1. Deschide în **Safari** adresa https://eric22220.github.io/ShockGrid/
2. Apasă butonul **Partajare** (pătratul cu săgeată) → **Adaugă pe ecranul principal** → **Adaugă**.
3. Pornește ShockGrid de pe ecranul principal (se deschide pe tot ecranul și merge și fără internet pentru import, procesare și rutare; tile-urile hărții au nevoie de internet).

**Samsung / Android (Chrome):**
1. Deschide în **Chrome** adresa https://eric22220.github.io/ShockGrid/
2. Meniul **⋮** → **Instalează aplicația** (sau **Adaugă pe ecranul de pornire**) → **Instalează**.
3. Pornește ShockGrid din lista de aplicații.

### Importul unei ture direct pe telefon (fluxul principal)
1. În **Sensor Logger**: deschide înregistrarea → **Export** → format **ZIP (CSV)** → salvează în **Fișiere** (iPhone) sau **Descărcări** (Android).
2. În ShockGrid: **Importă tura (Sensor Logger)** → se deschide selectorul de fișiere → alege ZIP-ul.
3. Aplicația afișează progresul procesării, apoi rezumatul, traseul pe hartă și **ce s-a schimbat pe hartă** (km acoperiți, muchii noi, treceri, dacă s-a schimbat ruta recomandată).
4. **Hartă** arată segmentele colorate pe clase A–E; **Rută** recomandă între A și B; **Compară** pune două ture una lângă alta.

Turele rămân **doar pe telefon** (IndexedDB). Datele de pe iPhone nu apar pe Samsung și invers; datele salvate pe alt URL (de ex. un tunel de test) nu apar pe GitHub Pages.

### Setări recomandate în Sensor Logger
Senzori activi: **Accelerometer, Gravity, Gyroscope, versiunile Uncalibrated și Location**; frecvența de eșantionare **100 Hz**. Înainte de plecare: o înregistrare de test de 30 s, exportată și importată în ShockGrid (Diagnostic + rezumatul importului). Protocolul complet: [docs/TEREN.md](docs/TEREN.md).

### Dacă GPS-ul nu merge pe iPhone (înregistratorul propriu)
ShockGrid → **Mai mult → Diagnostic → Testează senzorii și GPS-ul**. Pentru `PERMISSION_DENIED`, ecranul arată pașii din Setări › Confidențialitate › Servicii de localizare.

### Exportul unei ture spre laptop
**Ture → Exportă tura**: ZIP-ul original se trimite prin meniul de partajare al telefonului (Drive, WhatsApp, e-mail) sau se descarcă.

## Pe laptop (Windows PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS   # dacă lipsește Node ≥ 20
git clone https://github.com/Eric22220/ShockGrid.git
cd ShockGrid
npm ci
npm run dev            # http://localhost:5173
npm test               # testele Vitest
npm run build          # build de producție în dist/
```

Scripturi (rulează nucleul TypeScript din `src/core/`, același cod ca în aplicație):

| Comandă | Ce face |
|---|---|
| `npm run inspect -- rides\tura.zip` | durată, mostre, frecvență mediană, goluri > 100 ms, fixuri GPS, precizie mediană, fixuri ≤ 20 m, distanță |
| `npm run build-graph` | graful străzilor din OpenStreetMap (o interogare Overpass; folosește `data/raw/` comis; `-- --refresh` descarcă din nou) |
| `npm run build-layer -- rides/*.zip --note "telefon · bicicletă · suport"` | stratul publicat (snapshot) în `public/data/`: `comfort-layer.json/.geojson`, `shock-zones.json/.geojson` |
| `npm run validate -- rides/*.zip` | validarea (repetabilitate, referințe, percepție, A→B, map-matching, șocuri) → `eval/results-<data>.json` |

Turele reale se copiază în `rides/` (în `.gitignore`: **nu se publică**). Graful se poate reconstrui și din GitHub: **Actions → Build street graph (OSM) → Run workflow**.

### Tunel HTTPS spre laptop (dezvoltare rapidă)
Senzorii și GPS-ul merg doar pe HTTPS.
```powershell
npm run dev -- --host
cloudflared tunnel --url http://localhost:5173
```
Deschide URL-ul `https://….trycloudflare.com` pe telefon (`server.allowedHosts` include deja `.trycloudflare.com`). **Turele reale se importă doar pe versiunea de pe GitHub Pages**, altfel rămân legate de originea tunelului.

**Depanare pe Samsung:** USB, opțiuni dezvoltator → depanare USB, apoi `chrome://inspect` pe laptop.

### Deploy
Fiecare push pe `main` rulează `.github/workflows/deploy.yml` (`npm ci`, `npm test`, `npm run build`, publicare `dist/` pe GitHub Pages). Verificare: `gh run watch`. Nu e nevoie de niciun secret.

## Arhitectura
- Fără backend: totul rulează în browser, ca site static (React + TypeScript + Vite, PWA).
- `src/core/` — nucleul în TypeScript pur (fără React/DOM): import, gravitație, filtre, ferestre RVI, șocuri, distanță, map-matching, agregare, rutare A*, comparație. Rulează în Web Worker, în UI și în scripturile Node.
- Harta: Leaflet direct (BSD-2), printr-un hook propriu (fără `react-leaflet`, licență Hippocratic). Grafice: uPlot. Stocare: IndexedDB (`idb`). ZIP: `fflate` (+ cititor propriu ZIP64).
- Turele importate actualizează imediat harta și rutarea în aceeași sesiune, fără rebuild/redeploy: `stratul = agregare(snapshot, turele locale)`, cu versiune; cache-urile de rutare sunt indexate după versiune.

## Licențe
- **Cod:** MIT ([LICENSE](LICENSE)).
- **Date derivate din OpenStreetMap** (`public/data/graph-timisoara.json`, `comfort-layer.*`, `shock-zones.*`, `data/raw/`): **ODbL 1.0**, „© OpenStreetMap contributors”. Nu se relicențiază MIT.

## Confidențialitate
Turele personale rămân pe dispozitiv. Nimic nu se încarcă automat. Stratul publicat conține doar valori agregate pe muchii, fără timpi individuali, fără ID-uri de dispozitiv și fără primii/ultimii 200 m ai fiecărei ture. Fără analytics, trackere, fonturi sau scripturi terțe; singurele cereri externe sunt tile-urile OpenStreetMap. Detalii în aplicație: **Despre date → Ce date stocăm**.

## Integrare cu serviciile orașului
- Problemele concrete în spațiul public merg pe canalul oficial **Sesizări** (https://sesizari.primariatm.ro/); ShockGrid nu colectează și nu trimite sesizări.
- Exporturile GeoJSON (Despre date) pot deveni un strat pentru departamentul municipal responsabil de infrastructura velo (beneficiar posibil, nu partener confirmat).
- În producție, Primăria ar folosi propriul server de tile-uri.

Mai multe: [LIMITARI.md](LIMITARI.md) · [docs/TEREN.md](docs/TEREN.md) · [docs/DEMO.md](docs/DEMO.md) · [docs/sensorlogger-format.md](docs/sensorlogger-format.md) · [PROGRESS.md](PROGRESS.md)

Inspirație, menționată onest: SmartRoadSense (Universitatea din Urbino) estimează rugozitatea drumurilor cu telefoane în mașini. Contribuția noastră: adaptarea la bicicletă, rutarea pe baza vibrației măsurate, separarea clară între măsurat, estimat din OpenStreetMap și necunoscut, și date reale din Timișoara.
