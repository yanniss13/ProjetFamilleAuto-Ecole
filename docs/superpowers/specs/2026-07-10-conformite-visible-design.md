# Conformité visible — W3C, responsive, accessibilité (design)

Date : 2026-07-10
Statut : validé, prêt pour plan d'implémentation.

## Contexte

Deuxième chantier de préparation jury (après la consolidation du dossier,
livrée le 2026-07-10). L'audit (`docs/jury/audit-certification-dwwm.md`)
laisse : « Validation W3C » MANQUANT, « Interfaces responsives » et
« Validateur d'accessibilité » À RENFORCER. La checklist exige des preuves
datées : page, méthode, résultat.

## Décisions validées

1. **axe-core en devDependency** : l'outil de référence, injecté dans les
   pages rendues via CDP (`Page.setBypassCSP`) — n'affecte pas la production.
2. **Corriger dans ce chantier** : les erreurs W3C, les violations axe
   sérieuses et les débordements responsive sont corrigés immédiatement
   (vues Twig / CSS uniquement), avec re-validation après correction.
3. **W3C via le validateur Nu officiel** : HTML rendu envoyé en POST à
   `https://validator.w3.org/nu/?out=json` (séquentiel, pause entre pages,
   User-Agent identifiant le projet). Pas de vnu.jar local (Java non requis).
4. **Passation Codex à tout moment** : chaque tâche du plan se termine par
   plan coché + checkpoint `docs/jury/README.md` mis à jour + commit.

## Branche et conventions

- Branche `jury-conformite-visible` depuis `main` ; commits `Jury: ...`.
- `npm test` avant chaque commit ; jamais les fichiers personnels racine.
- Les corrections de vues/CSS suivent les conventions du dépôt (CSP stricte :
  aucun JS/CSS inline ; typographie française dans les textes utilisateur).

## Architecture outillage

### `scripts/lib/cdp.js` (extrait de `captures-jury.js`)

Module partagé : lancement d'Edge headless (chemins Program Files, port CDP
9223, profil temporaire, `--window-size` paramétrable), découverte de la cible
`page` via `http://127.0.0.1:9223/json`, classe `Cdp` (cmd/attendChargement
avec garde-fous 30 s), helpers `navigue` (load + pause 1500 ms) et `connecte`
(remplit `#email`/`#password` et soumet le VRAI formulaire — CSRF inclus).
`captures-jury.js` est refactorisé pour consommer ce module ; son comportement
est re-vérifié (15/15 captures) après refactorisation.

### `scripts/lib/pages-jury.js` (extrait de `captures-jury.js`)

Exporte `donneesDemo()` (IDs de démo en lecture seule via Prisma :
`phareId`, `pendingId`, `token`) et `PAGES` (les 15 pages : nom, URL, session
`null`/`'ecole'`/`'admin'`) — une seule source de vérité pour captures et
contrôles de conformité. Constantes comptes/BASE partagées.

### `scripts/conformite-jury.js` (nouveau)

Usage : `node scripts/conformite-jury.js [--controle=w3c|axe|debordement|tout]
[--sortie=docs/jury/conformite]`. Prérequis identiques aux captures :
`npm run seed:demo` + serveur `$env:PORT='4071'`.

- **Contrôle `w3c`** : pour chaque page, récupère le HTML rendu via
  `Runtime.evaluate` de `'<!doctype html>\n' + document.documentElement.outerHTML`
  dans la page déjà chargée par CDP (les sessions école/admin marchent donc
  sans gestion de cookies), POST au validateur Nu (`out=json`), archive la
  réponse brute et compte erreurs/avertissements. Pause de 2 s entre pages
  (politesse). Limite documentée dans le rapport : l'HTML sérialisé par le DOM
  peut différer marginalement de l'HTML source (attributs normalisés).
- **Contrôle `axe`** : injecte le source de `node_modules/axe-core/axe.min.js`
  via `Runtime.evaluate` après `Page.setBypassCSP(true)`, lance
  `axe.run(document)`, archive le JSON des violations (id, impact, nombre de
  nœuds, sélecteurs).
- **Contrôle `debordement`** : pour chaque largeur 320/375/768/1440, redimensionne
  via `Emulation.setDeviceMetricsOverride`, mesure
  `document.documentElement.scrollWidth > window.innerWidth` et liste les
  éléments plus larges que la fenêtre (petit walker DOM), archive le JSON.
- Sorties : `docs/jury/conformite/{w3c,axe,debordement}-<nom>.json` + un
  `resume.json` global. Fail-soft par page, code de sortie non nul si un
  contrôle n'a pas pu s'exécuter. Lecture seule (aucune écriture en base).

## Livrables dossier

### `docs/jury/conformite.md`

Rapport daté, sections :

1. **Méthodologie reproductible** : commandes exactes, versions (Edge, axe-core,
   validateur Nu + date), périmètre (les 15 pages du jeu de démo).
2. **Validation W3C** : tableau par page — erreurs, avertissements, statut
   final après corrections (objectif : 0 erreur partout ; les avertissements
   restants sont justifiés un par un).
3. **Responsive** : tableau par page × largeur (320/375/768/1440) — débordement
   détecté oui/non, correction apportée ; renvois vers les captures
   `captures/r320/`, `captures/r375/`, `captures/r768/` (la référence 1440 px
   existe déjà sous `captures/`).
4. **Accessibilité (axe-core)** : tableau par page — violations par impact
   (critical/serious/moderate/minor), corrections apportées, violations
   restantes justifiées.
5. **Checklist clavier manuelle** (à dérouler avant la soutenance, non
   automatisable honnêtement) : tabulation complète sur les parcours clés,
   lien d'évitement, focus visible partout, pad de signature au clavier
   (limite connue à documenter), échappement des modales/messages.

### Captures responsive

`node scripts/captures-jury.js --largeur=320 --sortie=docs/jury/captures/r320`
(puis 375, 768). 15 PNG par largeur, contrôle visuel par échantillon.

### Corrections

Erreurs W3C, violations axe critical/serious et débordements → corrigés dans
`views/*.twig` / `public/css/style.css`. Chaque correction : re-exécution du
contrôle concerné (preuve avant/après conservée dans le rapport), `npm test`
avant commit. Violations moderate/minor : corrigées si triviales, sinon
consignées et justifiées. Si une correction exigeait du JavaScript nouveau ou
un changement de comportement serveur : STOP, demander à l'utilisateur.

### Mises à jour de cohérence

- Audit : « Validation W3C » MANQUANT → VALIDÉ ; « Interfaces responsives » et
  « Validateur d'accessibilité » À RENFORCER → VALIDÉ (constats sourcés vers
  `conformite.md`) ; synthèse recomptée ; cases de la feuille de route cochées.
- `docs/jury/README.md` : livrable ajouté à l'index, checkpoint réécrit.
- `AGENTS.md` : « Prochain travail » → script de soutenance.

## Vérifications

- `scripts/captures-jury.js` re-vérifié après refactorisation (15/15).
- Chaque contrôle re-exécuté après corrections ; JSON bruts archivés.
- Liens Markdown relatifs des documents touchés : 0 cassé (contrôle scripté).
- `npm test` (438 assertions) avant chaque commit ; `npx prisma validate` en fin.
- `git status` final : aucun fichier personnel stagé.

## Hors périmètre

- Script de soutenance, veilles, mise à jour `README.md`/`docs/DESIGN.md`.
- Audit Lighthouse complet (performance/SEO) — axe couvre l'accessibilité.
- Toute correction nécessitant du JS nouveau ou un changement serveur
  (validation utilisateur requise au cas par cas).
