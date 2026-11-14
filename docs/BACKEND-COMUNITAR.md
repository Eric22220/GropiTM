# Raportare comunitară: analiză (neimplementat)

**Stare:** ShockGrid nu are backend. Rapoartele și turele stau doar pe telefon (IndexedDB). GitHub Pages servește fișiere statice și nu poate primi date. Aplicația nu afișează nicăieri „publicat pentru toți”.

## De ce nu am construit în grabă un backend
Un endpoint public care primește poziții și fotografii de la oricine are nevoie de: validare, limitare a ratei, protecție anti-spam, moderare, ștergere la cerere (GDPR: poziția și traseul unei persoane sunt date personale, fotografiile pot conține fețe și numere de înmatriculare), un responsabil care îl operează și un cont plătit de cineva. Ghidul Primăriei cere explicit „nothing that needs a server tended at night” și trimiterea problemelor pe canalul oficial Sesizări.

## Varianta minimă, dacă se decide
| Componentă | Alegere posibilă | Motiv |
|---|---|---|
| API | Cloudflare Workers sau Supabase Edge Functions | gratuit la volum mic, fără server de administrat |
| Stocare | Cloudflare D1 / Supabase Postgres + PostGIS | interogări spațiale pe zone cu șoc |
| Anti-spam | Cloudflare Turnstile, limită pe IP/zi, dimensiune maximă | fără conturi |
| Moderare | coadă `pending` → aprobat de un operator; publicare doar agregată | nimic brut public |
| Confidențialitate | doar punctul și tipul, fără trasee; fotografii estompate sau deloc; ștergere după 90 de zile | minimizare |
| Responsabil | o echipă a Primăriei / departamentul de infrastructură velo | adoptabilitate |

Până atunci, fluxul recomandat: raport local → text pregătit → Sesizări (`https://sesizari.primariatm.ro/`), iar echipa publică doar stratul agregat aprobat (`npm run build-layer`).
