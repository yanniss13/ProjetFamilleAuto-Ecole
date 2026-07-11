# Responsive mobile et présentation jury — spécification

**Date :** 2026-07-10  
**Statut :** direction visuelle validée par l'utilisateur le 2026-07-10  
**Périmètre :** largeurs de viewport inférieures ou égales à 600 px ; rendu
desktop conservé.

## 1. Contexte et problème réel

Le premier rapport responsive comparait `documentElement.scrollWidth` à
`window.innerWidth`. Sous l'émulation mobile de Chromium, `innerWidth` pouvait
s'élargir à environ 485 px pour un écran demandé à 320 px. Le rapport concluait
donc à tort à l'absence de débordement, et les captures `r320` et `r375`
avaient quasiment la même largeur.

Le contrôle corrigé utilise le viewport visuel réel. Il a révélé trois causes :

- navigation trop large et non repliable ;
- tableaux de gestion plus larges que leur conteneur ;
- empreinte SHA-256 impossible à couper sur la page de suivi.

Les corrections minimales éliminent le débordement, mais l'objectif utilisateur
est plus exigeant : à 320 et 375 px, l'application doit paraître volontairement
conçue pour mobile, centrée et assez propre pour être montrée au jury.

## 2. Direction retenue

La version mobile adopte un **header compact avec menu burger accessible**.
Le mot-symbole MoniteurConnect reste centré et le bouton burger occupe une zone
tactile carrée à droite. À l'ouverture, la navigation apparaît dans un panneau
blanc pleine largeur sous le header ; ses liens sont centrés, espacés et faciles
à toucher.

Le reste de l'interface suit une composition mobile calme : une colonne,
surfaces blanches, titres centrés, actions principales larges et espacements
resserrés. Les textes longs, labels de formulaire et données restent alignés à
gauche pour conserver une lecture naturelle.

### Signature visuelle

Le seul geste visuel marqué est le bouton burger bleu qui devient une croix et
le fin rail bleu du panneau ouvert. Il reprend la couleur d'action existante et
évoque un guide de parcours sans introduire une nouvelle identité graphique.
Les animations restent courtes et sont supprimées avec
`prefers-reduced-motion`.

## 3. Navigation mobile

### Structure HTML

`views/partials/nav.twig` conserve **une seule liste de liens** afin de ne pas
dupliquer les branches visiteur, école et administrateur.

Le header contient :

1. le lien de marque existant ;
2. un bouton `button.navbar-toggle`, masqué par défaut dans le HTML, avec :
   - `type="button"` ;
   - `aria-expanded="false"` ;
   - `aria-controls="navigation-principale"` ;
   - un libellé accessible « Ouvrir le menu » ;
3. la navigation existante avec `id="navigation-principale"`.

Le bouton affiche trois traits décoratifs avec `aria-hidden="true"`. Aucun SVG
inline ni gestionnaire JavaScript inline n'est ajouté, afin de respecter la CSP.

### Amélioration progressive

Sans JavaScript, le bouton reste masqué et tous les liens restent visibles : la
navigation demeure utilisable.

`public/js/mobile-nav.js`, chargé avec `defer` depuis le layout, effectue ensuite :

- affichage du bouton et ajout de la classe `nav-enhanced` au header ;
- ouverture/fermeture par clic ;
- synchronisation de `aria-expanded`, du libellé accessible et de la classe
  `navbar-mobile-open` ;
- fermeture avec Échap, puis retour du focus sur le bouton ;
- fermeture lors d'un clic hors du header ;
- fermeture après activation d'un lien de navigation ;
- remise à zéro lors du retour à une largeur supérieure à 600 px.

### Présentation

À `max-width: 600px` :

- header en grille `44px / 1fr / 44px`, hauteur visuelle compacte ;
- marque centrée dans la colonne centrale ;
- burger de 44 × 44 px à droite ;
- navigation masquée uniquement lorsque `nav-enhanced` est présente ;
- panneau ouvert sur toute la largeur, avec liens et bouton de déconnexion
  centrés et hauts d'au moins 44 px ;
- aucun blocage du scroll de page et aucune superposition plein écran.

Au-dessus de 600 px, le bouton est absent et la navigation actuelle reste
affichée horizontalement. Le desktop ne change pas visuellement.

## 4. Composition des pages à 320 et 375 px

### Conteneurs et typographie

- contenu principal centré avec 16 px de marge intérieure ;
- largeur utile de 100 %, sans largeur minimale cachée ;
- titres de page centrés, taille fluide bornée avec `clamp()` ;
- hauteur de ligne et longueurs de texte conservées pour la lisibilité ;
- cartes principales limitées à la largeur disponible, avec 18 à 20 px de
  padding selon leur densité.

