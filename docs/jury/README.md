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
- Conception initiale classée :
  [`../historique/2026-06/README.md`](../historique/2026-06/README.md)
- Spécification historique : [`../DESIGN.md`](../DESIGN.md)
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
3. `README.md` et `docs/DESIGN.md` encore au statut « squelette » ;
4. liste des compétences absente ;
5. aucune preuve W3C ;
6. responsive et accessibilité non vérifiés sur navigateur ;
7. veille sécurité et veille technique anglophone non formalisées.

## Prochaine action recommandée

Le chantier 1 (consolidation du dossier) est livré. Restent, dans l'ordre
recommandé :

1. **Conformité visible** — validation W3C des pages rendues, responsive
   (320/375/768/1440 px — réutiliser `scripts/captures-jury.js --largeur=`)
   et audit accessibilité (automatisé + clavier) ;
2. **Script de soutenance** — support 35 minutes, démo 11 minutes et
   questions/réponses ; inclut les veilles sécurité et technique (sources
   anglophones) et la mise à jour de `README.md`/`docs/DESIGN.md`.

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

- **Chantier en cours : « conformité visible »**, branche
  `jury-conformite-visible`, plan :
  `docs/superpowers/plans/2026-07-10-conformite-visible.md` (suivre les cases
  cochées — reprendre à la première tâche non cochée).
- Dernière action terminée (2026-07-10, Claude) : **Task 1** — client CDP
  extrait dans `scripts/lib/cdp.js`, pages partagées dans
  `scripts/lib/pages-jury.js`, `scripts/captures-jury.js` refactorisé et
  re-vérifié (15/15 captures identiques en comportement).
- Vérifications exécutées : `node scripts/captures-jury.js` → 15/15 ;
  `npm test` (15 suites, 438 assertions) avant le commit.
- Prochaine tâche : **Task 2** — `npm i -D axe-core`, écrire
  `scripts/conformite-jury.js` (code complet dans le plan), premier constat
  brut sur les 15 pages (prérequis : `npm run seed:demo` + serveur
  `$env:PORT='4071'; node src/server.js`).
- Chantier précédent (« consolidation du dossier ») : livré et fusionné dans
  `main` le 2026-07-10 avec le rangement Codex et le Lot L.
- `main` local a ~91 commits d'avance sur `origin/main` — pousser quand
  l'utilisateur le demandera. Aucune autre décision utilisateur attendue.
