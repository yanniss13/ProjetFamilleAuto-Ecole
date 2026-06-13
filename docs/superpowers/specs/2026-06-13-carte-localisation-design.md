# Design — Carte de localisation de l'auto-école

> Date : 2026-06-13. Projet : MoniteurConnect. Statut : validé, implémentation lancée.

## 1. Vue d'ensemble

Afficher, sur la **page détail d'une annonce**, une carte dynamique avec un marqueur sur
l'**adresse de l'auto-école** qui publie l'annonce. L'adresse est un attribut **optionnel**
du compte auto-école ; si elle est renseignée et géocodable, la carte s'affiche, sinon un
message « Localisation indisponible ».

Services retenus (gratuits, sans clé API) : **Nominatim (OpenStreetMap)** pour le géocodage
côté serveur, **Leaflet + tuiles OSM** pour le rendu (assets Leaflet embarqués en local).

## 2. Modèle de données (Prisma)

`School` reçoit trois champs optionnels :
- `address String?`
- `latitude Float?`
- `longitude Float?`

La page détail publique inclut déjà `listing.school`, qui exposera donc l'adresse + coords.
Migration additive : `school_address_geo`.

## 3. Géocodage

`services/geocoder.js` : `geocode(address) -> { lat, lng } | null`.
- Appelle Nominatim (`/search?format=json&q=...&limit=1&countrycodes=fr`) via `fetch`, avec
  un en-tête `User-Agent` identifiant l'application (politique d'usage OSM).
- Tout échec (réseau, aucun résultat, parsing) renvoie `null` — **jamais bloquant**.
- Court-circuit déterministe pour les tests : si `process.env.GEOCODING_DISABLED === '1'`,
  renvoie `null` immédiatement (aucun appel réseau).

**Quand géocoder** : uniquement à l'enregistrement de l'adresse (inscription si fournie,
modification du profil si l'adresse change) — pas à l'affichage.

## 4. Inscription (adresse optionnelle)

- `views/auth/register.twig` : champ « Adresse » optionnel.
- `schoolValidator.validateRegister` : `address` accepté, non requis (trim, `null` si vide).
- `authController.register` : enregistre l'adresse ; si présente, géocode et met à jour
  `latitude/longitude` (try/catch non bloquant).

## 5. Page profil (nouveau)

- Routes protégées `GET /mon-compte`, `POST /mon-compte` (montées avec `requireAuth` +
  `loadSchool`).
- `controllers/accountController.js` + `routes/accountRoutes.js` + `views/dashboard/account.twig`.
- Édite **adresse** + **téléphone** (champs non identitaires). Re-géocode si l'adresse change
  (vide l'adresse ⇒ coords mises à `null`).
- `schoolValidator.validateProfile` : validation dédiée (adresse/téléphone optionnels).
- Lien « Mon compte » ajouté à `partials/nav.twig` quand connecté.

## 6. Carte (page détail)

- `views/layouts/base.twig` : ajout de blocs `{% block head %}` et `{% block scripts %}`
  pour charger des assets par page.
- `views/listings/show.twig` :
  - si `listing.school.latitude` & `longitude` → conteneur `<div id="map" data-lat data-lng
    data-label>` + CSS/JS Leaflet via les blocs ;
  - sinon → encart « Localisation indisponible ».
- `public/js/listing-map.js` : si `#map` porte des coords, initialise Leaflet (vue centrée,
  marqueur + popup nom/adresse). Icône de marqueur définie explicitement vers
  `/vendor/leaflet/images/*` (évite le bug d'icône cassée).
- Assets Leaflet copiés en local dans `public/vendor/leaflet/` (`leaflet.css`, `leaflet.js`,
  `images/`). Tuiles servies par OSM au runtime (attribution affichée).

## 7. Tests (`test/smoke.cjs` étendu)

- `GEOCODING_DISABLED=1` (pas de réseau).
- Inscription avec adresse acceptée (champ optionnel).
- Coords posées via Prisma → la page détail rend `#map` avec les bons `data-lat`/`data-lng`.
- École sans coords → la page détail affiche « Localisation indisponible » (pas de `#map`).
- Mise à jour de l'adresse via `POST /mon-compte` (vérif en base).

## 8. Sécurité / notes

- CSP désactivée dans helmet (déjà le cas) → assets locaux + tuiles OSM se chargent. Une CSP
  ultérieure devra autoriser `tile.openstreetmap.org` et `'unsafe-inline'`/script local.
- Politique OSM : géocodage 1 req/enregistrement (pas par vue) ; tuiles publiques OK à petite
  échelle, à remplacer par un fournisseur dédié / auto-hébergement si le trafic grandit.

## 9. Hors périmètre

Carte globale sur `/annonces`, clustering de marqueurs, recherche d'adresse interactive,
auto-hébergement des tuiles, fournisseur de géocodage payant.
