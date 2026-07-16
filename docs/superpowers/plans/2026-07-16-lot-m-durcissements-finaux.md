# Lot M — durcissements finaux BFCache et session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rétablir automatiquement le flux temps réel après un retour BFCache et préserver la page de suivi lorsque la sauvegarde explicite de son autorisation temps réel échoue.

**Architecture:** Le client remplace son couple de gestionnaires de cycle de vie à chaque restauration BFCache, puis recrée une connexion qui réutilise le rattrapage `onopen`. La liaison candidat restaure exactement l'état MRU précédent si `session.save()` échoue ; seul cet échec est absorbé par le contrôleur, afin que la page reste accessible et que le flux suivant réponde 204.

**Tech Stack:** Node.js 22.18+, CommonJS, Express 5, express-session, JavaScript navigateur, EventSource natif, `node:vm`, tests `.cjs` maison.

## Global Constraints

- Tout texte utilisateur, commentaire et message de commit reste en français.
- Aucun nouveau paquet ni changement Prisma.
- Aucun rechargement complet de page au retour BFCache.
- Le rollback MRU est motivé par le déterminisme, jamais présenté comme une barrière de sécurité.
- Le `catch` dégradable entoure uniquement `bindRealtimeApplication`.
- TDD obligatoire : chaque test doit échouer pour la cause attendue avant le code de production.
- Le contrôle réel navigateur/téléphone reste une preuve manuelle distincte de la simulation `vm`.

---

### Task 1: Recréer une connexion unique au retour BFCache

**Files:**
- Modify: `test/lot-m.cjs:331-370,858-1150`
- Modify: `public/js/realtime.js:196-225`

**Interfaces:**
- Consumes: `startRealtime(context, doc, win, fetchImpl, EventSourceCtor, ParserCtor)` et son rattrapage existant dans `source.onopen`.
- Produces: un cycle `pagehide` → `pageshow({ persisted: true })` qui ferme l'ancienne source, retire ses gestionnaires et en crée exactement une nouvelle.

- [x] **Step 1: Étendre le faux `window` et écrire le test BFCache RED**

Dans `loadRealtimeScript`, remplacer le faux `window` sans état par un registre de gestionnaires :

```js
  const windowListeners = Object.create(null);
  const win = {
    addEventListener(name, callback) {
      if (!windowListeners[name]) windowListeners[name] = new Set();
      windowListeners[name].add(callback);
    },
    removeEventListener(name, callback) {
      if (windowListeners[name]) windowListeners[name].delete(callback);
    },
  };
  function dispatchWindowEvent(name, event = {}) {
    for (const callback of Array.from(windowListeners[name] || [])) callback(event);
  }
```

Retourner `dispatchWindowEvent` et ajouter des assertions qui prouvent :

```js
    const bfcacheDom = makeRealtimeDom();
    let bfcacheFetches = 0;
    const bfcacheBrowser = loadRealtimeScript(bfcacheDom, async () => {
      bfcacheFetches += 1;
      return fragmentResponse();
    });
    bfcacheBrowser.dispatchWindowEvent('pagehide', { persisted: true });
    bfcacheBrowser.dispatchWindowEvent('pageshow', { persisted: false });
    ok(bfcacheBrowser.sources[0].closed && bfcacheBrowser.sources.length === 1,
      'js vm bfcache : pagehide ferme la source et pageshow ordinaire ne recree rien');

    bfcacheBrowser.dispatchWindowEvent('pageshow', { persisted: true });
    bfcacheBrowser.sources[1].open();
    ok(await eventually(() => bfcacheFetches === 1)
      && bfcacheBrowser.sources.length === 2
      && !bfcacheBrowser.sources[1].closed,
    'js vm bfcache : retour persistant recree une source et rattrape le fragment');

    bfcacheBrowser.dispatchWindowEvent('pagehide', { persisted: true });
    bfcacheBrowser.dispatchWindowEvent('pageshow', { persisted: true });
    ok(bfcacheBrowser.sources.length === 3
      && bfcacheBrowser.sources[1].closed
      && !bfcacheBrowser.sources[2].closed,
    'js vm bfcache : cycles successifs gardent une seule nouvelle source');
```

