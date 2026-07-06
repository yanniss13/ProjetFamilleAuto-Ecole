# Lot E — Carte des annonces & recherche par rayon (design)

Date : 2026-07-06
Statut : validé, prêt pour plan d'implémentation.

## Contexte

MoniteurConnect affiche les annonces en liste sur `/annonces` (filtres département +
mot-clé, pagination) et une carte Leaflet **par annonce** sur la page détail quand
l'auto-école est géolocalisée (adresse géocodée via Nominatim à l'inscription/profil).
Le Lot E ajoute une **vue carte de toutes les annonces** et une **recherche par rayon**
autour d'une ville, pour la démo jury (feuille de route : Lots E→J, cf. lot-roadmap).

Tout l'outillage existe déjà : Leaflet auto-hébergé (`public/vendor/leaflet/`), CSP
autorisant les tuiles OSM (`img-src *.tile.openstreetmap.org`), géocodeur Nominatim
(`src/services/geocoder.js`), coordonnées sur `School.latitude/longitude`.

## Décisions validées

1. **Emplacement** : bascule « Liste | Carte » sur `/annonces` (paramètre `?vue=carte`,
   liste par défaut). Mêmes filtres pour les deux vues. Pas de page dédiée, pas de vue
   partagée 50/50.
2. **Rayon** : point de départ = **ville saisie** (« Autour de : [ville] dans un rayon de
   [10/25/50/100 km] », défaut 25). Pas de géolocalisation navigateur (imprévisible en
   démo).
3. **Marqueurs** : **un par auto-école** (les annonces d'une même école partagent ses
   coordonnées) ; popup = nom de l'école + ses annonces ouvertes (liens). Pas de plugin
   de clustering.
4. **Transport des données** : bloc `<script type="application/json">` rendu serveur,
   lu par un JS statique. Un bloc de données JSON n'est pas exécutable : compatible CSP
   `script-src 'self'` sans assouplissement. Pas de nouvel endpoint JSON (YAGNI).

## Objectifs / périmètre

Dans le périmètre :
- Bascule Liste/Carte sur `/annonces`, filtres (département, mot-clé, ville+rayon)
  communs aux deux vues, conservés dans les liens (pagination incluse).
- Vue carte : marqueur par école, popup avec annonces ouvertes ; centrage France
  (zoom 6) par défaut ; si rayon actif, centrage sur la ville + cercle du rayon.
- Vue liste avec rayon actif : tri par distance croissante + badge « à X km » par
  annonce.
- Géocodage de la ville cherchée via Nominatim avec **cache mémoire** (TTL 24 h,
  taille bornée) — une ville donnée n'est géocodée qu'une fois (politique d'usage OSM).
- Ville introuvable → message clair, filtre rayon ignoré, autres filtres conservés.
- Annonces d'écoles non géolocalisées : présentes en liste, absentes de la carte, avec
  mention « N annonce(s) sans localisation » en vue carte.

Hors périmètre (YAGNI / lots ultérieurs) :
- Rechargement dynamique des marqueurs au déplacement de la carte (pas d'API JSON).
- Clustering de marqueurs, géolocalisation navigateur, autocomplétion de ville.
- Persistance du cache de géocodage (mémoire process suffisant).

## Architecture

### Données & algorithme de distance

- Nouveau `src/utils/geo.js` :
  - `haversineKm(lat1, lng1, lat2, lng2)` — distance exacte en km ;
  - `bboxAround(lat, lng, radiusKm)` — bornes `{ minLat, maxLat, minLng, maxLng }`.
- `listingService.findPublic({ department, q, page, center, radiusKm })` :
  - sans `center` : comportement actuel inchangé (count + skip/take SQL) ;
  - avec `center` : pré-filtre SQL par boîte englobante sur `school.latitude/longitude`
    (portable SQLite/Postgres), affinage haversine en JS, tri par distance croissante,
    pagination par découpage du tableau. Chaque item reçoit `distanceKm` (arrondi au km,
    plancher 1 km). Volume borné par la boîte englobante : acceptable à l'échelle du
    projet.
- Nouveau `listingService.findPublicForMap({ department, q, center, radiusKm })` : mêmes
  filtres SANS pagination, uniquement les annonces d'écoles géolocalisées, groupées par
  école : `[{ schoolName, latitude, longitude, listings: [{ id, title, city }] }]`.
  Retourne aussi le nombre d'annonces non localisées correspondant aux filtres.

### Géocodage (ville cherchée)

- `geocoder.js` : ajout d'un cache mémoire `Map` normalisée (`ville.trim().toLowerCase()`
  → `{ coords, expiresAt }`), TTL 24 h, ~200 entrées max (éviction la plus ancienne).
  Les échecs (null) sont aussi mis en cache (TTL court, 5 min) pour ne pas marteler
  Nominatim sur une faute de frappe répétée.
- Exposé via `geocodeCached(ville)` ; `GEOCODING_DISABLED=1` respecté (tests).

### Contrôleur & vue

- `listingController.browse` : parse `vue` (`liste`|`carte`), `ville`, `rayon`
  (entier ∈ {10, 25, 50, 100}, défaut 25 si `ville` seule). Si `ville` fournie :
  `geocodeCached` → `center` ; introuvable → variable de vue `villeIntrouvable`.
  - vue liste : rendu actuel + badges distance si rayon actif ;
  - vue carte : `findPublicForMap` + sérialisation JSON avec remplacement du caractère
    « inférieur à » par la séquence d'échappement unicode `\u003c` (empêche un titre malveillant contenant
    une balise fermante script de fermer le bloc de données).
