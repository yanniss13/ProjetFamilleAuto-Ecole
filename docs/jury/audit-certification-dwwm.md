# Audit de préparation à la certification DWWM

- Date de l'audit : 2026-07-10 (mis à jour après intégration des documents
  historiques, puis après la livraison du chantier « consolidation du dossier »)
- Projet : MoniteurConnect
- Source : `Checklist_certification_DWWM.xlsx.zip`, feuilles « Dossier Projet » et
  « Vérification Application » transmises par l'utilisateur.

## Légende

- **VALIDÉ** : le dépôt contient une implémentation et des preuves identifiables.
- **À RENFORCER** : le fond existe, mais la preuve destinée au jury est partielle,
  dispersée, obsolète ou non vérifiée visuellement.
- **MANQUANT** : aucune preuve exploitable n'a été trouvée dans le dépôt.
- Un critère facultatif est signalé comme tel ; il ne doit pas détourner du traitement
  des critères obligatoires.

## Synthèse

Sur les 33 critères relevés dans la checklist (après le chantier
« consolidation du dossier » du 2026-07-10) :

- **19 sont validés** par le code, les tests ou les documents présents ;
- **12 sont à renforcer** pour devenir démontrables devant le jury ;
- **2 sont manquants** (validation W3C, veille technique anglophone).

Le produit est plus avancé que son dossier. Le principal risque n'est pas l'absence de
fonctionnalités : ce sont les preuves obligatoires ou attendues qui manquent. Le
`README.md` et `docs/DESIGN.md` décrivent encore un « squelette », alors que les lots A
à L sont livrés. Cette contradiction doit être corrigée avant la soutenance.

Fait au 2026-07-10 (chantier « consolidation du dossier ») : maquettes
préservées et écarts expliqués, diagramme BDD v2 (8 modèles), résumé, besoin
v2 et matrice de compétences livrés sous `docs/jury/`.

Priorités restantes :

1. produire une preuve de validation **W3C** ;
2. vérifier réellement le responsive et l'accessibilité (réutiliser
   `scripts/captures-jury.js --largeur=320/375/768`) ;
3. actualiser `README.md` et `docs/DESIGN.md` (toujours au statut « squelette ») ;
4. documenter sauvegarde et restauration de la base ;
5. préparer une veille sécurité et une veille technique fondée sur des sources en
   anglais ;
6. écrire le script de soutenance (35 min, démo 11 min).

L'inventaire et les écarts des sources de juin sont détaillés dans
[`inventaire-documents-historiques.md`](inventaire-documents-historiques.md).

## 1. Audit du dossier projet

