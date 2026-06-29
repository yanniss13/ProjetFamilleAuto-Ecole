# Lot A — Correctifs (design)

Date : 2026-06-29
Statut : validé, prêt pour plan d'implémentation.

## Contexte

MoniteurConnect est une plateforme d'annonces (Express 5 + Twig + Prisma) reliant
auto-écoles et moniteurs indépendants. Le MVP est fonctionnel. Une revue du code a
identifié plusieurs correctifs à fort impact (sécurité, RGPD, scalabilité) et à faible
ambiguïté de conception. Ils sont regroupés dans ce « Lot A ».

Les chantiers produit (notifications, suivi candidat, admin) et qualité/prod (tests
étendus, logging, Postgres) font l'objet de lots ultérieurs (B, C, D) avec leurs propres
specs.

## Objectifs du Lot A

1. **A1** — Ne plus laisser de fichiers sensibles orphelins sur le disque quand une
   annonce est supprimée.
2. **A2** — Rendre la recherche d'annonces insensible à la casse, de façon identique en
   SQLite (dev) et PostgreSQL (prod).
3. **A3** — Paginer les listes (annonces publiques, mes annonces, candidatures).
4. **A4** — Activer une Content-Security-Policy stricte sans casser l'existant.

Hors périmètre : tri configurable, politique de rétention RGPD automatique, suppression
individuelle d'une candidature (relèvent de lots ultérieurs).

---

## A1 · Nettoyage des fichiers à la suppression d'une annonce

