# Lot H — Dashboard statistiques (design)

Date : 2026-07-06
Statut : validé, prêt pour plan d'implémentation.

## Contexte

Le tableau de bord école affiche deux compteurs (annonces, candidatures) et le
dashboard admin trois. Le Lot H les transforme en vrais tableaux de bord chiffrés :
tuiles KPI, graphique des candidatures par semaine, entonnoir de recrutement
(vues → candidatures → acceptées → signées) et top annonces. Avant-dernier gros
visuel de la démo jury (feuille de route E→J, lots E/F/G livrés).

## Décisions validées

1. **Périmètre : école + admin.** Le tableau de bord école reçoit tuiles + graphiques
   + top annonces ; le dashboard admin réutilise les mêmes composants pour des stats
   plateforme.
2. **Vues : compteur simple** `Listing.viewsCount` incrémenté à chaque affichage de la
   page détail publique (fire-and-forget). Pas de table d'événements datés — la série
   temporelle porte sur les candidatures (`createdAt` déjà en base).
3. **Rendu : SVG construit côté client en DOM** par un JS statique, à partir d'un bloc
   de données `<script type="application/json" id="stats-data">` (même pattern éprouvé
   que la carte du Lot E). Pas de bibliothèque de graphiques.

## Objectifs / périmètre

Dans le périmètre :
- **Colonne `Listing.viewsCount Int @default(0)`** (migration recette diff+deploy),
  incrémentée dans `listingController.show` sans attendre (fire-and-forget, jamais
  bloquant, `updateMany` sans lecture préalable).
- **Service `src/services/statsService.js`** (calculs purs + requêtes bornées) :
  - `weeklyBuckets(dates, weeks)` — regroupe des dates par semaine (lundi comme début,
    calcul JS portable), renvoie exactement `weeks` entrées ordonnées (semaines vides
    à 0), chaque entrée `{ label: 'JJ/MM', count }` ;
  - `rate(part, total)` — pourcentage entier, `0` si `total === 0` (jamais NaN) ;
  - `forSchool(schoolId)` → `{ tiles, weekly, funnel, topListings }` :
    - `tiles` : `{ openListings, totalViews, applications, acceptRate, signedContracts }`
      (acceptRate = acceptées / candidatures) ;
    - `weekly` : candidatures des 12 dernières semaines (via `weeklyBuckets`) ;
    - `funnel` : `[{ label, count }]` pour vues, candidatures, acceptées, signées
      (+ taux de conversion calculés côté client à l'affichage ou fournis — fournis :
      `rateFromPrevious` par étape) ;
    - `topListings` : 5 annonces max triées par candidatures desc puis vues desc —
      `{ id, title, views, applications, conversionRate }` ;
  - `forPlatform()` → `{ tiles, schoolsWeekly, applicationsWeekly }` :
    - `tiles` : `{ schools, listings, applications, signedContracts }` ;
    - deux séries hebdo (12 semaines) : inscriptions d'écoles, candidatures.
  - Toutes les requêtes de séries sont bornées aux 84 derniers jours (`createdAt >=`),
    le bucketing se fait en JS (portable SQLite/PostgreSQL).
- **Tableau de bord école** (`dashboardController.index` + `views/dashboard/index.twig`) :
  rangée de 5 tuiles (réutilise `stats-grid`/`stat-card` existants), graphique barres
  « Candidatures par semaine », entonnoir horizontal « Vues → Candidatures →
  Acceptées → Contrats signés » (avec % de conversion entre étapes), tableau « Top
  annonces » (titre lié, vues, candidatures, conversion). Bloc `#stats-data` + script.
- **Dashboard admin** (`adminController.dashboard` + `views/admin/dashboard.twig`) :
  4 tuiles (écoles, annonces, candidatures, contrats signés) + barres « Inscriptions
  par semaine » et « Candidatures par semaine ». Même bloc + même script.