| Statut | Critère de la checklist | Constat et preuves dans le dépôt | Action nécessaire |
|---|---|---|---|
| VALIDÉ | Résumé du projet en français | [`resume-projet.md`](resume-projet.md) (2026-07-10) : problème, acteurs, solution, valeur, périmètre livré lot par lot, stack. | Le relire avant la soutenance ; `README.md` et `docs/DESIGN.md` restent à actualiser (chantier séparé). |
| VALIDÉ | Cahier des charges / expression du besoin | [`expression-du-besoin-v2.md`](expression-du-besoin-v2.md) : besoin, objectifs, contraintes, critères d'acceptation adossés aux tests, hors-périmètre, chronologie v1 → v2. | Présenter la chronologie (v1 intacte, v2 datée) comme preuve de méthode. |
| VALIDÉ | Liste des compétences | [`competences-dwwm.md`](competences-dwwm.md) : matrice des 8 compétences REAC RNCP37674 (libellés vérifiés) avec réalisations et preuves. | Assumer à l'oral les couvertures partielles (NoSQL, déploiement) telles que documentées. |
| À RENFORCER | Découpage fonctionnel avec descriptions (facultatif) | Les lots et l'architecture `routes → contrôleurs → services → vues` donnent un découpage réel, mais pas une vue fonctionnelle destinée au jury. | Ajouter un schéma simple des trois parcours : candidat, auto-école et administrateur. |
| VALIDÉ | Maquette (obligatoire) | `docs/historique/2026-06/wireframes/` contient 11 écrans HTML navigables, un sommaire, 11 exports PNG associés et une planche SVG datés du 23 juin. Ils constituent une vraie maquette basse fidélité du MVP initial. | Ne pas écraser ces originaux. Les présenter comme v1 et documenter les écarts avec les lots livrés ensuite. |
| À RENFORCER | Charte graphique (facultative) | Les couleurs, espacements et composants sont centralisés dans `public/css/style.css`, sans document de charte. | Extraire une page de charte : palette, typographie, boutons, cartes, badges, messages et règles d'accessibilité. |
| À RENFORCER | Description de la BDD, création, restauration et comparaison | `prisma/schema.prisma`, 13 migrations, `.env.example` et les commandes Prisma prouvent la création et l'évolution. Il n'existe pas de procédure de sauvegarde/restauration ni de comparaison argumentée SQLite/PostgreSQL. | Documenter création, migration, seed, sauvegarde et restauration ; justifier SQLite en développement et PostgreSQL en production. |
| VALIDÉ | Diagramme de base de données | [`diagrammes/bdd-v2.svg`](diagrammes/bdd-v2.svg) + PNG (8 modèles, colonnes réelles, cardinalités, cascades) et lecture guidée dans [`base-de-donnees.md`](base-de-donnees.md) ; le MCD/MLD v1 reste la preuve initiale. | Montrer v1 puis v2 côte à côte pour illustrer l'évolution 4 → 8. |
| À RENFORCER | Choix des technologies | La stack est listée dans `README.md`, `docs/DESIGN.md` et `package.json`. Les compromis et alternatives sont peu explicités. | Justifier Express/Twig/Prisma, le rendu serveur, les sessions, SQLite/PostgreSQL et les bibliothèques principales. |
| À RENFORCER | Description des environnements | `.env.example` distingue développement et production ; `src/app.js` adapte proxy et cookie sécurisé. Aucun environnement de préproduction/production n'est démontré. | Décrire poste de développement, environnement de test et cible de production, variables, secrets, HTTPS, stockage et SMTP. |
| VALIDÉ | Description de la méthodologie de travail | `AGENTS.md` impose TDD et le cycle spécification → plan → implémentation. `docs/superpowers/{specs,plans}` et l'historique Git matérialisent cette méthode. | En faire une diapositive avec un exemple de lot et son test écrit en premier. |
| À RENFORCER | Extrait de code source documenté | Le code est largement commenté, mais aucun extrait n'est sélectionné et expliqué pour le jury. | Retenir le flux de signature électronique : validation d'image, génération PDF, horodatages, SHA-256, contre-signature et invalidation. |
| VALIDÉ | Jeu de données d'entrée / fixtures | `scripts/seed-demo.js` génère un jeu riche et relançable ; les 15 fichiers de test créent des fixtures isolées par horodatage. | Montrer la commande `npm run seed:demo` et une fixture courte dans le focus technique. |
| À RENFORCER | Données de sortie | L'application produit pages, statuts, emails et PDF signés avec empreintes. Les sorties ne sont pas regroupées dans le dossier. | Préparer captures d'écran, exemple de PDF signé, email Mailpit et avant/après en base. |
| À RENFORCER | Veille sécurité | Le produit applique Helmet/CSP, CSRF, bcrypt, rate limiting, validation, contrôle des magic bytes, stockage privé et purge RGPD. Il manque un document de veille daté avec sources et décisions. | Créer une fiche de veille : menace, source, impact, décision appliquée et preuve dans le code. |
| MANQUANT | Veille technique avec sources en anglais | Aucun journal de veille technique ni source anglophone n'a été trouvé. | Constituer une courte veille avec documentation officielle anglophone de Node.js, Express, Prisma et Helmet ; rédiger la synthèse en français. |

## 2. Audit de l'application

