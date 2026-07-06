# Lot F — Vérification SIRET (design)

Date : 2026-07-06
Statut : validé, prêt pour plan d'implémentation.

⚠️ Ordonnancement : ce lot modifie `views/listings/index.twig`, également touché par le
Lot E (carte des annonces). N'exécuter le plan du Lot F qu'APRÈS la fin du Lot E.

## Contexte

À l'inscription, une auto-école saisit un SIRET seulement contrôlé en forme (14
chiffres, unicité). Rien ne prouve que l'établissement existe. Le Lot F vérifie le
SIRET auprès du répertoire Sirene via l'**API Recherche d'entreprises**
(`https://recherche-entreprises.api.gouv.fr` — publique, gratuite, sans clé) et
matérialise la confiance par un badge « École vérifiée » côté public.

## Décisions validées

1. **Assister sans bloquer** : établissement actif → « vérifié » ; introuvable ou
   fermé → avertissement, inscription possible ; API en panne → « non vérifié ».
   Une indisponibilité de l'API ne bloque JAMAIS une inscription.
2. **Vérification en direct pendant la saisie** (14 chiffres → appel debouncé) via un
   endpoint interne `GET /api/siret/:siret` (la CSP `connect-src 'self'` interdit
   d'appeler l'API externe depuis le navigateur), AVEC re-vérification côté serveur au
   submit (aucune confiance dans le client).
3. **Badge visible public + admin** : liste des annonces, page détail d'annonce,
   colonne statut dans la liste admin des écoles (avec le nom officiel Sirene).

## Objectifs / périmètre

Dans le périmètre :
- Champs `School.siretStatus` (`verified` | `not_found` | `closed` | `unverified`,
  défaut `unverified`), `School.siretVerifiedName` (nom officiel), `School.siretCheckedAt`.
