# Rangement des documents jury - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Le dépôt impose un seul agent actif : ne pas utiliser de sous-agents.

**Goal:** Classer les documents historiques de juin 2026 par famille, isoler les captures de cours retirables et maintenir tous les liens de reprise pour le jury.

**Architecture:** Conserver `docs/jury/` comme source actuelle, déplacer les livrables initiaux sous `docs/historique/2026-06/` sans écraser leur contenu, et placer uniquement les fichiers clairement externes sous `docs/_a_retirer_du_projet/`. Garder `wireframes/` et `spec-assets/` côte à côte avec les spécifications afin de préserver leurs liens relatifs.

**Tech Stack:** Markdown, HTML, SVG, PNG, PDF, XLSX, SQL, PowerShell 5.1 et Git en lecture seule.

## Global Constraints

- Ne supprimer aucun fichier utilisateur ; tous les éléments retirables sont déplacés.
- Ne pas déplacer `.claude/settings.local.json`, `contexte.md` ni `Suivi_candidatures_stage_1_1_mails_plus_naturels_v3.xlsx`.
- Ne pas modifier le contenu historique sauf les liens rendus invalides par le déplacement.
- Ne pas toucher à `docs/DESIGN.md` ni à `docs/superpowers/` hors présent plan.
- Utiliser PowerShell de bout en bout pour les déplacements et vérifier chaque cible absolue avant `Move-Item`.
- Ne pas commiter : l'utilisateur ne l'a pas demandé et `npm test` n'est pas exécutable dans cette session.

---

### Task 1: Créer la structure documentaire

**Files:**
- Create: `docs/README.md`
- Create: `docs/historique/2026-06/README.md`
- Create: `docs/_a_retirer_du_projet/README.md`

- [x] **Step 1:** Créer les répertoires `historique/2026-06/{decoupage,diagrammes}` et `_a_retirer_du_projet/captures-cours-uml` après vérification des chemins absolus.
- [x] **Step 2:** Écrire un README historique indiquant le statut v1, les familles de documents et la source actuelle sous `docs/jury/`.
- [x] **Step 3:** Écrire le README du dossier retirable avec la liste exacte des huit captures et la raison de leur isolement.
- [x] **Step 4:** Créer `docs/README.md` comme index des dossiers jury, historique, superpowers et retirables.

### Task 2: Déplacer les documents historiques

**Files:**
- Move: `docs/CAHIER-DES-CHARGES.md` -> `docs/historique/2026-06/CAHIER-DES-CHARGES.md`
- Move: `docs/SPECIFICATIONS-FONCTIONNELLES-ET-TECHNIQUES.{md,pdf}` -> `docs/historique/2026-06/`
- Move: `docs/decoupage-fonctionnel.{html,xlsx,pdf}` -> `docs/historique/2026-06/decoupage/`
- Move: `docs/diagramme-*`, `docs/mcd*`, `docs/mld*` -> `docs/historique/2026-06/diagrammes/`
- Move: `docs/wireframes/` et `docs/spec-assets/` -> `docs/historique/2026-06/`

- [x] **Step 1:** Vérifier que chaque source existe et qu'aucune cible n'existe déjà.
- [x] **Step 2:** Déplacer chaque fichier avec `Move-Item -LiteralPath` dans PowerShell.
- [x] **Step 3:** Vérifier les nombres attendus : 12 HTML de wireframes, 11 PNG `wf-*`, 8 modèles Prisma et 4 tables dans le MCD historique.

### Task 3: Isoler les fichiers retirables

**Files:**
- Move: `docs/image1.png` à `docs/image8.png` -> `docs/_a_retirer_du_projet/captures-cours-uml/`

- [x] **Step 1:** Déplacer uniquement les huit captures du cours École R17.
- [x] **Step 2:** Vérifier qu'aucune documentation du projet ne dépend de ces images.
- [x] **Step 3:** Confirmer qu'aucune suppression n'a eu lieu.

### Task 4: Réparer les liens et la reprise agent

**Files:**
- Modify: `docs/historique/2026-06/diagrammes/diagramme-fonctionnel.md`
- Modify: `docs/jury/audit-certification-dwwm.md`
- Modify: `docs/jury/inventaire-documents-historiques.md`
- Modify: `docs/jury/README.md`
- Modify: `AGENTS.md`

- [x] **Step 1:** Remplacer dans le diagramme fonctionnel les liens `spec-assets/...` par `../spec-assets/...` ; conserver les liens vers les PDF du même dossier.
- [x] **Step 2:** Remplacer tous les anciens chemins `docs/...` dans les documents jury par les nouveaux chemins historiques ou retirables.
- [x] **Step 3:** Ajouter au checkpoint de reprise le rangement effectué et la règle de conservation de la v1.

### Task 5: Vérifier le résultat

**Files:**
- Verify: `docs/historique/2026-06/**`
- Verify: `docs/_a_retirer_du_projet/**`
- Verify: `docs/jury/*.md`

- [x] **Step 1:** Lancer un contrôle des liens Markdown relatifs dans tous les `.md` concernés ; résultat attendu : aucun lien invalide.
- [x] **Step 2:** Rechercher les anciens chemins et confirmer qu'il n'en reste aucun hors du plan d'exécution.
- [x] **Step 3:** Lancer `git diff --check` ; résultat attendu : code de sortie 0.
- [x] **Step 4:** Examiner `git status --short --untracked-files=all` et confirmer que les fichiers personnels racine sont inchangés.
- [x] **Step 5:** Cocher les étapes terminées dans ce plan et mettre à jour le dernier checkpoint de `docs/jury/README.md`.
