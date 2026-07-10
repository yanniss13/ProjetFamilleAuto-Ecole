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
- **Conformité (2026-07-10)** : [`conformite.md`](conformite.md) — W3C
  0 erreur/0 avertissement, responsive 0 débordement (45 captures),
  accessibilité 0 violation axe ; checklist clavier à dérouler avant la
  soutenance. JSON bruts sous [`conformite/`](conformite/).
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

## État au 2026-07-10 (après consolidation du dossier)

- Audit DWWM mis à jour : **19 validés / 12 à renforcer / 2 manquants**
  (W3C et veille technique anglophone).
- Le chantier « consolidation du dossier » est **livré** : résumé, besoin v2,
  matrice de compétences, comparaison maquettes (avec 15 captures réelles) et
  diagramme BDD v2 — voir la liste ci-dessus.
- Un script réutilisable `scripts/captures-jury.js` capture l'application en
  Edge headless (largeur paramétrable pour le futur contrôle responsive).
- Aucun code métier modifié.
- Les sources de juin sont classées sous `docs/historique/2026-06/` et les huit
  captures de cours sont isolées sous `docs/_a_retirer_du_projet/`.
- `AGENTS.md` pointe vers le présent dossier.
- Le meilleur focus technique retenu est la **signature électronique du contrat**.
- Le déroulé recommandé réserve **11 minutes** à la démonstration dans les 35 minutes.

## Diagnostic central

L'application est solide et riche, mais les documents généraux sont en retard. Les
maquettes obligatoires ont été retrouvées et sont exploitables comme v1. Les risques
prioritaires sont désormais :

1. diagramme BDD limité à 4 entités alors que Prisma en contient 8 ;
2. spécifications de juin annonçant encore admin et purge comme futurs ;
3. ~~`README.md` et `docs/DESIGN.md` encore au statut « squelette »~~ —
   réglé le 2026-07-10 (README réécrit, DESIGN classé en historique) ;
4. liste des compétences absente ;
5. aucune preuve W3C ;
6. responsive et accessibilité non vérifiés sur navigateur ;
7. veille sécurité et veille technique anglophone non formalisées.

## Prochaine action recommandée

**Les trois chantiers de préparation sont livrés** — l'audit est à
29 validés / 4 à renforcer / 0 manquant. Il ne reste que des actions côté
utilisateur :

1. **Répéter** en chronométrant : ouvrir
   [`soutenance/soutenance.html`](soutenance/soutenance.html) (touche N =
   notes orateur), dérouler la démo
   ([`soutenance/demo-11-minutes.md`](soutenance/demo-11-minutes.md)),
   relire les [Q/R](soutenance/questions-reponses.md) ;
2. dérouler la **checklist clavier** de [`conformite.md`](conformite.md) ;
3. avant chaque répétition : démarrer le serveur PUIS `npm run seed:demo` ;
4. décider du **`git push`** (main local est très en avance sur origin).

Pour un agent : plus aucun chantier documentaire jury planifié. Les restes
hors jury (sauvegarde/restauration, hébergement production, migration
Prisma 7, Argon2id) sont listés dans l'audit et les veilles.

## Vérifications à lancer dès que l'environnement le permet

```powershell
npm test
npx prisma validate
npm run seed:demo
npm run dev
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

### Dernier checkpoint

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
  `git push`. Pour un agent : plus aucun chantier jury planifié ; les restes
  hors jury (sauvegarde/restauration, hébergement production, Prisma 7,
  Argon2id) sont listés dans l'audit et les veilles.
- Chantiers précédents tous fusionnés dans `main` le 2026-07-10 (rangement
  Codex, Lot L, consolidation du dossier, conformité visible).
- `main` local est très en avance sur `origin/main` (~110 commits après
  fusion de cette branche) — pousser quand l'utilisateur le demandera.