- `views/listings/index.twig` : boutons de bascule (liens conservant la query),
  champs « ville » + select « rayon » dans le formulaire de filtres, conteneur
  `#listings-map` + bloc `<script type="application/json" id="map-data">`, badge
  distance, mention annonces non localisées.
- Nouveau `public/js/listings-map.js` (l'actuel `listing-map.js` de la page détail ne
  change pas) : lit `#map-data`, construit la carte (tuiles OSM comme l'existant),
  marqueurs + popups (contenu construit via DOM/`textContent`, jamais `innerHTML` avec
  des données), cercle de rayon si présent, `fitBounds` sur les marqueurs sinon vue
  France (46.6, 2.4, zoom 6).

### Gestion d'erreurs

- Ville introuvable ou géocodeur en échec/timeout : message « Ville introuvable — le
  filtre de rayon a été ignoré », résultats rendus avec les autres filtres.
- `rayon` invalide : ramené à 25. `vue` invalide : ramenée à `liste`.
- Aucun résultat dans le rayon : état vide existant (« aucune annonce ») en liste ;
  carte centrée sur la ville avec le cercle, sans marqueur.

## Tests (`test/lot-e.cjs`, ajouté à `npm test`)

Unitaires :
- `haversineKm` : Marseille→Aix ≈ 25 km (±3), distance nulle à soi-même ;
- `bboxAround` : contient un point à `radius-1` km, exclut à `radius+1` km (via haversine) ;
- cache géocodage : 2ᵉ appel n'appelle pas le réseau (compteur via monkeypatch fetch),
  entrée expirée re-géocodée.

HTTP (serveur dédié, données nettoyées, pattern des lots précédents) :
- `/annonces?vue=carte` : bloc `#map-data` présent, contient l'école géolocalisée et
  PAS l'école sans coordonnées ; mention « sans localisation » correcte ;
- rayon : école A (Marseille) incluse, école B (Lille) exclue pour
  `ville=Marseille&rayon=50` (géocodeur monkeypatché → coords fixes, pas de réseau) ;
- tri par distance + badge « à X km » en vue liste avec rayon ;
- ville introuvable (géocodeur → null) : message affiché, liste non filtrée par rayon ;
- filtres département/mot-clé actifs en vue carte ;
- école suspendue absente de la carte (réutilise le filtre `suspended` existant).

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/utils/geo.js` | nouveau |
| `src/services/geocoder.js` | cache mémoire + `geocodeCached` |
| `src/services/listingService.js` | options `center`/`radiusKm` + `findPublicForMap` |
| `src/controllers/listingController.js` | params `vue`/`ville`/`rayon`, données carte |
| `views/listings/index.twig` | bascule, champs rayon, conteneur carte, badges |
| `public/js/listings-map.js` | nouveau |
| `test/lot-e.cjs` + `package.json` | tests |