| Statut | Critère de la checklist | Constat et preuves dans le dépôt | Action nécessaire |
|---|---|---|---|
| VALIDÉ | Front et back, API facultative | Front SSR Twig + JavaScript dédié ; back Express structuré ; relais JSON `/api/siret/:siret` et `/api/adresse`. | Montrer un flux navigateur → route → contrôleur → service → Prisma/API externe. |
| À RENFORCER | POO (facultatif) | L'application privilégie des modules fonctionnels CommonJS. `PrismaSessionStore extends Store` constitue un exemple réel de classe et d'héritage. | Expliquer ce choix sans prétendre que toute l'application est orientée objet ; ne pas refactoriser artificiellement pour ce critère facultatif. |
| VALIDÉ | Contraintes d'intégrité de la base | Clés primaires, étrangères, unicités, index, relations 1-N/1-1 et cascades sont définis dans `prisma/schema.prisma` et les migrations. | Illustrer trois contraintes : SIRET unique, contrat unique par candidature et suppression en cascade. |
| VALIDÉ | Code source documenté | Les modules sensibles expliquent le pourquoi : CSRF multipart, uploads, sessions, services externes et purge. | Choisir quelques commentaires utiles plutôt qu'afficher de longs fichiers. |
| VALIDÉ | Noms de variables et fonctions explicites | Les noms comme `findOwnedById`, `verifyAfterUpload`, `notifyNewListing` et `destroyForSchool` décrivent leur responsabilité. | Citer deux exemples pendant le focus code. |
| VALIDÉ | Nommage uniforme | Modèles et code technique en anglais, messages et vues en français, modules rangés par rôle. | Expliquer cette convention dans le dossier. |
| VALIDÉ | Refactorisation et réutilisabilité | Services dédiés, validateurs partagés, pagination commune, layout email, stockage et utilitaires évitent les duplications ; une revue de code est documentée dans `AGENTS.md`. | Utiliser un exemple avant/après issu de la revue. |
| VALIDÉ | Utilisation de modules | Le dépôt sépare routes, contrôleurs, services, validateurs, middlewares, vues et utilitaires. | Afficher l'arborescence et les dépendances d'un parcours. |
| VALIDÉ | Gestion des exceptions | Les contrôleurs propagent les erreurs à Express ; pages 403/404/500/CSRF ; services externes, mailer et compteurs non critiques sont non bloquants ; arrêt propre du serveur. | Démontrer une erreur utilisateur et expliquer la différence avec une erreur technique. |
| VALIDÉ | Contrôle de saisie des formulaires | Six validateurs serveur contrôlent présence, format, listes autorisées et longueurs. Les uploads vérifient taille, mimetype et magic bytes. | Montrer une saisie invalide puis le validateur correspondant. |
| VALIDÉ | Mécanisme d'authentification | Comptes auto-écoles et admins, bcrypt, vérification email, reset à jeton haché, régénération de session et sessions persistantes Prisma. | Expliquer pourquoi les sessions HTTP conviennent mieux ici qu'un JWT. |
| VALIDÉ | Politique de droits d'accès | Visiteur/candidat, école et admin ont des espaces distincts. `requireAuth`, `requireAdmin`, `loadSchool`, `loadAdmin` et le scoping `schoolId` protègent les données. | Montrer le test où une école reçoit 404 sur les documents d'une autre école. |
| À RENFORCER | Interfaces responsives | Les grilles utilisent `auto-fit`, les formulaires sont fluides et plusieurs actions utilisent `flex-wrap`. Il n'y a pas de stratégie mobile complète ; la navigation et certains tableaux restent à contrôler. | Tester 320/375/768 px, corriger les débordements, puis conserver des captures desktop/mobile. |
| VALIDÉ | Cohérence entre maquette initiale et application finale | [`comparaison-maquettes.md`](comparaison-maquettes.md) : 11 écrans v1 comparés à leurs captures 1440 px ([`captures/`](captures/)), 4 écrans nés des lots E–L, 7 écarts justifiés. | Réutiliser `scripts/captures-jury.js --largeur=` pour les captures responsive du chantier « conformité visible ». |
| À RENFORCER | Cohérence entre spécifications et application finale | Les spécifications et plans par lot correspondent au code et aux tests, mais `README.md` et `docs/DESIGN.md` ne reflètent pas les lots livrés. | Actualiser les documents de référence et produire une matrice exigence → route/test/démonstration. |
| MANQUANT | Validation W3C | Aucune preuve de passage au validateur W3C n'a été trouvée. | Valider les principales pages HTML rendues, corriger les erreurs, conserver date, URL/page et résultat. |
| À RENFORCER | Validateur d'accessibilité (facultatif) | Présence d'un lien d'évitement, de `:focus-visible`, de labels, de régions `aria-live`, de rôles d'alerte et d'une réduction des animations. Aucun audit automatisé ou clavier n'est archivé. | Effectuer Lighthouse/axe ou équivalent, navigation clavier et contrôle de contraste ; consigner les résultats. |

## 3. Fonctionnalité significative recommandée

Le meilleur focus pour le jury est la **signature électronique du contrat**. Elle relie
le front, le back, la base, les fichiers privés, la sécurité et une sortie PDF visible.

### Données d'entrée

- candidature acceptée et jeton de suivi opaque ;
- champs contractuels validés côté serveur ;
- signature école puis signature candidat, dessinées ou importées ;
- consentement explicite du candidat.

### Traitement à expliquer

