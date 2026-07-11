# Compétences DWWM couvertes par MoniteurConnect

Titre professionnel **Développeur web et web mobile** (niveau 5), référentiel
**REAC RNCP37674**. Libellés des blocs et compétences vérifiés le 2026-07-10
sur https://www.francecompetences.fr/recherche/rncp/37674/ (titre valide du
01/09/2023 au 01/09/2028).

Pour chaque compétence : la réalisation concrète dans le projet, puis les
preuves à montrer (fichier, test, document, moment de la démonstration).

## Bloc 1 — « Développer la partie front-end d'une application web ou web mobile sécurisée »

### 1. Installer et configurer son environnement de travail en fonction du projet web ou web mobile

**Réalisation** : environnement Node.js reproductible, configuration par
variables d'environnement avec refus de démarrer si un secret manque,
migrations de schéma versionnées, méthode de travail documentée.

| Preuve | Où |
|---|---|
| Modèle d'environnement (dev/prod distingués) | `.env.example` |
| Fail-fast sur `SESSION_SECRET` au démarrage | `src/server.js` |
| Scripts outillés : dev, test, seed, purge, admin | `package.json` |
| 13 migrations Prisma versionnées | `prisma/migrations/` |
| Méthode TDD et conventions du dépôt | [`../../AGENTS.md`](../../AGENTS.md) |

### 2. Maquetter des interfaces utilisateur web ou web mobile

**Réalisation** : 11 écrans maquettés en HTML basse fidélité avant le
développement (23 juin), exports PNG et planche SVG, puis comparaison
argumentée maquette/réalisation pour le jury.

| Preuve | Où |
|---|---|
| Maquettes navigables v1 (originaux préservés) | [`../historique/2026-06/wireframes/`](../historique/2026-06/wireframes/index.html) |
| Exports PNG des 11 écrans | `../historique/2026-06/spec-assets/wf-*.png` |
| Comparaison v1 / application finale | [`comparaison-maquettes.md`](comparaison-maquettes.md) |

### 3. Réaliser des interfaces utilisateur statiques web ou web mobile

**Réalisation** : rendu serveur Twig (échappement automatique), feuille de
style unique aux composants réutilisés (cartes, badges, tuiles, messages),
sémantique et accessibilité de base.

| Preuve | Où |
|---|---|
| 30+ vues Twig par domaine | `views/` (layout : `views/layouts/base.twig`) |
| Styles : palette, grilles `auto-fit`, composants | `public/css/style.css` |
| Accessibilité : lien d'évitement, `:focus-visible`, `aria-live` | `views/layouts/base.twig`, `public/css/style.css` |
| Démo : parcours public complet | captures [`captures/`](captures/) |

### 4. Développer la partie dynamique des interfaces utilisateur web ou web mobile

**Réalisation** : JavaScript navigateur dédié par fonctionnalité, sous CSP
stricte (`script-src 'self'`, zéro script inline) : cartes Leaflet, pad de
signature avec import d'image, graphiques SVG construits en DOM,
autocomplétion débouncée, vérification SIRET en direct.

| Preuve | Où |
|---|---|
| Carte détail + carte de recherche | `public/js/listing-map.js`, `public/js/listings-map.js` |
| Pad de signature (dessin + import PNG/JPEG) | `public/js/signature-pad.js` |
| Graphiques SVG sans bibliothèque, anti-XSS | `public/js/dashboard-charts.js` + `test/lot-h.cjs` (« aucune insertion HTML ») |
| Autocomplétion d'adresse débouncée | `public/js/adresse-autocomplete.js` + `test/lot-l.cjs` |
| CSP stricte vérifiée par test | `test/smoke.cjs` (« en-tête Content-Security-Policy ») |

## Bloc 2 — « Développer la partie back-end d'une application web ou web mobile sécurisée »

### 5. Mettre en place une base de données relationnelle

**Réalisation** : schéma Prisma de 8 modèles, contraintes d'intégrité (clés
étrangères, unicités simples et composées, relation 1-1, cascades), évolution
par migrations. Le code Prisma est portable vers PostgreSQL, avec un historique
de migrations PostgreSQL distinct à préparer et tester.