- **`public/js/dashboard-charts.js`** (statique, partagé école/admin) : lit
  `#stats-data`, construit les SVG en DOM (`createElementNS`, `textContent` pour tout
  texte — jamais d'HTML assemblé avec des données), rend :
  - `renderBarChart(el, serie)` — barres verticales fines, coins arrondis 2 px côté
    valeur, une seule teinte, libellé de valeur au-dessus des barres non nulles,
    libellés d'axe (1 semaine sur 2 si serré), `<title>` natif par barre (survol) ;
  - `renderFunnel(el, steps)` — barres horizontales proportionnelles à la 1ʳᵉ étape,
    libellé + valeur à gauche/droite en encre neutre, % de conversion entre les
    étapes, `<title>` par barre.
- **Règles visuelles (issues du skill dataviz, à respecter à l'implémentation)** :
  une seule teinte par graphique (`#2563eb`, validée contrastes/CVD avec le vert
  `#15803d` et l'ambre `#b45309` sur surface claire) ; le texte reste en encre neutre
  (jamais de texte coloré à la couleur des barres) ; grille/axes discrets ; pas de
  valeur sur chaque point sans nécessité (barres nulles non étiquetées) ; jamais de
  double axe ; entonnoir = magnitude, une teinte, PAS un dégradé arc-en-ciel.
- Le commentaire autoescape de `src/app.js` évolue : deux blocs de données `|raw`
  documentés (`#map-data`, `#stats-data`), même règle (JSON avec `<` échappé).

Hors périmètre (YAGNI) :
- Bibliothèque de graphiques (Chart.js…), courbe des vues dans le temps, export CSV,
  comparaison de périodes, filtres de dates, thème sombre des graphiques.
- Dé-duplication des vues (IP/session) : un compteur brut suffit ; à mentionner
  honnêtement à l'oral si la question vient.

## Architecture

### Comptage des vues

Dans `listingController.show`, après avoir trouvé l'annonce publique :

```js
listingService.incrementViews(id); // fire-and-forget, catch avalé dans le service
```

`listingService.incrementViews(id)` = `prisma.listing.updateMany({ where: { id },
data: { viewsCount: { increment: 1 } } }).catch(() => {})` — jamais de `await` dans
le contrôleur, l'affichage ne dépend pas du compteur.

### Sérialisation vers la vue

- Contrôleurs : `statsJson: JSON.stringify(stats).replace(/</g, '\\u003c')` —
  même échappement de `<` que `mapJson` du Lot E, rendu `{{ statsJson|raw }}` dans le bloc
  `<script type="application/json" id="stats-data">`.
- Les titres d'annonces du top passent par le tableau Twig (autoescape normal), PAS
  par le JSON — seuls les libellés de graphiques (dates, étapes) et les nombres
  transitent par le JSON, mais l'échappement de `<` reste appliqué par principe.

### Gestion d'erreurs

- `rate()` et `weeklyBuckets()` totalisent proprement les cas vides (0 partout,
  12 buckets à zéro) : un compte tout neuf voit un dashboard complet, pas d'erreur.
- Échec de l'incrément de vues : silencieux (catch dans le service).
- JS graphiques : `try/catch` autour du `JSON.parse`, abandon silencieux si le bloc
  manque (pages sans stats).

## Tests (`test/lot-h.cjs`, port 4064, ajouté à `npm test`)

Unitaires :
- `weeklyBuckets` : 12 entrées exactement, semaines vides à 0, une date d'aujourd'hui
  comptée dans la dernière entrée, une date d'il y a 8 jours dans l'avant-dernière ou
  la précédente (selon le lundi), labels `JJ/MM` ;
- `rate` : `rate(1, 4) === 25`, `rate(0, 0) === 0`, `rate(3, 3) === 100`.

HTTP :
- 2 GET publics sur une annonce → `viewsCount === 2` en base ; l'affichage n'échoue
  pas si l'incrément échoue (pas testable directement — couvert par le catch) ;
- dashboard école : bloc `#stats-data` présent, `tiles.applications` exact, les
  candidatures d'une AUTRE école n'apparaissent pas (isolation), tuile « taux
  d'acceptation » cohérente après une acceptation ;
- entonnoir : après flux complet (vues + candidatures + acceptée + signée directement
  posée en base), `funnel` = valeurs attendues ;
- top annonces : l'annonce la plus candidatée en premier, `conversionRate` correct ;
- compte neuf : dashboard 200 avec tuiles à 0 (pas d'erreur) ;
- dashboard admin : `#stats-data` présent, tuiles plateforme ≥ valeurs semées,
  `schoolsWeekly` de 12 entrées ;
- vues : `/tableau-de-bord` et `/admin` référencent `/js/dashboard-charts.js`.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `prisma/schema.prisma` + migration | `Listing.viewsCount` |
| `src/services/listingService.js` | `incrementViews` |
| `src/controllers/listingController.js` | appel fire-and-forget dans `show` |
| `src/services/statsService.js` | nouveau (buckets, rate, forSchool, forPlatform) |
| `src/controllers/dashboardController.js`, `src/controllers/adminController.js` | stats + JSON |
| `views/dashboard/index.twig`, `views/admin/dashboard.twig` | tuiles, conteneurs, bloc JSON |
| `public/js/dashboard-charts.js` (nouveau) | SVG barres + entonnoir |
| `public/css/style.css` | conteneurs de graphiques |
| `src/app.js` | commentaire |raw (2 blocs documentés) |
| `test/lot-h.cjs` + `package.json` + `AGENTS.md` | tests + intégration |