1. validation de la candidature possédée par l'école ;
2. validation des données du contrat ;
3. validation binaire de l'image de signature et limite de taille ;
4. génération asynchrone du PDF proposé ;
5. calcul de l'empreinte SHA-256 et stockage de l'horodatage ;
6. invitation du candidat par email ;
7. contre-signature via le jeton de suivi ;
8. génération du PDF final avec les deux signatures et une nouvelle empreinte ;
9. invalidation des signatures si le contrat est réédité.

### Données de sortie

- chemins privés des signatures et PDF ;
- horodatages des deux signatures ;
- empreintes du PDF proposé et du PDF final ;
- PDF final téléchargeable et envoyé par email ;
- état signé visible dans le suivi candidat et l'espace école.

Preuves principales : `src/controllers/signatureController.js`,
`src/services/signatureImage.js`, `src/services/contractPdf.js`,
`src/services/contractService.js`, `public/js/signature-pad.js`,
`test/lot-g.cjs` et le dossier vitrine de `scripts/seed-demo.js`.

## 4. Déroulé conseillé pour les 35 minutes

| Temps | Contenu | Critères couverts |
|---|---|---|
| 0–3 min | Problème, acteurs, besoin et proposition de valeur | Résumé, expression du besoin |
| 3–6 min | Compétences, découpage fonctionnel, maquettes et charte | Spécifications fonctionnelles, cohérence visuelle |
| 6–10 min | Architecture, technologies, environnements et méthode TDD | Spécifications techniques, méthodologie, modules |
| 10–14 min | Diagramme BDD, contraintes, migrations et restauration | Base de données, intégrité |
| 14–25 min | Démonstration scénarisée candidat → école → signature → admin | Front/back, validation, authentification, droits, responsive |
| 25–31 min | Focus code sur la signature électronique | Code documenté, fixtures, entrées et sorties, exceptions |
| 31–34 min | Sécurité, tests, W3C, accessibilité et veille | Bonnes pratiques, sécurité, veille |
| 34–35 min | Limites, passage en production et conclusion | Prise de recul |

La démonstration doit rester autour de **11 minutes**. Le seed permet d'entrer directement
dans des états intéressants sans effectuer chaque saisie en direct.

## 5. Feuille de route issue de l'audit

### Priorité 0 — critères obligatoires et contradictions documentaires

- [ ] Actualiser `README.md` et `docs/DESIGN.md` ;
- [x] versionner les documents historiques sans écraser les maquettes initiales ;
- [x] créer le résumé, le cahier des charges actuel et la liste des compétences ;
- [x] identifier et contrôler les maquettes initiales obligatoires ;
- [x] produire la version actuelle du diagramme de base de données ;
- [ ] documenter création, migration, sauvegarde et restauration de la base
  (création/migration/seed couvertes par `base-de-donnees.md` ; reste
  sauvegarde/restauration).

### Priorité 1 — preuves de conformité

- [ ] valider les pages principales avec W3C ;
- [ ] contrôler le responsive à 320, 375, 768 et 1440 px ;
- [ ] effectuer un audit accessibilité automatisé et clavier ;
- [x] produire le tableau de comparaison maquettes v1 / application finale ;
- [ ] remettre à jour la matrice spécifications → application → tests.

### Priorité 2 — soutenance et démonstration

- [ ] écrire le script oral chronométré ;
- [ ] préparer le focus code de six minutes sur la signature ;
- [ ] créer une fiche de veille sécurité ;
- [ ] créer une veille technique avec sources officielles anglophones ;
- [ ] corriger la configuration Mailpit : ne passer `auth` à Nodemailer que lorsque
  `SMTP_USER` est défini ;
- [ ] préparer les onglets, comptes, URLs et le scénario de secours ;
- [ ] actualiser le seed juste avant chaque répétition avec `npm run seed:demo`.

## 6. Limites de cet audit

- Le terminal de cette session n'exposait pas Node/npm : la suite `npm test` n'a pas
  été relancée. Le dépôt contient **15 fichiers de test et environ 438 assertions**, et
  `AGENTS.md` indique que la suite était validée lors de la dernière passation.
- Aucun navigateur contrôlable n'était disponible : le responsive et l'accessibilité
  ont été évalués sur le HTML/CSS, pas sur un rendu réel.
- Le validateur W3C et un validateur d'accessibilité n'ont pas été exécutés.
- Les fichiers personnels non suivis présents à la racine n'ont pas été ouverts ni
  modifiés.
- Les PDF historiques ont été contrôlés par extraction de texte et via leurs exports
  PNG/SVG équivalents. Poppler n'était pas disponible pour rendre directement les PDF.

Ces limites deviennent les premières vérifications à exécuter dans une session disposant
de Node et d'un navigateur.
