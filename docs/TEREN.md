# Protocolul turelor de teren

## Lista rapidă pentru mâine (fără laptop)

**Acasă, înainte de plecare (10 min)**
1. Pe iPhone, deschide ShockGrid de pe ecranul principal → **Mai mult → Caută actualizări**. Trebuie să scrie „Ai cea mai nouă versiune”.
2. Telefoane încărcate (≥ 80%). Suport ferm pe ghidon; telefonul nu se mișcă dacă scuturi ghidonul.
3. În **Sensor Logger** (pe ambele telefoane), la senzori: **Accelerometer, Gyroscope, versiunile Uncalibrated, Location** pornite; frecvența **100 Hz**.
4. **Test de 1 minut afară:** pornește înregistrarea în Sensor Logger, mergi pe jos 1 minut cu telefonul blocat, oprește → **Export → ZIP** → salvează în Fișiere / Descărcări → ShockGrid → **Ture → Importă**. Trebuie să apară tura cu GPS (traseul pe hartă). Mesajul „nu putem estima confortul” e normal pentru mers pe jos.

**Pe traseu**
5. Pornește înregistrarea în Sensor Logger **înainte** de primul segment, din oprire. Telefonul poate fi blocat.
6. Mergi normal, ~15–25 km/h. Nu atinge telefonul în mers.
7. Fiecare segment de referință (asfalt bun ~200 m, pavaj ~150 m) și fiecare traseu A→B: **de 2 ori**, cu aceeași bicicletă și același telefon. O înregistrare separată pentru fiecare, cu nume clar (ex. `AB-traseu1-dus`).
8. Dacă vezi o problemă a drumului: **oprește-te**, apoi ShockGrid → **Raportează** (sau „Marchează pentru mai târziu”).

**După fiecare înregistrare (din oprire)**
9. Sensor Logger → **Export → ZIP** → ShockGrid → **Ture → Importă**.
10. Dacă apare „Am observat N posibile denivelări”, răspunde **Da / Nu / Nu știu** pentru fiecare.
11. Pe pagina turei verifică: distanța, „Cât de confortabil a fost” (are culori?) și „Harta s-a actualizat”. După a 2-a trecere pe aceeași stradă, linia devine **plină** (măsurat sigur).
12. **Ture → tura → Detalii → „Cât de confortabil ți s-a părut (1–5)”**: notează imediat.

**Ce NU e o problemă**
- Linie întreruptă = o singură trecere sau GPS slab. Normal după prima tură.
- Străzile fără culoare = încă nemăsurate.
- „Nu avem încă suficiente măsurători pentru o recomandare de confort” pe rute nemăsurate = corect.

**Ce trebuie notat (pentru echipă)**
- Ora fiecărui segment de referință și a fiecărui traseu, numele fișierelor.
- Obstacolele de referință (capace, rosturi): adresa aproximativă.
- Orice ecran care s-a blocat sau mesaj ciudat: o captură de ecran.

**Seara, pe laptop:** copiază toate ZIP-urile în `rides/` și urmează secțiunea „La întoarcere” de mai jos.

---

## Siguranță
Pe lumină, suport ferm pe ghidon, viteză normală, fără atingerea telefonului în mers, fără manevre forțate peste obstacole. Toate marcajele și adnotările se fac **din oprire**.

## Înainte de plecare (9.2d, 9.4)
1. Sensor Logger pe ambele telefoane: senzori **Accelerometer, Gravity, Gyroscope, versiunile Uncalibrated, Location**; frecvența **100 Hz**.
2. Pe fiecare telefon: o înregistrare de **2 minute cu ecranul blocat și telefonul în mișcare** (pe jos, afară). Export ZIP → import în ShockGrid (sau `npm run inspect`): verifică frecvența (~100 Hz iPhone / ~58 Hz Samsung), golurile (0 ideal) și fixurile GPS (~1 Hz). Până la acest test, înregistrarea cu ecranul blocat nu e verificată.
3. Un test de 30 s cu export, verificat la fel.

## Segmente de referință (calibrarea claselor)
- un segment de pistă cu asfalt bun, ~200 m → înregistrări `ref-neted-1`, `ref-neted-2`;
- un segment cu pavaj sau piatră cubică, ~100–200 m → `ref-pavaj-1`, `ref-pavaj-2`;
- fiecare parcurs de 2 ori; începutul și sfârșitul marcate din oprire (adnotare Sensor Logger sau „Marchează reper” în înregistratorul propriu).

## Suprafețe diferite
- Pe trotuar: înregistrare separată sau adnotare din oprire („trotuar de aici”, „carosabil de aici”). La import, alege suprafața declarată.
- Pe străzi cu pistă pe trotuar, mergi pe pistă; pe străzi fără pistă, alege carosabilul sau trotuarul după cum e sigur și legal, nu după ce vrei să măsori.

## Șocuri de referință
- 5–10 obstacole vizibile și sigure la viteză normală: rosturi de pod, capace de canal ușor denivelate, treceri peste șine de tramvai în unghi corect, borduri coborâte. Nimic periculos.
- Notează-le înainte, pe jos sau din oprire (adnotare sau listă cu adresa aproximativă) și apoi în `eval/obstacles.json`: `[{"name": "capac canal X", "lat": 45.7..., "lon": 21.2...}]`.
- Treci peste fiecare de 2–3 ori, în același sens.

## Comparația A→B (nucleul demo-ului)
- Două puncte A și B la ~1,5–2,5 km, cu 2–3 trasee posibile, legale și sigure, diferite ca suprafață. Traseele se aleg **înainte** de măsurare și se prezintă ce iese, inclusiv „alternativa mai lungă nu e semnificativ mai netedă”.
- Fiecare traseu A→B și B→A, ideal de 2 ori. Același telefon, aceeași bicicletă, același suport, aceeași presiune în roți, viteză obișnuită.
- Nume: `AB-traseu1-dus`, `AB-traseu1-intors`, `AB-traseu2-dus` …
- După fiecare traseu, fiecare biciclist notează confortul perceput 1–5 (hârtie sau ShockGrid → Ture → Confort perceput) și în `eval/ratings.json`: `{"AB-traseu1-dus": 4}`.

## La întoarcere
1. Exporturile ZIP se copiază pe laptop în `rides/` (nu se publică).
2. `npm run inspect -- rides/*.zip` → rezultatul în PROGRESS.md.
3. `npm run build-layer -- rides/*.zip --note "telefon · bicicletă · suport"` → snapshotul în `public/data/` (doar agregat).
4. `npm run validate -- rides/*.zip` → `eval/results-<data>.json`.
5. Commit + push → deploy automat. Pe telefon, importul turelor noi actualizează harta imediat, fără deploy.
