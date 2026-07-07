# Lot L — Autocomplétion d'adresse (API Adresse data.gouv.fr)

> **Pour l'exécutant (Codex)** : TDD strict (test RED d'abord, vu échouer, puis
> implémentation minimale). Tout en français. `npm test` avant chaque commit.
> Préfixe de commit : `L: ...`. Un seul agent à la fois sur le dépôt.
> Cocher les cases au fur et à mesure.

## Contexte & décisions (mini-spec)

- **Objectif** : quand une auto-école saisit son adresse (inscription
  `views/auth/register.twig`, profil `views/dashboard/*` — champ `address`),
  proposer des suggestions officielles pendant la frappe. Moins de fautes de
  saisie → meilleur géocodage → meilleure carte (Lot E).
- **API** : `https://api-adresse.data.gouv.fr/search/?q=<texte>&limit=5&autocomplete=1`
  (gratuite, sans clé). JAMAIS appelée depuis le navigateur (CSP stricte
  `connect-src 'self'`) : on passe par un **relais interne**, exactement le
  pattern du SIRET (`src/services/siret.js` + `/api/siret/:siret`).
- **Jamais bloquant** : si l'API est lente/indisponible, l'utilisateur tape son
  adresse à la main comme aujourd'hui. Aucune erreur ne remonte au formulaire.
- **Hors périmètre** : pas de remplissage de latitude/longitude côté client —
  le géocodage à l'enregistrement (geocoder existant) reste la seule source
  des coordonnées. Pas d'autocomplétion côté moniteur (champ ville publique),
  éventuel lot ultérieur.

## Tâche 1 — Service relais `src/services/adresse.js`

- [x] RED : créer `test/lot-l.cjs` (PORT **4070**, gabarit de `test/lot-f.cjs` :
  serveur dédié, `ok()`, STAMP, nettoyage en `finally`, stub de `fetch` global
  restauré en `finally`). Premiers tests :
  - `searchAddress('8 bd du port, Amiens')` renvoie un tableau
    `{ label, city, postcode }` (stub de `fetch` renvoyant 2 features GeoJSON) ;
  - le même appel deux fois ne déclenche **qu'un** `fetch` (cache mémoire) ;
  - `fetch` qui rejette ou renvoie un statut ≠ 200 → `[]` (jamais de levée) ;
  - `q` trop courte (< 3 caractères après trim) → `[]` sans appel réseau ;
  - `ADRESSE_LOOKUP_DISABLED=1` (posé en tête du fichier de test, comme
    `SIRET_LOOKUP_DISABLED`) → `[]` sans appel réseau.
- [x] GREEN : implémenter sur le modèle de `src/services/siret.js` : timeout
  court (`AbortSignal.timeout(3000)`), cache `Map` clé = `q` normalisée
  (trim + minuscules), TTL 10 min, taille plafonnée (même mécanique d'éviction
  que le cache SIRET), mapping des `features` → `{ label, city, postcode }`
  (champs `properties.label/city/postcode`), `limit=5`.
- [x] Commit : `L: service relais API Adresse (cache, jamais bloquant)`

## Tâche 2 — Endpoint interne `GET /api/adresse?q=...`

- [x] RED (HTTP, dans `test/lot-l.cjs`) :
  - `GET /api/adresse?q=8+bd+du+port` → 200 JSON `{ resultats: [...] }`
    (service stubbé via l'objet requis, jamais destructuré — cf. règle mailer) ;
  - `q` absente ou < 3 caractères → 400 JSON `{ erreur: ... }` ;
  - la route est **GET public sans CSRF** (lecture seule) mais avec un
    rate-limit léger (30/min/IP, réponse 429 JSON), comme le relais SIRET.
- [x] GREEN : `src/controllers/adresseController.js` + route à côté de celle du
  SIRET (voir `src/routes/index.js`, montage de `/api/siret`).
- [x] Commit : `L: endpoint interne /api/adresse (relais CSP)`

## Tâche 3 — Front `public/js/adresse-autocomplete.js`

- [x] RED : test `vm.runInNewContext` avec DOM factice (pattern
  `runListingsMapJs` dans `test/lot-e.cjs`) :
  - le script s'attache aux `input[data-adresse-autocomplete]` et crée un
    `<datalist>` lié (attribut `list` posé sur l'input) ;
  - après saisie simulée, les suggestions du stub `fetch('/api/adresse?...')`
    deviennent des `<option>` remplies via `textContent`/`value` (JAMAIS
    d'innerHTML) ;
  - saisie < 3 caractères → aucun appel réseau ; les appels sont « debouncés »
    (deux saisies rapprochées → un seul fetch ; exposer le délai en constante
    et utiliser des timers réels courts, p. ex. 50 ms en test via un attribut
    `data-debounce-ms`).
- [x] GREEN : fichier séparé (CSP : aucun JS inline), debounce 300 ms par
  défaut, `AbortController` pour annuler la requête précédente, échec réseau
  silencieux.
- [x] Commit : `L: autocomplétion d'adresse côté navigateur (datalist, debounce)`

## Tâche 4 — Intégration vues + passation

- [x] RED (HTTP) : `/inscription` et la page profil contiennent
  `data-adresse-autocomplete` sur le champ `address` et chargent
  `/js/adresse-autocomplete.js` (balise `script` en bas de vue, `defer`,
  comme `siret-check.js`).
- [x] GREEN : modifier `views/auth/register.twig` + la vue profil
  (`grep -r 'name="address"' views/`).
- [x] Ajouter `node test/lot-l.cjs` à `"test"` dans `package.json`
  (après lot-k) ; `npm test` complet vert.
- [x] Mettre à jour `AGENTS.md` : Lot L livré, port 4070 pris,
  `ADRESSE_LOOKUP_DISABLED=1` dans les tests, prochain travail = préparation
  démo jury (script de démonstration) + config Mailpit côté utilisateur.
- [x] Commit : `L: autocomplétion branchée sur inscription et profil, feuille de route à jour`

## Pièges à ne pas oublier (rappels AGENTS.md)

- Typographie **française** dans tout texte utilisateur (— … ') ; ASCII toléré
  uniquement dans les labels de tests.
- Données de démo persistantes : jamais de comptage global exact dans les tests.
- `fetch` global à stubber/restaurer proprement (`finally`), port 4070 réservé
  à ce lot, préfixes STAMP sur toute donnée créée.
