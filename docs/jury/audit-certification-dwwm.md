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

Sur les 33 critères relevés dans la checklist (après les trois chantiers du
2026-07-10 : « consolidation du dossier », « conformité visible » et
« script de soutenance ») :

- **29 sont validés** par le code, les tests ou les documents présents ;
- **4 sont à renforcer** — deux critères facultatifs (découpage fonctionnel
  destiné au jury, charte graphique formalisée) et deux compléments de
  production (sauvegarde/restauration de la base, environnement de
  production démontré) ;
- **0 manquant.**

Au 2026-07-10 au soir, le dossier a rattrapé le produit : les preuves
obligatoires existent, sont datées et re-jouables. La contradiction
documentaire initiale (`README.md` et `docs/DESIGN.md` au statut
« squelette ») est corrigée : README réécrit sur l'état réel, DESIGN classé
avec la conception de juin. Le matériel de soutenance (deck 35 min, démo
11 min, 26 Q/R) est sous `docs/jury/soutenance/`.

Fait au 2026-07-10 (trois chantiers) : maquettes préservées et écarts
expliqués, diagramme BDD v2, résumé, besoin v2, matrice de compétences ;
preuves W3C/responsive/accessibilité ([`conformite.md`](conformite.md)) ;
deck 35 min, démo 11 min, 26 Q/R ([`soutenance/`](soutenance/)), veilles
sécurité et technique anglophone, README réécrit, DESIGN classé, micro-fix
Mailpit.

Priorités restantes (côté utilisateur, avant la soutenance) :

1. répéter en chronométrant : deck (touche N pour les notes), démo
   (`soutenance/demo-11-minutes.md`), focus code ;
2. dérouler la checklist clavier manuelle de [`conformite.md`](conformite.md) ;
3. relancer `npm run seed:demo` avant chaque répétition (après le démarrage
   du serveur) ;
