# Limitări (ce NU știm și ce NU promitem)

## Despre măsurătoare
- **RVI e relativ.** E valabil pentru combinația telefon + bicicletă + suport + presiune în roți + viteză din calibrare. Valorile nu sunt comparabile între telefoane, biciclete sau suporturi diferite fără calibrare.
- **Viteza contează.** Vibrația crește cu viteza; indicele se compară doar între ferestre din banda 2,5–9 m/s, iar viteza mediană apare lângă fiecare valoare. Normalizarea după viteză (lege de putere) nu e implementată.
- **Doza de vibrații** e inspirată din ISO 2631-1, dar **neponderată** în frecvență: nu e „conform ISO”.
- **Parametrii marcați [EXPERIMENTAL]** (filtru trece-sus 4 Hz, τ = 1 s, ferestre 2 s, praguri de viteză, giroscop 300 °/s, mount_shift 15°, praguri de șoc, P_confort) sunt puncte de plecare care trebuie verificate pe turele reale; nu sunt constante dovedite.
- **Clasele A–E** sunt percentilele 20/40/60/80 ale ferestrelor valide ale echipei (sau valori implicite până există ≥ 30 de ferestre). Se verifică pe segmentele de referință (neted vs pavaj).
- **Exporturile de test din `sample-data/`** sunt staționare (iPhone, 238 s) și un test scurt pe jos (Samsung, 49 s): **nu sunt măsurători de drum** și nu produc segmente măsurate.

## Despre hartă și GPS
- **Un segment nemăsurat nu e neted.** Starea `UNKNOWN` nu primește RVI, clasă sau culoare.
- Cu GPS de ~4–6 m, **trotuarul și carosabilul paralel nu se pot separa** sigur: potrivirea ambiguă face segmentul cel mult `LOW_CONFIDENCE`, cu motivul afișat. Suprafața declarată la import rezolvă ambiguitatea.
- Unde OSM nu desenează trotuarul separat (doar eticheta `sidewalk=*` pe stradă), trotuarul și carosabilul sunt o singură linie și nu pot fi separate.
- Completitudinea pistelor din OpenStreetMap în Timișoara nu e verificată: o lipsă înseamnă „necunoscut”, nu „fără pistă”.
- Harta are nevoie de internet pentru tile-urile OSM (cele văzute rămân în cache); procesarea, importul și rutarea merg și fără.

## Despre șocuri
- Sunt „șoc posibil”, nu „groapă”: **nu identificăm tipul obstacolului**.
- Cu GPS de ~5 m nu putem separa două obstacole aflate la câțiva metri; punctul se numește „zonă cu șoc”, cu raza vizibilă.
- `double_hit` (roata față + spate la ampatamentul ~1,05 m) e o ipoteză de verificat pe date, nu o dovadă.
- Șocurile nu intră în costul rutării (sunt deja parțial în RVI).

## Despre rutare
- Nu promitem rute „mai sigure”: nu avem date de accidente. Recomandăm doar rute cu vibrații măsurate mai mici.
- Dacă peste 50% din lungimea rutei e necunoscută, aplicația spune „Prea puține date pentru o recomandare de confort”.
- Aplicația nu interpretează legislația; trotuarele fără drept explicit pentru biciclete sunt excluse implicit, după etichetele OSM.
- Fără navigație pas cu pas.

## Despre tura live, locație și căutare (versiunea 2)
- **Ecranul trebuie să rămână aprins.** O aplicație web nu poate citi accelerometrul cu ecranul blocat sau aplicația în fundal; ShockGrid cere Wake Lock unde există și arată un banner dacă se pierd date. Pentru ture cu ecranul blocat rămâne Sensor Logger (importul se face după export; nu există integrare live cu Sensor Logger).
- **Cifrele live sunt informative.** În timpul turei rulăm aceleași funcții din nucleu pe ultimele ~30 s; rezultatul final vine din procesarea completă după oprire.
- **Posibilele denivelări nu sunt gropi.** Sunt șocuri puternice ale accelerometrului (giroscopul doar exclude mișcările mâinii). Tipul problemei îl spune utilizatorul, după tură. Confirmările nu schimbă costul rutelor (șocurile sunt deja parțial în RVI).
- **Locația:** precizia GPS (cercul albastru) nu garantează poziția exactă; viteza și direcția se afișează doar când sunt credibile. „Pornește” arată poziția pe rută și distanța rămasă, fără navigație pas cu pas sau indicații vocale.
- **Căutarea de adrese** prin Photon (komoot) e un serviciu public gratuit, fără garanție de disponibilitate; textul căutat ajunge la el. Fără rețea rămân străzile din indexul local și alegerea pe hartă. Adresele cu număr depind de completitudinea OpenStreetMap.
- **Rapoartele sunt doar locale.** Nu există o bază comună; nimeni altcineva nu le vede (vezi `docs/BACKEND-COMUNITAR.md`).
- **Nu a fost testat pe iPhone/Samsung fizic** (senzori, Wake Lock, permisiuni, fotografie, tastatura iOS, modul instalat): toate verificările de interfață sunt în Chromium, la dimensiunile ecranelor, cu GPS și senzori simulați.
- **Fără senzori de mișcare** (permisiune refuzată), tura live păstrează doar traseul GPS: nu se calculează confort și nu se detectează denivelări.
- **Actualizări:** o versiune nouă se aplică automat doar când nu e o tură, un import sau un raport în curs; altfel apare „Versiune nouă instalată · Reîncarcă”. Pe iPhone, dacă aplicația pare veche: Mai mult → Caută actualizări, sau închide complet aplicația și redeschide-o.
- **Harta în modul întunecat** e harta OpenStreetMap estompată (nu un stil întunecat dedicat); stilul „Întunecată” e o inversare a culorilor, cu etichete mai puțin fidele.

## Despre colectare
- Un site web **nu poate citi senzorii cu ecranul stins**. Înregistratorul propriu (P1) cere ecranul aprins (Screen Wake Lock); pentru turele de teren folosim **Sensor Logger**.
- Chrome pe Android rotunjește accelerația din browser la 0,1 m/s²; Sensor Logger nu.
- Înregistrarea cu ecranul blocat în Sensor Logger nu e considerată verificată până la testul din `docs/TEREN.md` (9.2d).

## Tehnice
- Graful străzilor se construiește din Overpass în GitHub Actions (mediul de dezvoltare local nu are acces la Overpass).
- Datele din IndexedDB sunt legate de origine: turele importate pe GitHub Pages nu apar pe alt URL (tunel, localhost) și invers; ștergerea datelor site-ului din browser le șterge.
- Pe iPhone, Safari poate șterge datele site-urilor neinstalate nefolosite 7 zile; instalează aplicația pe ecranul principal și exportă turele importante.
