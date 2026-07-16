# Préparation jury DWWM — point de reprise

Ce fichier est la **porte d'entrée pour Codex, Claude Code ou tout autre agent** qui
reprend la préparation de la soutenance. Lire d'abord `AGENTS.md`, puis ce document,
puis l'audit détaillé.

## Objectif courant

Préparer une présentation de **35 minutes**, suivie de **45 minutes de questions**, en
alignant MoniteurConnect sur la checklist de certification DWWM fournie par
l'utilisateur.

## Documents de référence

- Audit détaillé : [`audit-certification-dwwm.md`](audit-certification-dwwm.md)
- Inventaire historique :
  [`inventaire-documents-historiques.md`](inventaire-documents-historiques.md)
- **Dossier consolidé (2026-07-10)** :
  - Résumé du projet : [`resume-projet.md`](resume-projet.md)
  - Expression du besoin v2 : [`expression-du-besoin-v2.md`](expression-du-besoin-v2.md)
  - Compétences DWWM (REAC RNCP37674) : [`competences-dwwm.md`](competences-dwwm.md)
  - Comparaison maquettes v1 / finale : [`comparaison-maquettes.md`](comparaison-maquettes.md)
    (captures 1440 px sous [`captures/`](captures/))
  - Base de données v2 : [`base-de-donnees.md`](base-de-donnees.md)
    (diagramme [`diagrammes/bdd-v2.svg`](diagrammes/bdd-v2.svg))
  - Découpage fonctionnel : [`decoupage-fonctionnel.md`](decoupage-fonctionnel.md)
    (diagramme [`diagrammes/parcours-fonctionnels.svg`](diagrammes/parcours-fonctionnels.svg))
  - Charte graphique : [`charte-graphique.md`](charte-graphique.md)
  - Spécifications fonctionnelles et techniques v2 :
    [`specifications-v2.md`](specifications-v2.md)
  - Diagramme fonctionnel v2 :
    [`diagramme-fonctionnel-v2.md`](diagramme-fonctionnel-v2.md)
  - Cas d'utilisation v2 :
    [`diagrammes/cas-utilisation-v2.svg`](diagrammes/cas-utilisation-v2.svg)
  - Wireframes v2 (30 écrans/états conformes, livrés le 2026-07-11) :
    sommaire [`wireframes-v2/index.html`](wireframes-v2/index.html),
    matrice [`wireframes-v2/matrice-couverture.md`](wireframes-v2/matrice-couverture.md),
    planche [`wireframes-v2/wireframes-v2-planche.svg`](wireframes-v2/wireframes-v2-planche.svg),
    PDF 32 pages [`wireframes-v2/wireframes-v2.pdf`](wireframes-v2/wireframes-v2.pdf)