- Service `src/services/siret.js` : `lookupSiret(siret)` → `{ status, name, address }`,
  timeout 4 s, ne lève jamais (`status: 'error'` en cas d'échec réseau/API), cache
  mémoire TTL 1 h (~500 entrées, éviction la plus ancienne). `SIRET_LOOKUP_DISABLED=1`
  court-circuite (tests, hors-ligne) en renvoyant `{ status: 'error' }`.
- Endpoint interne `GET /api/siret/:siret` : valide le format (14 chiffres après
  normalisation), rate-limit 30 req/15 min/IP, JSON `{ status, name, address }`.
- Page d'inscription : JS statique (`public/js/siret-check.js`) — à 14 chiffres
  saisis (debounce ~400 ms), appelle l'endpoint ; `verified` → badge « ✓ Établissement
  vérifié » + pré-remplissage raison sociale/adresse UNIQUEMENT si champs vides ;
  `closed`/`not_found` → avertissement textuel non bloquant ; `error` → silencieux.
- Au submit de l'inscription : `lookupSiret` côté serveur (cache → peu coûteux),
  stockage de `siretStatus`/`siretVerifiedName`/`siretCheckedAt`. Mapping
  `error` → `unverified` en base.
- Badges : « ✓ École vérifiée » sur la carte d'annonce (liste), la page détail, et
  colonne « Sirene » dans `/admin/ecoles` (statut + nom officiel).

Hors périmètre (YAGNI / plus tard) :
- Blocage des SIRET fermés/inconnus, file de modération dédiée.
- Re-vérification des comptes existants (restent `unverified`) ou périodique.
- Vérification du code NAF (activité auto-école) — mentionnable à l'oral.

## Architecture

### Service `src/services/siret.js`

- Appel : `GET https://recherche-entreprises.api.gouv.fr/search?q=<siret>&page=1&per_page=1`.
- Interprétation de la réponse (`results[0]`) :
  - aucun résultat → `not_found` ;
  - `matching_etablissements[0].etat_administratif === 'F'` (fermé) → `closed` ;
    sinon `A` (actif) → `verified` ;
  - `name` = `nom_complet` (ou `nom_raison_sociale`), `address` = adresse du
    `matching_etablissements[0]` (`adresse`), chaînes vides tolérées.
  - réponse non-ok, timeout (AbortController 4 s), JSON invalide → `error`.
- Cache mémoire clé = SIRET normalisé : TTL 1 h pour tout statut sauf `error`
  (TTL 1 min — une panne ne doit pas coller au SIRET pendant 1 h).
- User-Agent applicatif (même esprit que le géocodeur).

### Endpoint interne

- Route `GET /api/siret/:siret` montée dans `src/routes/index.js` (publique, avant
  les routeurs authentifiés), contrôleur dans `src/controllers/siretController.js`.
- Normalisation via `normalizeSiret` (existant dans `schoolValidator`) ; ≠ 14
  chiffres → `400 { status: 'invalid' }`.
- Rate-limit dédié (express-rate-limit, 30/15 min/IP, réponse JSON 429).

### Inscription

- `authController.register` : `lookupSiret` est appelé APRÈS la validation et AVANT
  `schoolService.create`, et les trois colonnes sont renseignées directement dans le
  `create`. Latence maîtrisée : timeout 4 s max, et l'appel est presque toujours servi
  par le cache (déjà chauffé par la vérification en direct du navigateur).
- `views/auth/register.twig` : zone d'état sous le champ SIRET
  (`<p id="siret-status" aria-live="polite">`), inclusion de
  `<script src="/js/siret-check.js" defer>` via le block `scripts`.
- Le JS ne modifie `businessName`/`address` que si `value` est vide.

### Badges

- Liste des annonces (`views/listings/index.twig`, carte d'annonce) et page détail
  (`views/listings/show.twig`) : `{% if l.school.siretStatus == 'verified' %}`
  → `<span class="badge-verified">✓ École vérifiée</span>` (les requêtes publiques
  incluent déjà `school`).
- `views/admin/schools.twig` : colonne « Sirene » = statut lisible + `siretVerifiedName`.
- CSS : `.badge-verified` (pastille verte discrète) ajouté en fin de `style.css`.

### Gestion d'erreurs

- Tout échec du service → `error` (endpoint) / `unverified` (stockage), jamais
  d'exception remontée à l'utilisateur.
- L'endpoint interne ne relaie jamais la réponse brute de l'API externe (surface
  contrôlée : `status`, `name`, `address` uniquement).

## Tests (`test/lot-f.cjs`, port 4062, ajouté à `npm test`)

Unitaires (fetch simulé, `SIRET_LOOKUP_DISABLED` inactif pour la section) :
- actif → `verified` + nom/adresse ; fermé → `closed` ; aucun résultat → `not_found` ;
- réponse non-ok / exception fetch → `error` ;
- cache : 2ᵉ appel même SIRET sans appel réseau ; `error` non collant (TTL court).

HTTP :
- `GET /api/siret/abc` → 400 `{ status: 'invalid' }` ;
- `GET /api/siret/<14 chiffres>` (service monkeypatché) → JSON `{ status, name, address }` ;
- inscription complète (service monkeypatché `verified`) → colonnes `siretStatus`,
  `siretVerifiedName`, `siretCheckedAt` renseignées en base ;
- inscription avec service en échec → compte créé, `siretStatus = 'unverified'` ;
- badge « École vérifiée » présent sur `/annonces` et `/annonces/:id` pour une école
  `verified`, absent pour une école `unverified` ;
- `/admin/ecoles` affiche le statut Sirene.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `prisma/schema.prisma` + migration (recette diff+deploy) | 3 colonnes School |
| `src/services/siret.js` | nouveau |
| `src/controllers/siretController.js` | nouveau |
| `src/routes/index.js` | route `/api/siret/:siret` + limiter |
| `src/controllers/authController.js` | stockage du statut à l'inscription |
| `views/auth/register.twig` | zone d'état + script |
| `public/js/siret-check.js` | nouveau |
| `views/listings/index.twig`, `views/listings/show.twig` | badge public (APRÈS Lot E) |
| `views/admin/schools.twig` | colonne Sirene |
| `public/css/style.css` | `.badge-verified` |
| `test/lot-f.cjs` + `package.json` | tests |