- [x] **Step 2: Exécuter le test et constater l'échec attendu**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: échec sur la première assertion qui attend une deuxième source après `pageshow` persistant ; le code courant ne possède aucun gestionnaire `pageshow`.

- [x] **Step 3: Implémenter le remplacement des gestionnaires de cycle**

À la fin de `startRealtime`, remplacer le seul branchement `pagehide` par :

```js
    function handlePagehide() {
      closeSource();
    }

    function handlePageshow(event) {
      if (!event || event.persisted !== true) return;
      win.removeEventListener('pagehide', handlePagehide);
      win.removeEventListener('pageshow', handlePageshow);
      startRealtime(context, doc, win, fetchImpl, EventSourceCtor, ParserCtor);
    }

    win.addEventListener('pagehide', handlePagehide);
    win.addEventListener('pageshow', handlePageshow);
```

La recréation est inconditionnelle pour `persisted === true`. Le nouveau
`source.onopen` conserve le rattrapage existant sans autre code.

- [x] **Step 4: Rejouer Lot M et vérifier le passage GREEN**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: sortie 0 ; trois nouvelles assertions BFCache vertes et une seule source créée par cycle.

- [x] **Step 5: Commit ciblé**

```powershell
git add -- public/js/realtime.js test/lot-m.cjs
git commit -m "M: retablir le flux apres un retour bfcache"
```

---

### Task 2: Dégrader uniquement l'échec de liaison temps réel

**Files:**
- Modify: `test/lot-m.cjs:16-30,600-675`
- Modify: `src/controllers/trackingController.js:5-36`

**Interfaces:**
- Consumes: `bindRealtimeApplication(req, applicationId)` et `PrismaSessionStore.prototype.set(sid, session, callback)`.
- Produces: rollback exact de `req.session.realtimeApplicationIds` sur échec explicite, page de suivi 200 et flux candidat 204.

- [x] **Step 1: Écrire le scénario HTTP RED avec une panne unique du store**

Importer le store puis intercepter uniquement la première écriture qui contient
l'identifiant ciblé :

```js
const PrismaSessionStore = require('../src/config/sessionStore');
```

Après la création d'une candidature candidat, établir d'abord une session sans
autorisation, puis exécuter :

```js
    const degradedJar = makeJar();
    await req(degradedJar, 'GET', '/');
    const originalSessionSet = PrismaSessionStore.prototype.set;
    let failedRealtimeSave = 0;
    PrismaSessionStore.prototype.set = function failTargetedRealtimeSave(sid, sessionData, callback) {
      if (failedRealtimeSave === 0
          && Array.isArray(sessionData.realtimeApplicationIds)
          && sessionData.realtimeApplicationIds.includes(displayedApplication.id)) {
        failedRealtimeSave += 1;
        return callback(new Error('Panne simulee du save temps reel'));
      }
      return originalSessionSet.call(this, sid, sessionData, callback);
    };
    let degradedPage;
    try {
      degradedPage = await req(
        degradedJar,
        'GET',
        `/suivi/${displayedApplication.trackingToken}`
      );
    } finally {
      PrismaSessionStore.prototype.set = originalSessionSet;
    }
    const degradedStream = await openSse(
      degradedJar,
      `/suivi/temps-reel/${displayedApplication.id}`
    );
    ok(failedRealtimeSave === 1 && degradedPage.status === 200,
      'candidat degrade : echec du save temps reel conserve la page de suivi');
    ok(degradedStream.response.statusCode === 204,
      'candidat degrade : rollback deterministe laisse le flux non autorise');
    degradedStream.request.destroy();
```

Le remplacement du prototype doit toujours être restauré dans `finally`.

- [x] **Step 2: Exécuter le test et constater l'échec attendu**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: la page répond 500, car l'erreur de `bindRealtimeApplication` atteint encore le gestionnaire Express global.