### Actions

- `.page-header` passe en colonne et centre son titre et son action ;
- actions de dashboard, bascules de vue et actions de signature empilées ;
- boutons principaux et secondaires de ces zones : largeur 100 %, maximum
  320 px, texte centré ;
- formulaires inline de ces zones prennent la largeur de leur bouton ;
- pagination centrée et capable de revenir à la ligne.

### Formulaires et cartes

- formulaires centrés dans la page, champs toujours larges de 100 % ;
- labels et messages d'erreur alignés à gauche ;
- hero, cartes d'annonce, candidature, statistiques, graphiques et purge sur
  une seule colonne ;
- badges et groupes d'actions autorisés à revenir à la ligne ;
- carte Leaflet moins haute sur mobile afin de garder les filtres visibles.

### Tableaux et données longues

- chaque tableau large est placé dans `.table-scroll` ;
- le défilement horizontal reste interne au tableau et ne déplace jamais toute
  la page ;
- une indication de défilement reste naturelle via la barre native, sans texte
  décoratif ajouté ;
- les empreintes, emails et autres chaînes longues utilisent
  `overflow-wrap: anywhere` quand elles sont présentées hors tableau.

## 5. Palette et composants

La refonte ne crée pas une nouvelle charte. Elle réutilise les couleurs déjà
auditées pour le contraste :

- fond : `#f4f6f8` ;
- surface : `#ffffff` ;
- texte : `#1f2933` ;
- texte secondaire : `#5b6470` ;
- action : `#2563eb` ;
- action active : `#1d4ed8`.

La police système actuelle est conservée : aucun téléchargement externe et
aucune modification de la CSP. Les rayons de 8 px et les bordures existantes
restent la grammaire commune.

## 6. Accessibilité et erreurs

- cible tactile du burger et des liens : 44 px minimum ;
- focus visible conservé sur le burger, les liens et les boutons ;
- état du menu exposé par `aria-expanded` ;
- Échap ferme le panneau et restaure le focus ;
- avec JavaScript indisponible ou en erreur, les liens restent visibles ;
- aucune animation obligatoire pour comprendre l'état ;
- `prefers-reduced-motion: reduce` supprime la transition du burger/panneau ;
- le lien d'évitement reste le premier élément atteignable au clavier.

## 7. Fichiers prévus

- modifier `views/partials/nav.twig` : bouton, identifiant de navigation ;
- modifier `views/layouts/base.twig` : chargement de `mobile-nav.js` ;
- créer `public/js/mobile-nav.js` : comportement accessible ;
- modifier `public/css/style.css` : header et composition mobile ;
- conserver les wrappers `.table-scroll` ajoutés dans
  `views/dashboard/listings.twig` et `views/admin/schools.twig` ;
- compléter `test/ameliorations.cjs` avant l'implémentation ;
- régénérer `docs/jury/captures/r320`, `r375` et `r768` ;
- actualiser `docs/jury/conformite.md`, l'audit et le checkpoint.

## 8. Critères d'acceptation

1. Le desktop supérieur à 600 px conserve la navigation et les proportions
   actuelles.
2. À 320 et 375 px, le mot-symbole est centré et le burger est visible à droite.
3. Le menu est fermé au chargement avec JavaScript, mais reste utilisable si le
   script ne se charge pas.
4. Clic, Échap, clic extérieur et activation d'un lien ferment correctement le
   menu ; `aria-expanded` reste synchronisé.
5. Les 15 pages jury ne présentent aucun débordement global aux largeurs
   320/375/768/1440 avec le calcul basé sur le viewport visuel.
6. Les 45 captures responsive ont exactement la largeur de leur dossier et sont
   visuellement contrôlées, notamment accueil, annonces, suivi, dashboard,
   contrat et admin à 320/375.
7. Aucun texte, bouton ou carte n'est collé au bord ; les actions structurantes
   sont centrées et les formulaires restent faciles à parcourir.
8. `npm test`, `npx prisma validate`, W3C et axe restent verts après
   régénération des preuves.
9. La checklist clavier documentée est rejouée sur le burger et les principaux
   parcours mobiles.

## 9. Hors périmètre

- refonte de la version desktop ;
- nouvelle identité, nouvelle police ou nouvelles illustrations ;
- navigation fixe, panneau plein écran ou barre de navigation basse ;
- changement des parcours métier ou des textes fonctionnels ;
- ajout d'une bibliothèque front ou d'une dépendance JavaScript.
