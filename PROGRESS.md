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

## Stare
(actualizat la fiecare fază — vezi mai jos)