| Preuve | Où |
|---|---|
| Schéma commenté (8 modèles) | `prisma/schema.prisma` |
| Diagramme v2 + lecture guidée | [`base-de-donnees.md`](base-de-donnees.md) |
| Évolution versionnée | `prisma/migrations/` (13 migrations) |
| Contraintes vérifiées par tests | `test/correctifs.cjs` (P2002), `test/lot-g.cjs` (1-1), `test/smoke.cjs` (cascades) |

### 6. Développer des composants d'accès aux données SQL et NoSQL

**Réalisation** : couche services dédiée (un module par domaine) au-dessus de
Prisma, requêtes scopées par `schoolId` (isolation entre écoles), pagination
mutualisée, recherche insensible à la casse portable SQLite/PostgreSQL.

**Honnêteté sur le NoSQL** : l'application n'utilise pas de base NoSQL en
production — les données (écoles, annonces, candidatures, contrats) sont
fortement relationnelles et exigent des contraintes d'intégrité. Les
structures non relationnelles assumées du projet sont les **caches mémoire
clé-valeur** des services externes (géocodage, SIRET, adresse) et le **JSON**
des sessions persistées ; ce choix est argumenté tel quel devant le jury.

| Preuve | Où |
|---|---|
| Services d'accès aux données | `src/services/` (`listingService`, `applicationService`, `statsService`...) |
| Isolation `schoolId` testée (404 croisé) | `test/smoke.cjs` (« École B ne peut pas... ») |
| Pagination commune | `test/lot-a.cjs`, `test/ameliorations-v2.cjs` |
| Caches clé-valeur TTL | `src/services/adresse.js` (10 min), `src/services/siret.js` (1 h), `src/services/geocoder.js` (24 h) |

### 7. Développer des composants métier coté serveur

**Réalisation** : logique métier en services testés — workflow de contrat et
signature électronique (validation d'image par magic bytes, PDF, horodatages,
empreintes SHA-256, invalidation à la ré-édition), purge RGPD planifiée et
journalisée, alertes en double opt-in, statistiques avec bucketing hebdomadaire.

| Preuve | Où |
|---|---|
| Signature : image, PDF, empreintes | `src/services/signatureImage.js`, `src/services/contractPdf.js` + `test/lot-g.cjs` (49 assertions) |
| Purge RGPD (délais, journal) | `src/services/purgeService.js` + `test/lot-j.cjs` |
| Alertes double opt-in, jamais bloquantes | `src/services/alertService.js` + `test/lot-i.cjs` |
| Statistiques (séries, entonnoir, taux) | `src/services/statsService.js` + `test/lot-h.cjs` |
| Focus démo recommandé : la signature (6 min) | [`audit-certification-dwwm.md`](audit-certification-dwwm.md), section 3 |

### 8. Documenter le déploiement d'une application dynamique web ou web mobile

**Réalisation — partiellement couverte, assumé** : la configuration
d'environnement est documentée (`.env.example`, distinction dev/prod dans
`src/app.js` : cookie `secure` et `trust proxy` en production) et la bascule
SQLite → PostgreSQL est décrite dans le schéma et
[`base-de-donnees.md`](base-de-donnees.md). La procédure de déploiement
complète (hébergement, HTTPS, SMTP, sauvegarde/restauration) est le prochain
chantier documentaire — feuille de route de
l'[audit](audit-certification-dwwm.md). Devant le jury : présenter ce qui
existe et le plan, sans survendre.

| Preuve | Où |
|---|---|
| Variables et secrets documentés | `.env.example`, `README.md` |
| Comportements spécifiques production | `src/app.js` (proxy, cookies `secure`) |
| Bascule base de données | `prisma/schema.prisma` (commentaire datasource), [`base-de-donnees.md`](base-de-donnees.md) |

## Synthèse pour la soutenance

Les compétences 1 à 7 s'appuient sur du code livré et testé (448 assertions) ;
la compétence 8 s'appuie sur une documentation partielle et un plan explicite.
Le déroulé de présentation qui couvre ces compétences minute par minute est
dans l'[audit, section 4](audit-certification-dwwm.md).
