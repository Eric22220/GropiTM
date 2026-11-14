# Protocolul turelor de teren

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
