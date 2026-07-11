# Conformité visible - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Le dépôt impose un seul agent actif : ne pas utiliser de sous-agents.

**Goal:** Produire des preuves datées de conformité W3C, responsive et accessibilité pour les 15 pages du jeu de démo, corriger les problèmes trouvés, et archiver le tout dans `docs/jury/conformite.md`.

**Architecture:** Le client CDP de `scripts/captures-jury.js` est extrait dans `scripts/lib/cdp.js` (+ liste des pages dans `scripts/lib/pages-jury.js`), consommé par un nouveau `scripts/conformite-jury.js` à trois contrôles (validateur Nu W3C, axe-core injecté, détection de débordement). Spec : `docs/superpowers/specs/2026-07-10-conformite-visible-design.md`.

**Tech Stack:** Node.js 22 (WebSocket/fetch natifs), Edge headless (CDP), axe-core (devDependency), validateur Nu en ligne, PowerShell 5.1.

## Global Constraints

- **PASSATION CODEX** : à la fin de CHAQUE tâche — cocher les cases de la tâche dans ce plan, mettre à jour le « Dernier checkpoint » de `docs/jury/README.md` (dernière action, prochaine tâche du plan, vérifications), commiter le tout dans le commit de la tâche. Une interruption doit toujours être reprenable en lisant le README jury.
- Branche `jury-conformite-visible` ; commits `Jury: ...` ; tout en français.
- `npm test` (438 assertions, 15 suites) avant chaque commit.
- Ne jamais stager `contexte.md`, `Suivi_candidatures_stage_1_1_mails_plus_naturels_v3.xlsx`, `.claude/settings.local.json`.
- Corrections limitées à `views/**/*.twig` et `public/css/style.css` (CSP stricte : jamais de JS/CSS inline). **STOP et demander à l'utilisateur** si une correction exige du JavaScript nouveau ou un changement de comportement serveur.
- Prérequis d'exécution des scripts : `npm run seed:demo` puis serveur `$env:PORT='4071'; node src/server.js` en tâche de fond (vérifier `http://127.0.0.1:4071/annonces` → 200).
- Comptes seed : `ecole.vitrine@demo.moniteur-connect.example` / `demo1234` ; `admin@demo.moniteur-connect.example` / `admin1234`.

---

### Task 1: Extraire la lib CDP et la liste des pages (refactorisation sans changement de comportement)

**Files:**
- Create: `scripts/lib/cdp.js`
- Create: `scripts/lib/pages-jury.js`
- Modify: `scripts/captures-jury.js`

**Interfaces:**
- Produces (`scripts/lib/cdp.js`) : `lanceEdge({ largeur = 1440, hauteur = 1000 })` → `{ cdp, fermer }` (Edge lancé, WebSocket connecté, `Page.enable` + `Runtime.enable` faits) ; classe `Cdp` avec `cmd(method, params) : Promise<result>` et `attendChargement() : Promise<void>` ; `navigue(cdp, url)` ; `connecte(cdp, urlLogin, { email, password })` ; `pause(ms)`.
- Produces (`scripts/lib/pages-jury.js`) : `BASE` (string, `process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:4071'`) ; `ECOLE` et `ADMIN` (`{ email, password }`) ; `donneesDemo()` → `{ phareId, pendingId, token }` (Prisma lecture seule) ; `pagesJury(ids)` → tableau de 15 `{ nom, url, session }` dans l'ordre publiques → école → admin.