4. facultatif hors jury : documenter sauvegarde/restauration de la base
   (dernier gros reste avec l'hébergement de production).

L'inventaire et les écarts des sources de juin sont détaillés dans
[`inventaire-documents-historiques.md`](inventaire-documents-historiques.md).

## 1. Audit du dossier projet

| Statut | Critère de la checklist | Constat et preuves dans le dépôt | Action nécessaire |
|---|---|---|---|
| VALIDÉ | Résumé du projet en français | [`resume-projet.md`](resume-projet.md) (2026-07-10) : problème, acteurs, solution, valeur, périmètre livré lot par lot, stack. `README.md` réécrit et `DESIGN.md` classé en historique le même jour. | Le relire avant la soutenance. |
| VALIDÉ | Cahier des charges / expression du besoin | [`expression-du-besoin-v2.md`](expression-du-besoin-v2.md) : besoin, objectifs, contraintes, critères d'acceptation adossés aux tests, hors-périmètre, chronologie v1 → v2. | Présenter la chronologie (v1 intacte, v2 datée) comme preuve de méthode. |
| VALIDÉ | Liste des compétences | [`competences-dwwm.md`](competences-dwwm.md) : matrice des 8 compétences REAC RNCP37674 (libellés vérifiés) avec réalisations et preuves. | Assumer à l'oral les couvertures partielles (NoSQL, déploiement) telles que documentées. |
| À RENFORCER | Découpage fonctionnel avec descriptions (facultatif) | Les lots et l'architecture `routes → contrôleurs → services → vues` donnent un découpage réel, mais pas une vue fonctionnelle destinée au jury. | Ajouter un schéma simple des trois parcours : candidat, auto-école et administrateur. |
| VALIDÉ | Maquette (obligatoire) | `docs/historique/2026-06/wireframes/` contient 11 écrans HTML navigables, un sommaire, 11 exports PNG associés et une planche SVG datés du 23 juin. Ils constituent une vraie maquette basse fidélité du MVP initial. | Ne pas écraser ces originaux. Les présenter comme v1 et documenter les écarts avec les lots livrés ensuite. |
| À RENFORCER | Charte graphique (facultative) | Les couleurs, espacements et composants sont centralisés dans `public/css/style.css`, sans document de charte. | Extraire une page de charte : palette, typographie, boutons, cartes, badges, messages et règles d'accessibilité. |
| À RENFORCER | Description de la BDD, création, restauration et comparaison | `prisma/schema.prisma`, 13 migrations, `.env.example` et les commandes Prisma prouvent la création et l'évolution. Il n'existe pas de procédure de sauvegarde/restauration ni de comparaison argumentée SQLite/PostgreSQL. | Documenter création, migration, seed, sauvegarde et restauration ; justifier SQLite en développement et PostgreSQL en production. |
| VALIDÉ | Diagramme de base de données | [`diagrammes/bdd-v2.svg`](diagrammes/bdd-v2.svg) + PNG (8 modèles, colonnes réelles, cardinalités, cascades) et lecture guidée dans [`base-de-donnees.md`](base-de-donnees.md) ; le MCD/MLD v1 reste la preuve initiale. | Montrer v1 puis v2 côte à côte pour illustrer l'évolution 4 → 8. |
| VALIDÉ | Choix des technologies | Justifications et alternatives rejetées explicitées : diapositive « Technologies et pourquoi » du [deck](soutenance/soutenance.html), Q/R « Choix technologiques » ([`soutenance/questions-reponses.md`](soutenance/questions-reponses.md)) et [`veille-technique.md`](veille-technique.md). | Répéter les justifications à l'oral (framework front, JWT, SQLite). |
| À RENFORCER | Description des environnements | `.env.example` distingue développement et production ; `src/app.js` adapte proxy et cookie sécurisé. Aucun environnement de préproduction/production n'est démontré. | Décrire poste de développement, environnement de test et cible de production, variables, secrets, HTTPS, stockage et SMTP. |
| VALIDÉ | Description de la méthodologie de travail | `AGENTS.md` impose TDD et le cycle spécification → plan → implémentation. `docs/superpowers/{specs,plans}` et l'historique Git matérialisent cette méthode. | En faire une diapositive avec un exemple de lot et son test écrit en premier. |
| VALIDÉ | Extrait de code source documenté | Le focus code de 6 minutes est écrit : 4 diapositives du [deck](soutenance/soutenance.html) sur le flux de signature (validation d'image, PDF + SHA-256, contreseing + invalidation), avec les fichiers à ouvrir en séance. | Répéter le focus en chronométrant ; garder `signatureImage.js` ouvert dans l'éditeur. |
| VALIDÉ | Jeu de données d'entrée / fixtures | `scripts/seed-demo.js` génère un jeu riche et relançable ; les 15 fichiers de test créent des fixtures isolées par horodatage. | Montrer la commande `npm run seed:demo` et une fixture courte dans le focus technique. |
| VALIDÉ | Données de sortie | Sorties regroupées et montrables : 60 captures d'écran versionnées (`captures/`), PDF signé du dossier vitrine du seed, emails visibles dans Mailpit pendant la démo, journal de purge — le [déroulé de démo](soutenance/demo-11-minutes.md) les enchaîne. | Relancer `npm run seed:demo` avant chaque répétition. |
| VALIDÉ | Veille sécurité | [`veille-securite.md`](veille-securite.md) (2026-07-10) : 8 fiches « menace → source datée (OWASP Top 10 **2025**, cheat sheets) → impact → décision → preuve testée », méthode de veille explicitée. | Citer un exemple à l'oral (magic bytes ou Argon2id noté pour la production). |
| VALIDÉ | Veille technique avec sources en anglais | [`veille-technique.md`](veille-technique.md) (2026-07-10) : 4 sources officielles anglophones vérifiées (Node.js LTS, Express 5.2.1, Prisma 7.8.0, MDN), chaque relevé relié à une décision du dépôt, synthèse en français, niveau d'anglais explicité. | Mentionner un relevé concret à l'oral (le projet tourne sur une LTS). |

## 2. Audit de l'application

| Statut | Critère de la checklist | Constat et preuves dans le dépôt | Action nécessaire |
|---|---|---|---|
| VALIDÉ | Front et back, API facultative | Front SSR Twig + JavaScript dédié ; back Express structuré ; relais JSON `/api/siret/:siret` et `/api/adresse`. | Montrer un flux navigateur → route → contrôleur → service → Prisma/API externe. |
| VALIDÉ | POO (facultatif) | Choix architectural assumé et argumenté : modules fonctionnels à responsabilité unique, héritage réel là où il s'impose (`PrismaSessionStore extends Store`). Réponse préparée dans [`soutenance/questions-reponses.md`](soutenance/questions-reponses.md). | Ne pas survendre : dire « majoritairement non, et voici pourquoi ». |
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
| VALIDÉ | Interfaces responsives | Contrôlé le 2026-07-10 sur rendu réel : **0 débordement horizontal sur 15 pages × 4 largeurs** (320/375/768/1440), 45 captures archivées sous `captures/r{320,375,768}/` — voir [`conformite.md`](conformite.md). | Montrer 2-3 captures mobiles au jury ; re-jouer les contrôles avant la soutenance pour des preuves fraîches. |
| VALIDÉ | Cohérence entre maquette initiale et application finale | [`comparaison-maquettes.md`](comparaison-maquettes.md) : 11 écrans v1 comparés à leurs captures 1440 px ([`captures/`](captures/)), 4 écrans nés des lots E–L, 7 écarts justifiés. | Réutiliser `scripts/captures-jury.js --largeur=` pour les captures responsive du chantier « conformité visible ». |
| VALIDÉ | Cohérence entre spécifications et application finale | Les 30 spécifications/plans par lot correspondent au code et aux tests ; `README.md` réécrit sur l'état réel, `DESIGN.md` classé en v1 ; matrice exigence → test dans [`expression-du-besoin-v2.md`](expression-du-besoin-v2.md) (critères d'acceptation). | Montrer un exemple spec → plan → test → code si le jury creuse la méthode. |
| VALIDÉ | Validation W3C | Validateur Nu officiel le 2026-07-10 sur les 15 pages rendues : 3 erreurs corrigées puis **0 erreur et 0 avertissement partout** — méthode, dates et résultats dans [`conformite.md`](conformite.md), JSON bruts sous `conformite/`. | Citer la correction la plus parlante (label sur canvas) si la question vient. |
| VALIDÉ | Validateur d'accessibilité (facultatif) | Audit **axe-core** du 2026-07-10 : 2 violations serious corrigées (contraste `--color-muted`, `aria-label` des SVG) puis **0 violation tous niveaux sur les 15 pages** ; acquis déjà en place (lien d'évitement, `:focus-visible`, `aria-live`). | Dérouler la checklist clavier manuelle de [`conformite.md`](conformite.md) avant la soutenance ; assumer la limite du pad de signature (alternative : import de fichier). |

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