- **Dossier final PDF** : chaque Markdown du dossier jury a son équivalent
  sous [`pdf/`](pdf/) (18 fichiers, arborescence miroir, liens internes
  pointant vers les PDF). Régénération : `python scripts/pdf-jury.py`
  (après toute modification d'un `.md`).
- **Conformité (rejouée le 2026-07-11)** : [`conformite.md`](conformite.md) —
  passage final sur la version mobile livrée : W3C 0/0, axe 0 violation,
  débordement 0/60 avec viewport exact ; faux positif responsive documenté.
  JSON bruts sous [`conformite/`](conformite/).
- **Soutenance (2026-07-10)** :
  - Deck des 35 minutes : [`soutenance/soutenance.html`](soutenance/soutenance.html)
    (28 diapos — flèches pour naviguer, touche N pour les notes orateur) ;
  - Démo scénarisée : [`soutenance/demo-11-minutes.md`](soutenance/demo-11-minutes.md) ;
  - Questions/réponses : [`soutenance/questions-reponses.md`](soutenance/questions-reponses.md).
- **Veilles (2026-07-10)** : [`veille-securite.md`](veille-securite.md)
  (OWASP Top 10 2025, 8 fiches) et [`veille-technique.md`](veille-technique.md)
  (4 sources officielles anglophones).
- Conception initiale classée :
  [`../historique/2026-06/README.md`](../historique/2026-06/README.md)
- Spécification historique :
  [`../historique/2026-06/DESIGN.md`](../historique/2026-06/DESIGN.md)
- Spécifications et plans livrés : `docs/superpowers/{specs,plans}/`
- Guide d'exécution du dépôt : [`../../AGENTS.md`](../../AGENTS.md)
- Source externe transmise :
  `C:\Users\yanni\Downloads\Checklist_certification_DWWM.xlsx.zip`
  (le contenu utile est entièrement retranscrit dans l'audit).

## État actuel au 2026-07-16

- Dossier consolidé, deck 35 minutes, démo 11 minutes, 26 Q/R et deux veilles
  livrés ; focus technique : **signature électronique du contrat**.
- Audit : **32 validés / 1 à renforcer / 0 manquant**. Le seul critère à
  renforcer est l'environnement de production démontré.
- Modèle BDD v2 à 8 entités et procédures SQLite/PostgreSQL de
  création/migration/sauvegarde/restauration documentés.
- Lot M livré après la préparation initiale : suivi des candidatures en temps
  réel par SSE, avec rattrapage à la reconnexion et repli sans JavaScript.
- Suite actuelle rejouée le 2026-07-16 : **16 fichiers, 551 assertions**.
- Correction mobile livrée et **prouvée le 2026-07-11** : burger accessible
  (contrôle interactif vert sur six pages à 320/375), composition une colonne,
  tableaux contenus, chaînes longues sécables ; 45 captures aux largeurs
  exactes (15 × 320, 15 × 375, 15 × 768, zéro doublon binaire) ; W3C 0/0,
  axe 0 violation et débordement 0/60 rejoués sur la version finale.
- Les sources de juin restent des v1 intactes sous `docs/historique/2026-06/` ;
  les captures de cours tierces (`docs/_a_retirer_du_projet/`) ont été
  supprimées par l'utilisateur le 2026-07-12.

## Prochaine action recommandée

Toutes les preuves automatisables sont fraîches. Le contrôle réel du Lot M
reste à exécuter dès qu'un backend Browser est disponible : deux pages ouvertes
simultanément, accès LAN, transitions et reconnexion, focus et régions
accessibles. Les autres actions sont côté utilisateur :

1. **Répéter** en chronométrant : ouvrir
   [`soutenance/soutenance.html`](soutenance/soutenance.html) (touche N =
   notes orateur), dérouler la démo
   ([`soutenance/demo-11-minutes.md`](soutenance/demo-11-minutes.md)),
   relire les [Q/R](soutenance/questions-reponses.md) ;
2. dérouler la **checklist clavier** de [`conformite.md`](conformite.md) ;
3. avant chaque répétition : démarrer le serveur PUIS `npm run seed:demo` ;
4. décider du **`git push`** (main local est très en avance sur origin).

Les restes hors jury (hébergement PostgreSQL réel, Argon2id) sont listés
dans l'audit et les veilles ; la migration Prisma 7 a été réalisée le
2026-07-12 (suite complète rejouée).

### Limites de production du temps réel

- Temps réel Lot M : adaptateur mémoire mono-processus ; une production
  multi-instance devra utiliser PostgreSQL `LISTEN/NOTIFY` ou Redis.
- Sous HTTP/1.1, plusieurs onglets peuvent atteindre la limite de connexions SSE
  par origine ; HTTP/2 ou une mutualisation inter-onglets est l'évolution prévue.
- Le reverse proxy de production doit masquer le segment secret des accès
  initiaux `/suivi/:token` dans ses journaux. Les URLs SSE et fragment ne
  contiennent pas ce jeton.

## Vérifications à lancer dès que l'environnement le permet

```powershell
npm test
npx prisma validate
```

Puis utiliser deux terminaux, dans cet ordre. Terminal 1 — démarrer le serveur
et vérifier que http://localhost:3000 répond :

```powershell
npm run dev
```

Terminal 2 — seulement après cette vérification :

```powershell
npm run seed:demo
```

Puis vérifier dans un navigateur :

- largeurs 320, 375, 768 et 1440 px ;
- navigation clavier et focus visible ;
- absence de débordement de la navigation, des cartes et des tableaux ;
- pages accueil, annonces liste/carte, détail/candidature, connexion, dashboard école,
  suivi/signature et admin ;
- validation W3C des pages HTML rendues ;
- audit accessibilité automatisé, puis contrôle manuel.

## État Git observé avant l'audit

- Branche : `lot-l-autocomplete-adresse`
- HEAD au début de l'audit : `102cdc2`
- Fichiers non suivis préexistants à préserver :
  `.claude/settings.local.json`, `contexte.md` et
  `Suivi_candidatures_stage_1_1_mails_plus_naturels_v3.xlsx`.
- Ne jamais ajouter ces fichiers personnels au staging.
- Un seul agent à la fois sur le dépôt, conformément à `AGENTS.md`.

## Contrôle de fin de session pour l'agent suivant

À chaque pause ou changement d'agent, mettre à jour cette section avec :

- la dernière action terminée ;
- les fichiers modifiés ;
- les commandes de vérification exécutées et leur résultat ;
- le premier travail restant, formulé sans ambiguïté ;
- les décisions de l'utilisateur encore attendues.

### Checkpoint Lot M — passation du 2026-07-16

- Intégration automatisée vérifiée après les durcissements finaux :
  `test/lot-m.cjs` vert avec **94 assertions** ; `npm test` vert avec
  **16 fichiers et 551 assertions**,
  dans l'ordre Lot L → Lot M → Lot K ; schéma Prisma valide et
  `git diff --check` sans erreur.
- Serveur démarré à neuf sur le port 3000, puis seed exécuté avec
  `DEMO_BASE_URL=http://192.168.1.13:3000`. Cette commande a produit l'URL de
  suivi temps réel attendue ; elle ne constitue pas une preuve d'accès depuis
  un autre appareil. Le serveur de vérification a ensuite été arrêté et le
  port 3000 n'était plus en écoute.
- Contrôle dans un vrai navigateur **non réalisé dans cette session** : la
  connexion Browser a répondu `No browser is available` et la liste des
  navigateurs disponibles était vide (`[]`). Aucun autre moteur d'automatisation
  n'a été substitué à ce contrôle obligatoire.
- Restent donc à rejouer manuellement : pages école et candidat simultanées,
  transitions sans rechargement, coupure/reconnexion et rattrapage, session
  terminale sans rafale, conservation du focus avec bandeau, inspection des
  régions `aria-live`, scénario de secours à deux onglets et essai sur téléphone
  via le réseau local. Aucun pare-feu Windows n'a été modifié.

### Checkpoint final — preuves responsive régénérées (2026-07-11, Claude)

- Action terminée le 2026-07-11 : spécifications, diagramme fonctionnel et
  cas d'utilisation livrés en v2 sous `docs/jury/` ; les v1 de juin sont
  restées intactes et les wireframes n'ont volontairement pas été modifiés,
  car ils prouvent la maquette initiale.
- Action terminée le 2026-07-11 (Codex puis Claude) : **30 wireframes v2**
  livrés sous `wireframes-v2/` — manifeste + générateur + contrôle
  (`check-wireframes.cjs` à 30/30), 30 PNG 1440 px exacts contrôlés
  visuellement un à un, matrice de traçabilité 30/30 VALIDÉ, planche SVG et
  PDF 32 pages vérifié (pypdf + rendu pypdfium2). Wireframes v1 de juin
  intacts. Codex a livré les tâches 1 à 4 et rédigé les contenus admin ;
  Claude a généré/contrôlé/commité la fin (blocage sandbox Codex sur Node).
- Action terminée le 2026-07-11 : découpage fonctionnel et charte graphique
  livrés (`decoupage-fonctionnel.md`, diagrammes SVG/PNG et
  `charte-graphique.md`), puis specifications-v2, diagramme fonctionnel v2 et
  cas d'utilisation v2 ; audit porté à **32 validés / 1 à renforcer /
  0 manquant**.
- Action terminée : **chantier « responsive mobile et présentation » LIVRÉ en
  entier** (les deux plans du 2026-07-10 — corrections d'audit et responsive —
  sont entièrement cochés).
- Comportement du burger vérifié en CDP sur six pages (accueil, annonces,
  suivi, dashboard, contrat, admin) à 320 et 375 px : bouton visible, menu
  fermé par défaut, ouverture au clic avec `aria-expanded`/`aria-label`
  synchronisés, fermeture à Échap avec retour du focus au bouton, fermeture au
  clic extérieur, aucun débordement menu ouvert — **12/12 vert**.
- Captures : 45 PNG régénérés le 2026-07-11 — largeurs binaires exactes
  (15 × 320, 15 × 375, 15 × 768), zéro doublon binaire entre `r320` et `r375`,
  12 captures clés contrôlées visuellement (marque centrée, burger à droite,
  une colonne, boutons pleine largeur, rien de coupé).
- Conformité rejouée dans `docs/jury/conformite/` : **W3C 0 erreur /
  0 avertissement sur 15 pages, axe 0 violation, débordement 0/60** avec
  `viewportWidth` enregistré (`resume.json` daté du 2026-07-11).
- Tests : `npm test` — 15 suites, **448 assertions**, sortie 0 (aucun code
  produit modifié ce jour ; uniquement documents et preuves régénérées).
- Fichiers modifiés ce jour : `docs/jury/captures/r{320,375,768}/*.png`,
  `docs/jury/conformite/*.json`, `docs/jury/audit-certification-dwwm.md`
  (critère responsive → VALIDÉ, synthèse 30/3/0), `docs/jury/conformite.md`,
  `docs/jury/README.md`, `docs/jury/soutenance/soutenance.html` (diapo
  qualité : 0/60, date du 11 juillet), `soutenance/questions-reponses.md`,
  `AGENTS.md`, et les deux plans cochés sous `docs/superpowers/plans/`.
- Serveur 4071 arrêté en fin de session. Aucun commit ni staging. Les trois
  fichiers personnels non suivis sont préservés et ignorés explicitement.
- Seuls restes, tous côté utilisateur : répétitions chronométrées (deck, démo,
  Q/R), checklist clavier complète de `conformite.md` (section 5) et décision
  du `git push` (main très en avance sur origin). Les fichiers tiers de
  `docs/_a_retirer_du_projet/` ont été supprimés le 2026-07-12.

### Dernier checkpoint livre

- Action terminée (2026-07-10, Claude) : **chantier « script de soutenance »
  LIVRÉ en entier** sur la branche `jury-script-soutenance` (plan
  entièrement coché :
  `docs/superpowers/plans/2026-07-10-script-soutenance.md`). Livrables :
  deck de 28 diapositives, démo minutée + scénario de secours, 26 Q/R,
  veille sécurité (OWASP Top 10 2025), veille technique anglophone,
  `README.md` réécrit, `DESIGN.md` classé en historique, micro-fix Mailpit
  en TDD (suite à 442 assertions). **La préparation documentaire du jury est
  TERMINÉE : audit à 29 validés / 4 à renforcer (2 critères facultatifs +
  2 compléments de production) / 0 manquant.**
- Vérifications exécutées sur ce chantier : `npm test` (15 suites,
  442 assertions) avant chaque commit ; `npx prisma validate` ; liens
  contrôlés par script ; 8 URLs publiques de la démo en 200 ; deck contrôlé
  visuellement (3 diapos) + export PDF (1,3 Mo) ; sources des deux veilles
  vérifiées en ligne le 2026-07-10.
- ⚠️ Pièges appris (valables pour toute reprise) : redémarrer le serveur
  4071 après toute modification de vue/CSS/JS (cache Twig) ; seeder APRÈS le
  démarrage du serveur (la purge automatique consomme l'alerte de démo
  30 s après le boot).
- Premier travail restant : **côté utilisateur uniquement** — répétitions
  chronométrées, checklist clavier de `conformite.md`, décision du
  `git push`. Pour un agent, la préparation initiale était alors close ; le
  Lot M a été ajouté le 2026-07-16. Les restes
  hors jury (sauvegarde/restauration, hébergement production,
  Argon2id) sont listés dans l'audit et les veilles.
- Chantiers précédents tous fusionnés dans `main` le 2026-07-10 (rangement
  Codex, Lot L, consolidation du dossier, conformité visible).
- `main` local est très en avance sur `origin/main` (~110 commits après
  fusion de cette branche) — pousser quand l'utilisateur le demandera.
