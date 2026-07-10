# Consolidation du dossier jury (design)

Date : 2026-07-10
Statut : validé, prêt pour plan d'implémentation.

## Contexte

L'audit DWWM du 2026-07-10 (`docs/jury/audit-certification-dwwm.md`) conclut que
le produit est plus avancé que son dossier : 14 critères validés, 16 à renforcer,
3 manquants. L'utilisateur a choisi de lancer le chantier « consolidation du
dossier » en premier. Ce chantier solde les cinq actions du checkpoint de
`docs/jury/README.md` : résumé du projet, expression du besoin v2, liste des
compétences DWWM (critère MANQUANT), comparaison maquettes v1 / application
finale et diagramme de base de données actuel (8 modèles au lieu des 4
historiques).

Chantier documentaire : **aucun code métier n'est modifié**. Seul ajout hors
documentation : un script de captures d'écran réutilisable.

## Décisions validées

1. **Périmètre** : les 5 livrables du checkpoint uniquement. La mise à jour de
   `README.md`/`docs/DESIGN.md` et la documentation
   sauvegarde/restauration de la base restent des chantiers séparés.
2. **Structure** : un fichier par livrable sous `docs/jury/`, le README jury
   reste l'index. Pas de dossier-projet monolithique à ce stade.
3. **Compétences** : matrice fondée sur le REAC officiel RNCP37674, libellés
   vérifiés en ligne le 2026-07-10 (source :
   https://www.francecompetences.fr/recherche/rncp/37674/).
4. **Diagramme BDD v2** : SVG dessiné dans le style graphique des
   `spec-assets/` historiques, converti en PNG. Pas de Mermaid.
5. **Captures** : prises dès ce chantier, à 1440 px, via Edge headless piloté
   en CDP — aucune dépendance npm nouvelle (WebSocket natif de Node 22).
6. **Chronologie assumée** : les documents de juin restent intacts comme v1 ;
   chaque livrable v2 date ses sources et explique les écarts (règle de
   `docs/jury/inventaire-documents-historiques.md`).

## Branche et conventions

- Branche dédiée : `jury-consolidation-dossier`, créée depuis `main`.
- Tout en français ; commits préfixés `Jury: ...`.
- `npm test` avant chaque commit (convention `AGENTS.md`).
- Ne jamais commiter les fichiers personnels racine (`contexte.md`, `*.xlsx`).

## Livrables

### 1. `docs/jury/resume-projet.md`

Résumé d'une page, au présent, cohérent avec le code actuel :

- problème et acteurs (auto-écoles, moniteurs indépendants, administrateur) ;
- solution : job board métier, candidature sans compte moniteur ;
- proposition de valeur ;
- périmètre livré : MVP + lots A à L (une ligne par lot, pas de détail) ;
- stack en une ligne (Node/Express 5, Twig, Prisma, SQLite→PostgreSQL, tests).

### 2. `docs/jury/expression-du-besoin-v2.md`

Cahier des charges v2 :

- chronologie explicite : v1 du 22/06 (`docs/historique/2026-06/CAHIER-DES-CHARGES.md`,
  non modifiée) → itérations lots A–L → présente v2 ;
- besoin, objectifs, acteurs et cas d'usage ;
- contraintes : sécurité (OWASP de base), RGPD (purge, minimisation),
  accessibilité, aucun service payant ;
- critères d'acceptation mesurables (adossés aux tests existants) ;
- hors-périmètre assumé (comptes moniteurs, paiement, messagerie interne...) ;
- corrections de la v1 signalées (« chiffrés » → « hachés », déploiement
  non couvert).

### 3. `docs/jury/competences-dwwm.md`

Matrice « compétence → réalisation MoniteurConnect → preuves », qui solde le
critère MANQUANT « Liste des compétences ». Les 8 compétences du REAC
RNCP37674 (libellés verbatim, vérifiés le 2026-07-10) :

Bloc 1 — « Développer la partie front-end d'une application web ou web mobile
sécurisée » :

1. Installer et configurer son environnement de travail en fonction du projet
   web ou web mobile ;
2. Maquetter des interfaces utilisateur web ou web mobile ;
3. Réaliser des interfaces utilisateur statiques web ou web mobile ;
4. Développer la partie dynamique des interfaces utilisateur web ou web mobile.

Bloc 2 — « Développer la partie back-end d'une application web ou web mobile
sécurisée » :

5. Mettre en place une base de données relationnelle ;
6. Développer des composants d'accès aux données SQL et NoSQL ;
7. Développer des composants métier coté serveur ;
8. Documenter le déploiement d'une application dynamique web ou web mobile.

Chaque ligne de la matrice donne : la réalisation concrète dans le projet, 2 à
4 preuves précises (fichier source, fichier de test, document, moment de la
démo). Les compétences partiellement couvertes (NoSQL, déploiement) sont
traitées honnêtement : dire ce qui existe (justification SQLite/PostgreSQL,
`.env.example`, fail-fast) et ce qui sera consolidé dans un chantier ultérieur,
plutôt que de sur-vendre.

### 4. `docs/jury/comparaison-maquettes.md` + `docs/jury/captures/`

- Tableau principal, une ligne par écran maquetté (11 maquettes de
  `docs/historique/2026-06/wireframes/`) : maquette v1 (lien vers le PNG
  historique) / écran actuel (capture) / écarts justifiés.
- Section « écrans nés après les maquettes » : vue carte, suivi candidat,
  signature du contrat, statistiques, administration, alertes — avec capture et
  justification (lots E–L). Captures nommées `carte.png`, `suivi.png`,
  `signature.png`, `stats-ecole.png`, `admin.png`, `alertes.png`.
- Section « prévu mais non réalisé sous cette forme », reprise de l'inventaire
  (réouverture d'annonce, filtre par statut...), avec justification.
- Captures : PNG 1440 px sous `docs/jury/captures/`, nommées `<ecran>.png`
  (mêmes radicaux que les wireframes : `accueil.png`, `annonces.png`...).

### 5. `docs/jury/base-de-donnees.md` + `docs/jury/diagrammes/bdd-v2.{svg,png}`

- SVG des 8 modèles Prisma actuels (`School`, `Listing`, `Application`,
  `Contract`, `Session`, `Admin`, `Alert`, `PurgeRun`) : attributs principaux,
  clés, unicités, relations 1-N et 1-1, cascades. Style graphique aligné sur
  `docs/historique/2026-06/spec-assets/mcd.svg` (chronologie visuelle v1 → v2).
- PNG exporté du SVG (rendu Edge headless, capture de la page SVG).
- `base-de-donnees.md` : lecture guidée du diagramme, évolution 4 → 8 entités
  (quel lot a apporté quoi), trois contraintes d'intégrité à citer au jury
  (SIRET unique, contrat 1-1 par candidature, suppressions en cascade), renvoi
  vers le MCD/MLD v1 et vers `prisma/schema.prisma` comme source de vérité.

### 6. Script de captures : `scripts/captures-jury.js`

- Lance Edge headless (`--headless --remote-debugging-port`) et le pilote en
  CDP via le WebSocket natif de Node 22 : navigation, remplissage du formulaire
  de connexion (comptes du seed : `ecole.vitrine@demo.moniteur-connect.example`
  / `demo1234`, `admin@demo.moniteur-connect.example` / `admin1234`),
  `Page.captureScreenshot`.
- Prérequis d'exécution : `npm run seed:demo` puis serveur local démarré (port
  dédié, hors plage de tests 4055-4070).
- Liste des pages déclarée en tête de script (URL, nom de fichier, session
  requise : aucune / école / admin) ; largeur paramétrable (`--largeur=1440`
  par défaut) pour être **réutilisé tel quel au chantier « conformité
  visible »** (320/375/768 px).
- Fail-soft : une page qui échoue est signalée et n'interrompt pas les autres ;
  code de sortie non nul si au moins une capture manque.
- Le script ne touche ni la base ni le code serveur : lecture seule via HTTP.

### 7. Mises à jour de cohérence

- `docs/jury/README.md` : liens vers les 5 livrables, nouveau checkpoint.
- `docs/jury/audit-certification-dwwm.md` : cocher les cases de la feuille de
  route soldées par ce chantier (résumé/besoin/compétences, diagramme BDD,
  tableau de comparaison) ; passer à VALIDÉ les critères « Résumé du projet »,
  « Cahier des charges », « Liste des compétences » (MANQUANT → VALIDÉ),
  « Diagramme de base de données » et « Cohérence entre maquette initiale et
  application finale », avec le constat mis à jour.
- `AGENTS.md` : mettre à jour le paragraphe « Prochain travail ».

## Vérifications (pas de TDD : livrables documentaires)

- Liens Markdown relatifs valides dans tous les documents créés/modifiés
  (contrôle scripté, comme au rangement du 2026-07-10).
- Captures : chaque fichier attendu existe et fait plus de 10 Ko.
- SVG : bien formé (parse XML), PNG non vide.
- Libellés REAC : conformes à la source citée (URL + date dans le document).
- `npm test` (438 assertions) avant chaque commit.
- `git status` final : aucun fichier personnel stagé.

## Hors périmètre (chantiers ultérieurs)

- Mise à jour de `README.md` et `docs/DESIGN.md`.
- Documentation création/sauvegarde/restauration BDD et comparaison
  SQLite/PostgreSQL détaillée.
- Validation W3C, tests responsive et audit accessibilité (chantier
  « conformité visible » — le script de captures est déjà prêt pour lui).
- Script de soutenance 35 min et focus code signature.
- Veille sécurité et veille technique anglophone.