- [x] **Step 3: Rendre la liaison transactionnelle en mémoire**

Dans `bindRealtimeApplication`, conserver la présence et la valeur précédentes,
puis les restaurer uniquement sur rejet du `save()` :

```js
  const hadPreviousIds = Object.prototype.hasOwnProperty.call(
    req.session,
    'realtimeApplicationIds'
  );
  const previousIds = req.session.realtimeApplicationIds;
  // Construction MRU existante, puis affectation de la nouvelle liste.
  try {
    await saveSession(req);
  } catch (err) {
    // Le rollback rend l'issue déterministe si l'auto-sauvegarde Express réussit ensuite.
    if (hadPreviousIds) req.session.realtimeApplicationIds = previousIds;
    else delete req.session.realtimeApplicationIds;
    throw err;
  }
```

- [x] **Step 4: Limiter le `catch` dégradable à l'appel de liaison**

Dans `show`, conserver la recherche et le rendu dans le `try` extérieur, mais
absorber seulement la liaison :

```js
    try {
      await bindRealtimeApplication(req, application.id);
    } catch (err) {
      console.error('Autorisation temps reel candidat non persistee :', err);
    }
    res.render('tracking/show', { title: 'Suivi de candidature', application });
```

Ne déplacer ni `findByTrackingToken`, ni `res.render` dans ce `catch` interne.

- [x] **Step 5: Rejouer Lot M et les gardes historiques**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
& "C:\nvm4w\nodejs\node.exe" test/lot-b.cjs
& "C:\nvm4w\nodejs\node.exe" test/lot-g.cjs
```

Expected: trois sorties 0 ; page dégradée 200, flux 204, suivi historique et signature inchangés.

- [x] **Step 6: Commit ciblé**

```powershell
git add -- src/controllers/trackingController.js test/lot-m.cjs
git commit -m "M: degrader proprement la liaison temps reel"
```

---

### Task 3: Vérification finale et fusion locale

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-lot-m-durcissements-finaux.md` — cocher les étapes exécutées.

**Interfaces:**
- Consumes: les deux commits correctifs et la branche propre `lot-m-temps-reel`.
- Produces: branche `prisma-7` fusionnée et vérifiée, puis worktree et branche de fonctionnalité supprimés.

- [x] **Step 1: Lancer les preuves fraîches dans le worktree**

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
& "C:\nvm4w\nodejs\npm.cmd" test
& "C:\nvm4w\nodejs\npx.cmd" prisma validate
git diff --check
git status --short
```

Expected: Lot M et les 16 fichiers verts, Prisma valide, aucun diff invalide et worktree propre.

- [x] **Step 2: Demander une revue ciblée des deux correctifs**

Le relecteur contrôle les courses de gestionnaires BFCache, le rattrapage
`onopen`, la portée exacte du `catch`, le rollback pour déterminisme et la preuve
HTTP 200 → SSE 204.

Expected: aucune remarque critique ou importante avant fusion.

- [x] **Step 3: Fusionner localement dans `prisma-7`**

Depuis le dépôt principal, fusionner `lot-m-temps-reel` dans `prisma-7` sans
pull ni push, puisque la base locale est la source convenue :

```powershell
git merge lot-m-temps-reel
```

- [x] **Step 4: Vérifier le résultat fusionné**

```powershell
& "C:\nvm4w\nodejs\npm.cmd" test
& "C:\nvm4w\nodejs\npx.cmd" prisma validate
git status --short
```

Expected: suite complète et Prisma verts sur `prisma-7`, arbre propre.

- [x] **Step 5: Supprimer le worktree puis la branche fusionnée**

Depuis la racine principale uniquement :

```powershell
git worktree remove "C:\Users\yanni\Desktop\moniteur-connect\worktrees\lot-m-temps-reel"
git worktree prune
git branch -d lot-m-temps-reel
```

Expected: seul le worktree principal reste ; `prisma-7` contient les commits du Lot M.