- [x] Actualiser `README.md` et `docs/DESIGN.md` ;
- [x] versionner les documents historiques sans écraser les maquettes initiales ;
- [x] créer le résumé, le cahier des charges actuel et la liste des compétences ;
- [x] identifier et contrôler les maquettes initiales obligatoires ;
- [x] produire la version actuelle du diagramme de base de données ;
- [ ] documenter création, migration, sauvegarde et restauration de la base
  (création/migration/seed couvertes par `base-de-donnees.md` ; reste
  sauvegarde/restauration).

### Priorité 1 — preuves de conformité

- [x] valider les pages principales avec W3C ;
- [x] contrôler le responsive à 320, 375, 768 et 1440 px ;
- [x] effectuer un audit accessibilité automatisé (le contrôle clavier manuel
  reste à dérouler avant la soutenance, checklist dans `conformite.md`) ;
- [x] produire le tableau de comparaison maquettes v1 / application finale ;
- [x] remettre à jour la matrice spécifications → application → tests
  (critères d'acceptation → tests dans `expression-du-besoin-v2.md`).

### Priorité 2 — soutenance et démonstration

- [x] écrire le script oral chronométré (deck `soutenance/soutenance.html`) ;
- [x] préparer le focus code de six minutes sur la signature (diapos 20-23) ;
- [x] créer une fiche de veille sécurité (`veille-securite.md`) ;
- [x] créer une veille technique avec sources officielles anglophones
  (`veille-technique.md`) ;
- [x] corriger la configuration Mailpit : ne passer `auth` à Nodemailer que lorsque
  `SMTP_USER` est défini (TDD, `test/ameliorations.cjs`) ;
- [x] préparer les onglets, comptes, URLs et le scénario de secours
  (`soutenance/demo-11-minutes.md`) ;
- [ ] actualiser le seed juste avant chaque répétition avec `npm run seed:demo`
  (action récurrente côté utilisateur — après le démarrage du serveur).

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