- [x] **Step 1:** Créer `scripts/lib/cdp.js` en déplaçant depuis `scripts/captures-jury.js` (contenu identique, seule l'organisation change) : constantes `EDGES` et `PORT_CDP`, `pause`, classe `Cdp`, `navigue`, `connecte`, et le bloc de lancement d'Edge + découverte de cible + connexion WebSocket, emballé ainsi :

```js
// scripts/lib/cdp.js — client Chrome DevTools Protocol minimal partagé par les
// scripts jury (captures, conformité). WebSocket natif de Node >= 22, aucune
// dépendance. Voir scripts/captures-jury.js pour l'usage type.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT_CDP = 9223; // hors plage des tests (4055-4070) et du serveur (4071)
const EDGES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp { /* ... classe INCHANGÉE de captures-jury.js ... */ }

async function navigue(cdp, url) { /* ... INCHANGÉ ... */ }
async function connecte(cdp, urlLogin, compte) { /* ... INCHANGÉ ... */ }

// Lance Edge headless, se connecte en CDP et active Page + Runtime.
// Renvoie { cdp, fermer } — TOUJOURS appeler fermer() dans un finally.
async function lanceEdge({ largeur = 1440, hauteur = 1000 } = {}) {
  const edge = EDGES.find((chemin) => fs.existsSync(chemin));
  if (!edge) throw new Error('Microsoft Edge introuvable (chemins Program Files).');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-jury-'));
  const processusEdge = spawn(edge, [
    '--headless=new',
    `--remote-debugging-port=${PORT_CDP}`,
    `--window-size=${largeur},${hauteur}`,
    `--user-data-dir=${profil}`,
    '--no-first-run',
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    let cible = null;
    for (let essai = 0; essai < 50 && !cible; essai += 1) {
      await pause(200);
      try {
        const reponse = await fetch(`http://127.0.0.1:${PORT_CDP}/json`);
        cible = (await reponse.json()).find((c) => c.type === 'page');
      } catch (_) { /* Edge pas encore prêt */ }
    }
    if (!cible) throw new Error('endpoint CDP injoignable après 10 s.');
    const ws = new WebSocket(cible.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', () => reject(new Error('connexion WebSocket CDP refusée')));
    });
    const cdp = new Cdp(ws);
    await cdp.cmd('Page.enable');
    await cdp.cmd('Runtime.enable');
    return { cdp, fermer: () => { try { ws.close(); } catch (_) {} processusEdge.kill(); } };
  } catch (err) {
    processusEdge.kill();
    throw err;
  }
}

module.exports = { lanceEdge, navigue, connecte, pause };
```

(Recopier les corps `Cdp`, `navigue`, `connecte` tels quels depuis `scripts/captures-jury.js` — ils y sont complets.)

- [x] **Step 2:** Créer `scripts/lib/pages-jury.js` en déplaçant depuis `scripts/captures-jury.js` : `BASE`, `DEMO_SUFFIX`, `ECOLE`, `ADMIN`, `donneesDemo()` (INCHANGÉ, Prisma lecture seule avec `$disconnect` en `finally`) et la construction des pages :

```js
// scripts/lib/pages-jury.js — la liste des 15 pages du dossier jury et les IDs
// du jeu de démo. Source de vérité unique pour captures et contrôles.
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:4071';
const DEMO_SUFFIX = '@demo.moniteur-connect.example';
const ECOLE = { email: `ecole.vitrine${DEMO_SUFFIX}`, password: 'demo1234' };
const ADMIN = { email: `admin${DEMO_SUFFIX}`, password: 'admin1234' };

async function donneesDemo() { /* ... INCHANGÉ de captures-jury.js ... */ }

// L'ordre importe : publiques, puis session école, puis admin (la connexion
// admin régénère la session — cloisonnement voulu).
function pagesJury(ids) {
  return [
    { nom: 'accueil', url: '/', session: null },
    { nom: 'annonces', url: '/annonces', session: null },
    { nom: 'annonce-detail', url: `/annonces/${ids.phareId}`, session: null },
    { nom: 'carte', url: '/annonces?vue=carte', session: null },
    { nom: 'inscription', url: '/inscription', session: null },
    { nom: 'connexion', url: '/connexion', session: null },
    { nom: 'alertes', url: '/alertes', session: null },
    { nom: 'suivi', url: `/suivi/${ids.token}`, session: null },
    { nom: 'dashboard', url: '/tableau-de-bord', session: 'ecole' },
    { nom: 'mes-annonces', url: '/mes-annonces', session: 'ecole' },
    { nom: 'annonce-form', url: '/mes-annonces/nouvelle', session: 'ecole' },
    { nom: 'candidatures', url: `/mes-annonces/${ids.phareId}/candidatures`, session: 'ecole' },
    { nom: 'contrat', url: `/mes-annonces/${ids.phareId}/candidatures/${ids.pendingId}/accepter`, session: 'ecole' },
    { nom: 'compte', url: '/mon-compte', session: 'ecole' },
    { nom: 'admin', url: '/admin', session: 'admin' },
  ];
}