### Problème
`listingController.destroy` appelle `listingService.deleteOwned`, qui fait
`prisma.listing.deleteMany`. La base supprime en cascade les `Application` et `Contract`
liés, mais **les fichiers physiques restent dans `storage/`** : CV, pièces d'identité,
permis, cartes d'enseignant et PDF de contrat. C'est une fuite de stockage et un problème
RGPD (conservation de pièces d'identité après suppression).

### Solution
- Ajouter un helper `deleteStored(relPath)` dans `src/config/storage.js` :
  - résout le chemin via `resolveStored` (anti path-traversal déjà en place) ;
  - supprime le fichier en **best-effort** : ignore l'absence, n'échoue jamais (log d'un
    avertissement en cas d'erreur réelle), retourne sans lever.
  - accepte une valeur falsy (`null`/`undefined`) sans rien faire.
- Ajouter dans `listingService` une fonction qui collecte tous les chemins de fichiers
  d'une annonce **scopée par `schoolId`** : pour chaque `Application` du listing, les
  champs `cvPath`, `idCardPath`, `licensePath`, `teachingCardPath`, et le `pdfPath` du
  `Contract` éventuel. Implémentation : `findMany({ where: { listingId, listing: { schoolId } }, include: { contract: true } })`.
- `listingController.destroy` :
  1. collecte les chemins (avant suppression) ;
  2. `deleteOwned` (cascade DB) ; si `count === 0` → `notFound` (annonce inexistante ou
     non possédée), aucun fichier touché ;
  3. si `count > 0` → `deleteStored` sur chaque chemin collecté (best-effort).
- Le message flash reste inchangé et honnête.

### Tests
Le smoke test crée une annonce, dépose une candidature complète (4 fichiers), génère un
contrat (1 PDF), puis supprime l'annonce et vérifie que **les 5 fichiers n'existent plus**
sur le disque.

---

## A2 · Recherche insensible à la casse (colonnes normalisées)

### Problème
`listingService.findPublic` utilise `contains` sur `title`, `description`, `city`. Le
comportement de la casse diffère selon le moteur ; le besoin est une recherche
insensible à la casse identique en dev (SQLite) et en prod (PostgreSQL). `mode: 'insensitive'`
n'est pas portable (Postgres uniquement) et laisserait le smoke test SQLite non
représentatif.

### Solution
Approche retenue : **colonnes normalisées en minuscules**.
- Migration Prisma : ajouter à `Listing` trois colonnes `String?` :
  `titleLower`, `descriptionLower`, `cityLower`.
- Backfill dans la migration : `UPDATE "Listing" SET titleLower = lower(title),
  descriptionLower = lower(description), cityLower = lower(city);`
- `listingService` : helper interne `withLower(data)` qui, pour chaque champ source
  présent dans `data`, ajoute le champ `*Lower` correspondant (`String.toLowerCase()`).
  Appliqué dans `createForSchool` et `updateOwned` afin de garder les colonnes
  synchronisées.
- `findPublic` cherche désormais sur les colonnes `*Lower` :
  `OR: [{ titleLower: { contains: q.toLowerCase() } }, { descriptionLower: { contains: q.toLowerCase() } }, { cityLower: { contains: q.toLowerCase() } }]`.
- Décision : la recherche couvre toujours la description (donc `descriptionLower` est
  conservée malgré la duplication de texte — coût négligeable à cette échelle).

### Tests
Le smoke test crée une annonce ville « Marseille » et vérifie qu'une recherche
`?q=MARSEILLE` (et `?q=marseille`) retourne l'annonce.

---

## A3 · Pagination

### Problème
`findPublic`, `findAllBySchool` et `findForOwnedListing` retournent toutes les lignes sans
limite. Ne passe pas à l'échelle.

### Solution
- Taille de page constante : **20** (constante partagée).
- Les fonctions de service paginées prennent un `page` (1-based, borné à ≥ 1) et
  retournent **`{ items, total }`**. Le calcul `pageCount = max(1, ceil(total / pageSize))`
  et le clamp `page` dans `[1, pageCount]` sont faits côté contrôleur via un petit
  utilitaire partagé (ex. `src/utils/pagination.js`), puis passés à la vue.
- Implémentation Prisma : `take: pageSize`, `skip: (page - 1) * pageSize`, plus un
  `count` avec le même `where`.
- Appliquée à trois écrans :
  - `/annonces` (public) — en conservant les filtres `departement` et `q` dans les liens
    de pagination ;
  - `/mes-annonces` (dashboard) ;
  - `/mes-annonces/:id/candidatures`.
- UI : partial Twig réutilisable `views/partials/pagination.twig` affichant
  « Précédent / Suivant » + « page X/Y ». Les liens reprennent les paramètres de requête
  courants (filtres + `page`). Boutons désactivés aux bornes.
- Tri inchangé : `createdAt desc` (plus récentes d'abord). Pas de tri configurable.

### Tests
Le smoke test crée plus de 20 annonces ouvertes et vérifie que la page 1 en contient 20,
que la page 2 contient le reste, et que les liens de pagination conservent un filtre.

---

## A4 · Activer la Content-Security-Policy

### Problème
`src/app.js` configure `helmet({ contentSecurityPolicy: false })`. La CSP, principal
rempart contre l'injection de scripts, est désactivée. Quatre éléments inline dans les
vues empêchaient son activation.

### Solution
- Remplacer `contentSecurityPolicy: false` par la CSP par défaut de helmet (stricte :
  `default-src 'self'`, pas d'`unsafe-inline`), en surchargeant uniquement `img-src` pour
  autoriser les tuiles Leaflet :
  `img-src 'self' data: https://*.tile.openstreetmap.org`.
- Mise en conformité des inline existants :
  - Les deux `onsubmit="return confirm(...)"` (`dashboard/applications.twig`,
    `dashboard/listings.twig`) → remplacés par un attribut `data-confirm="<message>"` sur
    le `<form>`, et un script externe `public/js/confirm.js` chargé globalement dans
    `views/layouts/base.twig` (balise `defer`), qui attache à tout `<form[data-confirm]>`
    un handler `submit` demandant confirmation (`window.confirm`).
  - Les deux `style="..."` de `dashboard/contract_form.twig` → classes utilitaires
    ajoutées à `public/css/style.css` (ex. `.muted-sm`, `.label-note`).
- Les scripts déjà externes (`/vendor/leaflet/leaflet.js`, `/js/listing-map.js`) sont
  servis depuis l'origine et restent conformes à `script-src 'self'`.

### Tests
Le smoke test vérifie que l'en-tête `Content-Security-Policy` est présent sur une réponse
HTML et que les pages clés (accueil, détail annonce avec carte, dashboard) répondent
toujours en 200.

---

## Impact / fichiers touchés (indicatif)

- `prisma/schema.prisma` + nouvelle migration (A2).
- `src/config/storage.js` (`deleteStored`) — A1.
- `src/services/listingService.js` (`withLower`, collecte des chemins, pagination) — A1/A2/A3.
- `src/services/applicationService.js` (pagination `findForOwnedListing`) — A3.
- `src/controllers/listingController.js` (destroy + pagination browse/mine) — A1/A3.
- `src/controllers/applicationController.js` (pagination forListing) — A3.
- `src/app.js` (CSP) — A4.
- `views/partials/pagination.twig` (nouveau) + `views/listings/index.twig`,
  `views/dashboard/listings.twig`, `views/dashboard/applications.twig` — A3.
- `views/dashboard/applications.twig`, `views/dashboard/listings.twig`,
  `views/dashboard/contract_form.twig` — A4.
- `public/js/confirm.js` (nouveau), `public/css/style.css` — A4.
- `test/smoke.cjs` — A1/A2/A3/A4.

## Risques / points d'attention

- **Backfill migration** : la migration doit fonctionner sur SQLite (dev) et rester
  compatible PostgreSQL (prod). `lower()` existe dans les deux.
- **CSP et Leaflet** : valider visuellement que la carte se charge (tuiles OSM) après
  activation. Si une autre source externe apparaît plus tard, ajuster les directives.
- **Best-effort de suppression fichiers** : une erreur disque ne doit jamais empêcher la
  suppression logique de l'annonce ; elle est journalisée, pas propagée.
