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

Les chantiers 1 (consolidation du dossier) et 2 (conformité visible) sont
livrés. Reste :

1. **Script de soutenance** — support 35 minutes, démo 11 minutes et
   préparation des 45 minutes de questions ; inclut les veilles sécurité et
   technique (sources anglophones, dernier critère MANQUANT) et la mise à
   jour de `README.md`/`docs/DESIGN.md`.
2. Côté utilisateur, avant la soutenance : dérouler la checklist clavier de
   [`conformite.md`](conformite.md) et relancer `npm run seed:demo`.

Chaque chantier suit le cycle du projet : spécification → plan →
TDD/implémentation si du code est nécessaire.

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

- **Chantier en cours : « script de soutenance »**, branche
  `jury-script-soutenance`, plan :
  `docs/superpowers/plans/2026-07-10-script-soutenance.md` (reprendre à la
  première tâche non cochée).
- Dernière action terminée (2026-07-10, Claude) : **Task 2** — `README.md`
  réécrit (état réel A→L, 442 assertions, plus aucun « squelette ») ;
  `DESIGN.md` déplacé vers `docs/historique/2026-06/DESIGN.md` avec bandeau ;
  références mises à jour (docs/README.md, présent fichier, README
  historique) ; 0 lien cassé. Task 1 déjà livrée (micro-fix Mailpit TDD,
  suite à 442 assertions).
- Task 3 livrée : `docs/jury/veille-securite.md` — 8 fiches menace → source
  datée (OWASP Top 10 **2025**, cheat sheets vérifiées le 2026-07-10) →
  décision → preuve ; note honnête Argon2id vs bcrypt pour la production.
- Prochaine tâche : **Task 4** — `docs/jury/veille-technique.md` (sources
  officielles anglophones vérifiées en ligne : Node.js releases, Express,
  Prisma releases, MDN ; solde le dernier critère MANQUANT).
- Chantier précédent (« conformité visible ») : LIVRÉ et fusionné dans `main`
  — 0 erreur W3C, 0 violation axe, 0 débordement (voir `conformite.md`).
  Audit : 22 validés / 10 à renforcer / 1 manquant.
- ⚠️ Piège appris : redémarrer le serveur 4071 après toute modification de
  vue/CSS/JS (cache Twig + fichiers statiques), sinon l'ancien état est
  contrôlé.
- Vérifications exécutées : run final `--controle=tout` 45/45 à zéro ;
  `npm test` (15 suites, 438 assertions) avant chaque commit ;
  `npx prisma validate` ; liens Markdown contrôlés (0 cassé).
- Premier travail restant : chantier « **script de soutenance** »
  (spécification d'abord — support 35 min, démo 11 min, questions, veilles,
  README/DESIGN). Côté utilisateur : checklist clavier de `conformite.md`.
- Chantiers précédents fusionnés dans `main` le 2026-07-10 (rangement Codex,
  Lot L, consolidation du dossier).
- `main` local a ~97 commits d'avance sur `origin/main` — pousser quand
  l'utilisateur le demandera. Aucune autre décision utilisateur attendue.