module.exports = { BASE, ECOLE, ADMIN, donneesDemo, pagesJury };
```

- [x] **Step 3:** Réécrire `scripts/captures-jury.js` pour consommer les deux libs : il garde `argument()`, `capture()` et la boucle principale (gestion de `sessionCourante`, fail-soft, bilan final, runner CLI) ; il perd tout ce qui a été déplacé. La boucle utilise `lanceEdge({ largeur })`, `pagesJury(await donneesDemo())`, `connecte(cdp, BASE + '/connexion', ECOLE)` / `connecte(cdp, BASE + '/admin/connexion', ADMIN)`, `navigue(cdp, BASE + page.url)` — signatures du bloc Interfaces. L'option `--sortie` existe déjà : ne pas la changer.
- [x] **Step 4:** Re-vérifier le comportement : `npm run seed:demo`, serveur sur 4071 en fond, `node scripts/captures-jury.js --sortie=docs/jury/captures` → attendu `15/15 captures`. Arrêter le serveur. (Les PNG regénérés peuvent différer au bit près : NE PAS les commiter — `git checkout -- docs/jury/captures` si modifiés.)
- [x] **Step 5:** `npm test` (438 assertions). Cocher la Task 1, mettre à jour le checkpoint de `docs/jury/README.md` (Global Constraints), puis :

```powershell
git add scripts/lib/cdp.js scripts/lib/pages-jury.js scripts/captures-jury.js docs/jury/README.md docs/superpowers/plans/2026-07-10-conformite-visible.md
git commit -m "Jury: lib CDP et pages partagees (refactorisation, captures re-verifiees 15/15)"
```

### Task 2: Script de conformité et premier constat brut

**Files:**
- Modify: `package.json` (devDependency axe-core)
- Create: `scripts/conformite-jury.js`
- Create: `docs/jury/conformite/*.json` (générés)

**Interfaces:**
- Consumes: `lanceEdge`, `navigue`, `connecte`, `pause` de `scripts/lib/cdp.js` ; `BASE`, `ECOLE`, `ADMIN`, `donneesDemo`, `pagesJury` de `scripts/lib/pages-jury.js`.
- Produces: `docs/jury/conformite/{w3c,axe,debordement}-<nom>.json` (15 × 3) et `docs/jury/conformite/resume.json` — consommés par les Tasks 4-7.

- [x] **Step 1:** `npm install --save-dev axe-core` puis vérifier que `require.resolve('axe-core/axe.min.js')` répond (one-liner `node -e`).
- [x] **Step 2:** Écrire `scripts/conformite-jury.js` :

```js
// scripts/conformite-jury.js — contrôles de conformité pour le dossier jury :
// W3C (validateur Nu officiel), accessibilité (axe-core injecté) et
// débordement horizontal (320/375/768/1440). LECTURE SEULE côté application.
// Prérequis : npm run seed:demo + serveur sur le port 4071.
// Usage : node scripts/conformite-jury.js [--controle=w3c|axe|debordement|tout]
//         [--sortie=docs/jury/conformite]
const fs = require('fs');
const path = require('path');
const { lanceEdge, navigue, connecte, pause } = require('./lib/cdp');
const { BASE, ECOLE, ADMIN, donneesDemo, pagesJury } = require('./lib/pages-jury');

const LARGEURS = [320, 375, 768, 1440];
const NU = 'https://validator.w3.org/nu/?out=json';

function argument(nom, defaut) {
  const prefixe = `--${nom}=`;
  const trouve = process.argv.find((a) => a.startsWith(prefixe));
  return trouve ? trouve.slice(prefixe.length) : defaut;
}

async function htmlRendu(cdp) {
  const r = await cdp.cmd('Runtime.evaluate', {
    expression: `'<!doctype html>\\n' + document.documentElement.outerHTML`,
    returnByValue: true,
  });
  return r.result.value;
}

// W3C : POST du HTML rendu au validateur Nu. Politesse : appelé en séquence
// avec 2 s de pause (voir boucle principale) et User-Agent identifiable.
async function controleW3c(cdp) {
  const html = await htmlRendu(cdp);
  const reponse = await fetch(NU, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'User-Agent': 'MoniteurConnect-verification-jury (contact: depot local)',
    },
    body: html,
  });
  if (!reponse.ok) throw new Error(`validateur Nu HTTP ${reponse.status}`);
  const resultat = await reponse.json();
  const erreurs = resultat.messages.filter((m) => m.type === 'error');
  const avertissements = resultat.messages.filter((m) => m.type !== 'error');
  return { erreurs: erreurs.length, avertissements: avertissements.length, messages: resultat.messages };
}

// axe-core : injecté via Runtime.evaluate (Page.setBypassCSP est activé au
// lancement) puis axe.run — on archive id/impact/aide/nb de nœuds/cibles.
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
async function controleAxe(cdp) {
  await cdp.cmd('Runtime.evaluate', { expression: AXE_SOURCE });
  const r = await cdp.cmd('Runtime.evaluate', {
    expression: `axe.run(document).then(res => JSON.stringify({
      violations: res.violations.map(v => ({
        id: v.id, impact: v.impact, aide: v.help, noeuds: v.nodes.length,
        cibles: v.nodes.slice(0, 5).map(n => n.target.join(' ')),
      })),
      passes: res.passes.length,
    }))`,
    awaitPromise: true,
    returnByValue: true,
  });
  return JSON.parse(r.result.value);
}

// Débordement : à chaque largeur, scrollWidth vs innerWidth + les éléments
// plus larges que la fenêtre (10 premiers, sélecteur court).
async function controleDebordement(cdp) {
  const parLargeur = {};
  for (const largeur of LARGEURS) {
    await cdp.cmd('Emulation.setDeviceMetricsOverride', {
      width: largeur, height: 900, deviceScaleFactor: 1, mobile: largeur < 768,
    });
    await pause(400);
    const r = await cdp.cmd('Runtime.evaluate', {
      expression: `JSON.stringify((() => {
        const deborde = document.documentElement.scrollWidth > window.innerWidth;
        const coupables = [];
        if (deborde) {
          for (const el of document.querySelectorAll('body *')) {
            if (el.getBoundingClientRect().right > window.innerWidth + 1) {
              const cls = (el.className && typeof el.className === 'string')
                ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
              coupables.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : cls));
              if (coupables.length >= 10) break;
            }
          }
        }
        return { deborde, scrollWidth: document.documentElement.scrollWidth,
                 innerWidth: window.innerWidth, coupables };
      })())`,
      returnByValue: true,
    });
    parLargeur[largeur] = JSON.parse(r.result.value);
  }
  await cdp.cmd('Emulation.clearDeviceMetricsOverride');
  return parLargeur;
}

async function main() {
  const controle = argument('controle', 'tout');
  const dossierSortie = path.resolve(argument('sortie', path.join('docs', 'jury', 'conformite')));
  fs.mkdirSync(dossierSortie, { recursive: true });
  const actifs = controle === 'tout' ? ['w3c', 'axe', 'debordement'] : [controle];

  const pages = pagesJury(await donneesDemo());
  const { cdp, fermer } = await lanceEdge({});
  const resume = { date: new Date().toISOString(), controles: actifs, pages: {} };
  let echec = false;
  try {
    await cdp.cmd('Page.setBypassCSP', { enabled: true }); // pour l'injection d'axe
    let sessionCourante = null;
    for (const page of pages) {
      if (page.session !== sessionCourante && page.session === 'ecole') {
        await connecte(cdp, `${BASE}/connexion`, ECOLE); sessionCourante = 'ecole';
      } else if (page.session !== sessionCourante && page.session === 'admin') {
        await connecte(cdp, `${BASE}/admin/connexion`, ADMIN); sessionCourante = 'admin';
      }
      await navigue(cdp, `${BASE}${page.url}`);
      resume.pages[page.nom] = {};
      for (const nomControle of actifs) {
        try {
          const fn = { w3c: controleW3c, axe: controleAxe, debordement: controleDebordement }[nomControle];
          const resultat = await fn(cdp);
          fs.writeFileSync(path.join(dossierSortie, `${nomControle}-${page.nom}.json`),
            JSON.stringify(resultat, null, 2));
          resume.pages[page.nom][nomControle] = nomControle === 'w3c'
            ? { erreurs: resultat.erreurs, avertissements: resultat.avertissements }
            : nomControle === 'axe'
              ? { violations: resultat.violations.length }
              : Object.fromEntries(Object.entries(resultat).map(([l, v]) => [l, v.deborde]));
          console.log(`  ✓ ${nomControle} ${page.nom}`);
          if (nomControle === 'w3c') await pause(2000); // politesse envers le validateur
        } catch (err) {
          echec = true;
          resume.pages[page.nom][nomControle] = { echec: err.message };
          console.error(`  ✗ ${nomControle} ${page.nom} : ${err.message}`);
        }
      }
    }
  } finally {
    fermer();
  }
  fs.writeFileSync(path.join(dossierSortie, 'resume.json'), JSON.stringify(resume, null, 2));
  console.log(`\nRésumé écrit dans ${path.join(dossierSortie, 'resume.json')}`);
  if (echec) process.exitCode = 1;
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  main().catch((err) => { console.error(`Échec : ${err.message}`); process.exitCode = 1; });
}
```

- [x] **Step 3:** Seed + serveur 4071, puis `node scripts/conformite-jury.js --controle=tout`. Attendu : 45 lignes `✓` (15 pages × 3 contrôles), 46 JSON écrits. **Constat brut du 2026-07-10 : W3C = 3 erreurs (inscription, contrat, compte : 1 chacune) + 2 avertissements (dashboard, admin) ; axe = 1-2 violations par page (carte : 0) ; débordement = AUCUN (60 combinaisons).** Lire `docs/jury/conformite/resume.json` et noter le constat brut (nombres d'erreurs W3C, violations axe, débordements par page) — c'est l'état AVANT corrections, à conserver pour le rapport (copier `resume.json` en `resume-avant-corrections.json`).
- [x] **Step 4:** `npm test`. Cocher la Task 2, checkpoint `docs/jury/README.md`, puis :

```powershell
git add package.json package-lock.json scripts/conformite-jury.js docs/jury/conformite docs/jury/README.md docs/superpowers/plans/2026-07-10-conformite-visible.md
git commit -m "Jury: script de conformite (W3C/axe/debordement) + constat brut date"
```

### Task 3: Captures responsive 320/375/768

**Files:**
- Create: `docs/jury/captures/r320/*.png`, `docs/jury/captures/r375/*.png`, `docs/jury/captures/r768/*.png` (générés)

**Interfaces:**
- Consumes: `scripts/captures-jury.js --largeur=<n> --sortie=<dossier>` (Task 1).

- [x] **Step 1:** Seed + serveur 4071 (si arrêtés), puis les trois exécutions :

```powershell
node scripts/captures-jury.js --largeur=320 --sortie=docs/jury/captures/r320
node scripts/captures-jury.js --largeur=375 --sortie=docs/jury/captures/r375
node scripts/captures-jury.js --largeur=768 --sortie=docs/jury/captures/r768
```

Attendu : `15/15` à chaque fois (45 PNG, chacun > 5 Ko).
- [x] **Step 2 — historique invalidé le 2026-07-10 :** le contrôle visuel a
  bien été effectué, mais les captures demandées à 320/375 mesuraient en réalité
  environ 481–496 px à cause de la largeur minimale de la fenêtre Chromium. Le
  constat « aucun débordement à 320/375 » ne constitue donc pas une preuve. Les
  captures exactes et le contrôle du burger doivent être refaits selon le plan
  `2026-07-10-responsive-mobile-presentation.md`.
- [x] **Step 3:** `npm test`. Cocher la Task 3, checkpoint README jury, puis :

```powershell
git add docs/jury/captures/r320 docs/jury/captures/r375 docs/jury/captures/r768 docs/jury/README.md docs/superpowers/plans/2026-07-10-conformite-visible.md
git commit -m "Jury: captures responsive 320/375/768 (3 x 15 ecrans)"
```

### Task 4: Corrections W3C (objectif : 0 erreur sur les 15 pages)

**Files:**
- Modify: `views/**/*.twig` (selon constat)
- Modify: `docs/jury/conformite/w3c-*.json`, `resume.json` (regénérés)

**Interfaces:**
- Consumes: `docs/jury/conformite/w3c-*.json` (Task 2) ; `node scripts/conformite-jury.js --controle=w3c`.

- [x] **Step 1:** Lister toutes les erreurs W3C distinctes (message, page, extrait) depuis les `w3c-*.json`. **Corrigé : `autocomplete="street-address"` → `address-line1` (register/account — jeton monoligne valide) ; `label for="signature-canvas"` → `span.label-titre` + `aria-label` sur le canvas (contract_form + sign, nouvelle règle CSS partagée) ; `section.stats-grid` sans titre → `div` (dashboard + admin, avertissements aussi soldés). ⚠️ Piège : redémarrer le serveur 4071 après modification des vues (cache Twig).** Les corriger dans les vues Twig concernées — catégories attendues et remèdes types : attribut dupliqué/obsolète (supprimer), élément mal imbriqué (restructurer), `id` dupliqué (renommer + mettre à jour le `label for`), attribut ARIA invalide (corriger la valeur ou retirer). Respecter la CSP (aucun style/script inline en correction) et la typographie française des textes. **STOP utilisateur** si une correction demande du JS nouveau ou un changement serveur.
- [x] **Step 2:** Seed + serveur 4071, `node scripts/conformite-jury.js --controle=w3c`. Attendu : `erreurs: 0` sur les 15 pages du `resume.json`. **Résultat : 0 erreur ET 0 avertissement sur les 15 pages — aucun avertissement restant à justifier.**
- [x] **Step 3:** `npm test` (les vues modifiées sont couvertes par les suites). Cocher la Task 4, checkpoint README jury, puis :

```powershell
git add views docs/jury/conformite docs/jury/README.md docs/superpowers/plans/2026-07-10-conformite-visible.md
git commit -m "Jury: corrections W3C - 0 erreur sur les 15 pages"
```

### Task 5: Corrections accessibilité (axe-core)

**Files:**
- Modify: `views/**/*.twig`, `public/css/style.css` (selon constat)
- Modify: `docs/jury/conformite/axe-*.json`, `resume.json` (regénérés)

**Interfaces:**
- Consumes: `docs/jury/conformite/axe-*.json` (Task 2) ; `node scripts/conformite-jury.js --controle=axe`.

- [x] **Step 1:** Lister les violations par impact décroissant. Corriger TOUTES les critical et serious, plus les moderate/minor triviales. **Constat : 2 violations distinctes, toutes serious — (a) `color-contrast` sur `.muted`/footer (toutes pages) : `--color-muted` #6b7280 → #5b6470 (5,5:1 sur fond, 6:1 sur blanc, ratios calculés) + constante `MUTED` alignée dans `dashboard-charts.js` ; (b) `svg-img-alt` sur les 4 graphiques : `aria-label` français ajouté aux SVG générés (paramètre `libelle` sur `renderBarChart`/`renderFunnel` — modification minime du JS existant, remède canonique, PAS de comportement nouveau ; le test lot-h ne vérifie que `createElementNS`/absence d'`innerHTML`).**
- [x] **Step 2:** Seed + serveur 4071, `node scripts/conformite-jury.js --controle=axe`. **Résultat : 0 violation TOUS niveaux confondus sur les 15 pages.**
- [x] **Step 3:** `npm test`. Cocher la Task 5, checkpoint README jury, puis :

```powershell
git add views public/css/style.css docs/jury/conformite docs/jury/README.md docs/superpowers/plans/2026-07-10-conformite-visible.md
git commit -m "Jury: corrections accessibilite - 0 violation axe critical/serious"
```

### Task 6: Corrections responsive (0 débordement horizontal)

**Files:**
- Modify: `public/css/style.css`, `views/**/*.twig` (selon constat)
- Modify: `docs/jury/conformite/debordement-*.json`, `resume.json`, `docs/jury/captures/r*/**` (regénérés pour les pages corrigées)

**Interfaces:**
- Consumes: `docs/jury/conformite/debordement-*.json` + observations Task 3 ; `node scripts/conformite-jury.js --controle=debordement`.

- [x] **Step 1 — historique invalidé le 2026-07-10 :** le script comparait
  `scrollWidth` à `window.innerWidth`, lui aussi élargi à environ 485 px sous
  émulation mobile. L'absence de `deborde: true` ne prouvait donc pas 320/375.
  Le script corrigé utilise désormais `visualViewport.width` ; les tableaux,
  chaînes longues et la navigation mobile ont depuis été corrigés.
- [x] **Step 2 — résultat historique partiel :** les résultats W3C et axe
  décrivent la version antérieure au burger. Le « 0 débordement » de ce run est
  invalidé par le faux positif ci-dessus. Rejouer `--controle=tout` sur la
  version mobile finale avant toute affirmation de conformité.
- [x] **Step 3:** `npm test`. Cocher la Task 6, checkpoint README jury, puis (fusionné avec le commit de la Task 5 — aucune correction responsive) :

```powershell
git add public/css/style.css views docs/jury/conformite docs/jury/captures docs/jury/README.md docs/superpowers/plans/2026-07-10-conformite-visible.md
git commit -m "Jury: corrections responsive - 0 debordement horizontal (4 largeurs)"
```

### Task 7: Rapport `docs/jury/conformite.md`

**Files:**
- Create: `docs/jury/conformite.md`

**Interfaces:**
- Consumes: `resume-avant-corrections.json`, `resume.json`, les JSON par page, les captures `r320/r375/r768`.

- [x] **Step 1:** Rédiger le rapport daté, sections (données réelles des JSON, jamais d'estimation) :
  1. **Méthodologie reproductible** — commandes exactes (seed, serveur 4071, `conformite-jury.js`, `captures-jury.js --largeur=`), versions (Edge, axe-core depuis `package-lock.json`, validateur Nu + date d'appel), périmètre (les 15 pages, jeu de démo), limite documentée : HTML sérialisé DOM vs source.
  2. **Validation W3C** — tableau 15 lignes : erreurs avant → après (0), avertissements restants justifiés un par un.
  3. **Responsive** — tableau par page × largeur avant → après, corrections apportées (fichier + nature), liens vers `captures/r320|r375|r768/`.
  4. **Accessibilité** — tableau par page : violations par impact avant → après, corrections apportées, violations restantes justifiées (id axe + raison).
  5. **Checklist clavier manuelle** (à dérouler avant la soutenance) : tabulation complète parcours candidat (annonces → détail → formulaire → envoi) et école (connexion → dashboard → acceptation), lien d'évitement au premier Tab, focus visible sur chaque arrêt, aucune souricière de focus, pad de signature = limite connue (souris/doigt — documentée, alternative import de fichier).
- [x] **Step 2:** Contrôle des liens relatifs du rapport (script des chantiers précédents). `npm test`. Cocher la Task 7, checkpoint README jury, puis :

```powershell
git add docs/jury/conformite.md docs/jury/README.md docs/superpowers/plans/2026-07-10-conformite-visible.md
git commit -m "Jury: rapport de conformite date (W3C, responsive, accessibilite)"
```

### Task 8: Cohérence finale et passation

**Files:**
- Modify: `docs/jury/audit-certification-dwwm.md`
- Modify: `docs/jury/README.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-07-10-conformite-visible.md` (tout coché)

- [x] **Step 1:** Audit : « Validation W3C » MANQUANT → VALIDÉ, « Interfaces responsives » et « Validateur d'accessibilité » À RENFORCER → VALIDÉ (constats sourcés vers [`conformite.md`](../../jury/conformite.md)) ; synthèse recomptée : **22 validés / 10 à renforcer / 1 manquant** (le manquant : veille technique anglophone) ; cases P1 cochées ; priorités restantes réordonnées (script de soutenance en tête).
- [x] **Step 2:** `docs/jury/README.md` : `conformite.md` ajouté aux documents de référence ; « Prochaine action recommandée » → script de soutenance ; checkpoint final réécrit (chantier livré, vérifications, premier travail restant). `AGENTS.md` : « Prochain travail » → script de soutenance (+ mention que les contrôles se relancent via `conformite-jury.js`).
- [x] **Step 3:** Contrôle global des liens sur tous les `.md` touchés (0 cassé attendu) ; `git status` (aucun fichier personnel) ; `npm test` + `npx prisma validate` ; cocher tout ce plan. Commit final :

```powershell
git add docs/jury/audit-certification-dwwm.md docs/jury/README.md AGENTS.md docs/superpowers/plans/2026-07-10-conformite-visible.md
git commit -m "Jury: conformite visible livree (audit + checkpoint a jour)"
```
