# Script de soutenance - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Le dépôt impose un seul agent actif : ne pas utiliser de sous-agents.

**Goal:** Produire tout le matériel de soutenance (deck 35 min, démo 11 min, Q/R, deux veilles), solder les contradictions documentaires (README, DESIGN) et le micro-fix Mailpit.

**Architecture:** Livrables sous `docs/jury/soutenance/` + `docs/jury/veille-*.md` ; deck HTML autonome (un fichier, CSS/JS embarqués, hors application donc sans contrainte CSP) réutilisant captures et diagrammes existants ; `DESIGN.md` classé en historique ; fabrique `buildTransportOptions` testable dans le mailer. Spec : `docs/superpowers/specs/2026-07-10-script-soutenance-design.md`.

**Tech Stack:** Markdown, HTML/CSS/JS vanilla (deck), Node.js, WebFetch/WebSearch (véracité des sources), Edge headless (contrôle visuel + PDF), PowerShell 5.1.

## Global Constraints

- **PASSATION CODEX** : à la fin de CHAQUE tâche — cocher les cases de la tâche dans ce plan, mettre à jour le « Dernier checkpoint » de `docs/jury/README.md`, commiter le tout dans le commit de la tâche.
- Branche `jury-script-soutenance` ; commits `Jury: ...` ; tout en français, typographie française.
- `npm test` (15 suites, 438 assertions) avant chaque commit.
- Ne jamais stager `contexte.md`, `Suivi_candidatures_stage_1_1_mails_plus_naturels_v3.xlsx`, `.claude/settings.local.json`.
- Toute URL citée dans les veilles est vérifiée en ligne (WebFetch) le jour de la rédaction — jamais de mémoire ; noter la date de consultation.
- Chiffres réels uniquement (438 assertions, 0 erreur W3C, 0 violation axe, 22 validés…) — jamais d'estimation.
- Les documents historiques sous `docs/historique/2026-06/` ne sont jamais modifiés (le déplacement de `DESIGN.md` VERS ce dossier est l'exception prévue ; son contenu reçoit uniquement le bandeau en tête).

---

### Task 1: Micro-fix Mailpit (TDD)

**Files:**
- Test: `test/ameliorations.cjs` (après le bloc « Gabarit HTML commun », ~ligne 207)
- Modify: `src/services/mailer.js:10-17` (+ exports)

**Interfaces:**
- Produces: `mailer.buildTransportOptions(env = process.env)` → `{ host, port, secure, auth? }` — `auth` absent si `env.SMTP_USER` est falsy.

- [x] **Step 1: Écrire le test qui échoue** — ajouter dans `test/ameliorations.cjs` après le bloc gabarit :

```js
    // --- Transport SMTP : auth seulement si SMTP_USER est défini (Mailpit) ---
    {
      const mailer = require('../src/services/mailer');
      ok(typeof mailer.buildTransportOptions === 'function', 'smtp : buildTransportOptions exportée');
      const sans = mailer.buildTransportOptions({ SMTP_HOST: 'localhost', SMTP_PORT: '1025' });
      ok(!('auth' in sans), 'smtp : pas de bloc auth sans SMTP_USER (Mailpit)');
      ok(sans.port === 1025 && sans.secure === false, 'smtp : port et sécurité conservés');
      const avec = mailer.buildTransportOptions({ SMTP_HOST: 'smtp.exemple.test', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p' });
      ok(avec.auth && avec.auth.user === 'u' && avec.secure === true, 'smtp : auth présent avec SMTP_USER');
    }
```

- [x] **Step 2: Le voir échouer** — `node test/ameliorations.cjs` → attendu : échec sur « buildTransportOptions exportée ». **Constaté (exit 1).**
- [x] **Step 3: Implémenter** — dans `src/services/mailer.js`, remplacer la construction du transport (lignes 10-17) par :

```js
// Options du transport SMTP. Le bloc `auth` n'est ajouté que si SMTP_USER est
// défini : Mailpit et les relais locaux n'ont pas d'authentification, et
// certains serveurs rejettent un bloc auth vide.
function buildTransportOptions(env = process.env) {
  const options = {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: Number(env.SMTP_PORT) === 465, // 465 = TLS direct, sinon STARTTLS
  };
  if (env.SMTP_USER) options.auth = { user: env.SMTP_USER, pass: env.SMTP_PASS };
  return options;
}

const transporter = SMTP_CONFIGURE ? nodemailer.createTransport(buildTransportOptions()) : null;
```

  et ajouter `buildTransportOptions` aux exports du module (fin de fichier).
- [x] **Step 4: Le voir passer** — `node test/ameliorations.cjs` → 30 assertions vertes (26 + 4). **La suite complète passe à 442 assertions.**
- [x] **Step 5:** `npm test` complet. Cocher la Task 1, checkpoint `docs/jury/README.md`, commit :

```powershell
git add test/ameliorations.cjs src/services/mailer.js docs/jury/README.md docs/superpowers/plans/2026-07-10-script-soutenance.md
git commit -m "Jury: transport SMTP sans auth quand SMTP_USER est absent (Mailpit)"
```

### Task 2: README réécrit et DESIGN.md classé en historique

**Files:**
- Rewrite: `README.md`
- Move: `docs/DESIGN.md` → `docs/historique/2026-06/DESIGN.md` (+ bandeau en tête)
- Modify: `docs/README.md` (ligne « DESIGN.md »), `docs/jury/README.md` (lien « Spécification historique » + point 3 du diagnostic), `docs/historique/2026-06/README.md` (ajouter DESIGN.md à l'inventaire)

- [x] **Step 1:** Réécrire `README.md` : présentation réelle (2 paragraphes — job board métier auto-écoles/moniteurs, MVP + lots A→L livrés, renvoi `docs/jury/resume-projet.md`) ; fonctionnalités livrées (liste ~10 puces) ; installation (`npm install`, copier `.env.example` → `.env`, `npx prisma migrate deploy`, `npx prisma generate`) ; commandes (`npm run dev`, `npm test`, `npm run seed:demo`, `npm run admin:create -- <email> <mdp>`, `npm run purge`) ; tests (15 suites / 438 assertions, TDD sans framework) ; documentation (liens `docs/README.md`, `docs/jury/README.md`, `AGENTS.md`) ; avertissement contrats indicatifs. Aucune mention de « squelette ».
- [x] **Step 2:** `Move-Item -LiteralPath docs/DESIGN.md docs/historique/2026-06/DESIGN.md` puis ajouter en tête du fichier déplacé le bandeau : `> **Document de cadrage initial (juin 2026), conservé comme preuve de conception.** L'état actuel de l'application est décrit dans [docs/jury/](../../jury/README.md) et [docs/jury/resume-projet.md](../../jury/resume-projet.md).` (vérifier la profondeur des liens relatifs depuis `docs/historique/2026-06/`).
- [x] **Step 3:** Mettre à jour les références : `docs/README.md` (décrire DESIGN.md comme historique, nouveau chemin), `docs/jury/README.md` (« Spécification historique : ../historique/2026-06/DESIGN.md » ; point 3 du « Diagnostic central » marqué réglé), `docs/historique/2026-06/README.md` (ligne d'inventaire pour DESIGN.md). Grep final `DESIGN\.md` : plus aucune référence active vers `docs/DESIGN.md` (les specs/plans archivés et `contexte.md` ne comptent pas).
- [x] **Step 4:** Contrôle des liens relatifs des fichiers touchés (script habituel — 0 cassé). `npm test` (15 suites, 442 assertions). Les mentions restantes de `docs/DESIGN.md` sont dans l'audit (traitées en Task 8) et dans des descriptions du présent chantier. Commit : `Jury: README reel + DESIGN.md classe en historique (bandeau, liens)`.

### Task 3: `docs/jury/veille-securite.md`

**Files:**
- Create: `docs/jury/veille-securite.md`

- [x] **Step 1:** Vérifier en ligne (WebFetch) les URLs sources. **Fait le 2026-07-10 : le Top 10 édition 2025 est sorti (A05 = Injection, A03 = Software Supply Chain Failures) ; cheat sheets CSRF/File Upload/Password Storage vérifiées avec faits précis (synchronizer token, magic bytes + stockage hors web, Argon2id > bcrypt facteur ≥ 10 / 72 octets).**
- [x] **Step 2:** Rédiger la fiche : introduction (méthode de veille : sources, fréquence, tri) puis un tableau ou une fiche par menace — **injection** (Prisma paramétré + validateurs), **XSS** (Twig autoescape + CSP `script-src 'self'` + usages `|raw` documentés), **CSRF** (jeton de session + multipart différé `verifyAfterUpload`), **uploads malveillants** (magic bytes, MIME, taille, stockage privé, noms régénérés), **force brute/énumération** (rate limiting, réponses neutres, dummy hash admin), **sessions** (régénération à la connexion, HTTP-only, sameSite, persistance, invalidation après reset), **mots de passe** (bcrypt + limite de longueur), **données personnelles** (purge RGPD journalisée, minimisation page de suivi). Chaque fiche : menace → source (URL + date) → impact ici → décision appliquée → preuve (fichier + test).
- [x] **Step 3:** Contrôle des liens et des chemins de preuve cités (Test-Path — tous présents). `npm test` (15 suites). Cocher, checkpoint, commit : `Jury: veille securite (menaces, sources datees, preuves)`.

### Task 4: `docs/jury/veille-technique.md` (solde le dernier MANQUANT)

**Files:**
- Create: `docs/jury/veille-technique.md`

- [ ] **Step 1:** Vérifier en ligne les sources anglophones et récupérer un fait récent exploitable par source : Node.js releases/LTS (https://nodejs.org/en/about/previous-releases), blog Express / doc 5.x (https://expressjs.com/), releases Prisma (https://github.com/prisma/prisma/releases), MDN (https://developer.mozilla.org/). Noter dates de consultation et versions constatées.
- [ ] **Step 2:** Rédiger : méthode de veille (quelles sources, en anglais, à quelle fréquence, comment trier) ; un tableau par source : URL, langue, fréquence, exemple d'information récente (version/annonce réelle constatée au Step 1), **implication concrète pour MoniteurConnect** (ex. : LTS visée en production, breaking changes Express 5 déjà absorbés — router, `req.query` ; suivi des majeures Prisma — la 7 est dispo, migration à planifier hors jury) ; paragraphe sur le niveau d'anglais mobilisé (lecture de documentation technique, critère B1/A2 du référentiel).
- [ ] **Step 3:** Contrôle des liens. `npm test`. Cocher, checkpoint, commit : `Jury: veille technique (sources officielles anglophones, dernier critere solde)`.

### Task 5: `docs/jury/soutenance/questions-reponses.md`

**Files:**
- Create: `docs/jury/soutenance/questions-reponses.md`

- [ ] **Step 1:** Rédiger ~30 questions/réponses groupées par thème (sécurité ; BDD/Prisma ; architecture/Express ; méthode/TDD ; RGPD ; front/accessibilité/responsive ; production/déploiement ; choix technologiques). Format : **Q** en gras, réponse 2-4 phrases honnête, « *Preuve :* fichier/test/page ». Inclure obligatoirement : pourquoi pas de framework front (SSR + CSP + besoin réel), sessions vs JWT (révocation, cookies HTTP-only, pas d'API tierce), POO ou pas (modules fonctionnels + `PrismaSessionStore extends Store`, assumé), pourquoi SQLite en dev (zéro install, bascule provider), qu'est-ce qui manque pour la prod (hébergement, PostgreSQL, SMTP réel, sauvegardes, logs — chantier identifié), validité juridique des contrats (modèles indicatifs, avertissement affiché), pourquoi pas de compte moniteur (choix produit central), que se passe-t-il si Nominatim/API Adresse/Sirene tombent (jamais bloquant, testé), comment sont protégées les pièces (stockage privé + scoping), pourquoi le pad n'est pas accessible clavier (limite assumée + import fichier).
- [ ] **Step 2:** Vérifier chaque chemin de preuve cité (Test-Path). `npm test`. Cocher, checkpoint, commit : `Jury: questions-reponses des 45 minutes (~30 Q/R avec preuves)`.

### Task 6: `docs/jury/soutenance/demo-11-minutes.md`

**Files:**
- Create: `docs/jury/soutenance/demo-11-minutes.md`

- [ ] **Step 1:** Rédiger : **Préparation** (la veille : `npm run seed:demo`, `npm run dev`, Mailpit lancé + `SMTP_HOST=localhost`/`SMTP_PORT=1025` dans `.env`, onglets pré-ouverts listés dans l'ordre, comptes vitrine/admin rappelés, zoom 125 %, notifications coupées) ; **Déroulé minuté** (tableau : minute cible, onglet/URL, action précise, phrase clé, critère couvert) sur le parcours : `/annonces` recherche ville+rayon → bascule carte → détail annonce phare (badge vérifié, carte) → candidature avec pièces (fichiers de démo préparés) → email Mailpit + `/suivi/<token>` → connexion école → candidatures → acceptation avec signature au pad → invitation → contreseing candidat (session neutralisée — le dire) → PDF final + empreintes → `/tableau-de-bord` (stats) → `/admin` (modération + purge en direct : l'alerte antidatée disparaît) ; **Scénario de secours** (ordre des captures 1440 px à montrer + `/suivi/<token du seed>` + PDF signé du dossier vitrine) ; **Reset** (`npm run seed:demo` recrée tout, y compris l'alerte purgeable).
- [ ] **Step 2:** Vérification scriptée : seed + serveur 4071, boucle `Invoke-WebRequest` sur chaque URL publique du déroulé (attendu : 200 partout ; les URLs école/admin sont couvertes par les captures existantes). Arrêter le serveur.
- [ ] **Step 3:** Contrôle des liens. `npm test`. Cocher, checkpoint, commit : `Jury: demo scenarisee 11 minutes (deroule, secours, reset)`.

### Task 7: `docs/jury/soutenance/soutenance.html` — le deck des 35 minutes

**Files:**
- Create: `docs/jury/soutenance/soutenance.html`

**Interfaces:**
- Consumes: `../captures/*.png`, `../diagrammes/bdd-v2.png`, `../../historique/2026-06/spec-assets/wf-*.png` (chemins relatifs depuis `docs/jury/soutenance/`), chiffres des documents jury.

- [ ] **Step 1:** Écrire le squelette (un seul fichier) :

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>MoniteurConnect — soutenance DWWM</title>
<style>
  /* Reprend la charte du site (style.css) : #2563eb, #1f2933, #f4f6f8. */
  * { box-sizing: border-box; margin: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; background: #1f2933; }
  .diapo { display: none; width: 100vw; height: 100vh; padding: 6vh 8vw;
           background: #f4f6f8; color: #1f2933; flex-direction: column; }
  .diapo.active { display: flex; }
  .diapo h1 { color: #2563eb; font-size: 2.6rem; margin-bottom: 1.2rem; }
  .diapo h2 { color: #2563eb; font-size: 2rem; margin-bottom: 1rem; }
  .diapo li { font-size: 1.35rem; line-height: 1.9; }
  .diapo img { max-width: 100%; max-height: 62vh; object-fit: contain;
               border: 1px solid #e5e7eb; border-radius: 6px; }
  .colonnes { display: flex; gap: 2rem; align-items: flex-start; }
  .pied { margin-top: auto; display: flex; justify-content: space-between;
          color: #5b6470; font-size: 0.95rem; }
  .notes { display: none; background: #fff8dc; border-left: 4px solid #c98a2b;
           padding: 0.8rem 1rem; margin-top: 1rem; font-size: 1.05rem; }
  body.avec-notes .notes { display: block; }
  @media print { .diapo { display: flex; page-break-after: always; height: auto;
                          min-height: 100vh; } .notes { display: block; } }
</style>
</head>
<body>
<!-- Une <section class="diapo" data-minutage="0–3 min"> par diapositive ;
     les notes orateur vont dans <aside class="notes">. -->
...diapositives...
<script>
  // Navigation : flèches / espace / clic = suivant, N = notes. Hors application
  // (fichier local autonome), donc pas de contrainte CSP.
  var diapos = Array.prototype.slice.call(document.querySelectorAll('.diapo'));
  var index = 0;
  function affiche(i) {
    index = Math.max(0, Math.min(diapos.length - 1, i));
    diapos.forEach(function (d, j) { d.classList.toggle('active', j === index); });
    diapos[index].querySelector('.compteur').textContent = (index + 1) + ' / ' + diapos.length;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') affiche(index + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') affiche(index - 1);
    else if (e.key === 'n' || e.key === 'N') document.body.classList.toggle('avec-notes');
  });
  document.addEventListener('click', function () { affiche(index + 1); });
  affiche(0);
</script>
</body>
</html>
```

  Chaque diapo porte un pied `<div class="pied"><span>{minutage section}</span><span class="compteur"></span></div>` et un `<aside class="notes">…</aside>`.
- [ ] **Step 2:** Rédiger les ~28 diapositives (contenu réel, chiffres réels, images relatives) selon ce découpage : 1 titre ; 2 problème ; 3 acteurs ; 4 solution (capture accueil) ; 5 périmètre livré A→L + 438 assertions ; 6 compétences REAC (2 blocs, renvoi matrice) ; 7 maquettes v1 (wf-annonces) ; 8 v1 vs final (wf + capture annonces, 2 colonnes) + écarts justifiés ; 9 charte (couleurs/composants) ; 10 architecture (routes→contrôleurs→services→vues) ; 11 technologies et justifications ; 12 environnements (dev/prod, .env, fail-fast) ; 13 méthode TDD (cycle spec→plan→impl, exemple lot G) ; 14 diagramme BDD v2 (image) ; 15 contraintes d'intégrité (3) + 13 migrations ; 16 SQLite→PostgreSQL ; 17 pivot démo (renvoi déroulé, 11 min) ; 18-20 filet de sécurité démo (captures carte / suivi+signature / dashboard+admin — à n'utiliser que si le direct casse) ; 21 focus signature : le flux de bout en bout ; 22 validation de l'image (magic bytes, 200 Ko) ; 23 PDF + SHA-256 + horodatages ; 24 contreseing + invalidation + 49 assertions ; 25 sécurité (8 mesures) ; 26 tests et conformité (15 suites/438, W3C 0/0, axe 0, responsive 0/60) ; 27 veilles (sécurité + technique EN, renvois) ; 28 limites + production + merci. Notes orateur : 2-4 phrases par diapo (ce qu'on dit, transition).
- [ ] **Step 3:** Vérifications : ouvrir dans Edge headless et capturer 3 diapositives (`--screenshot` sur `soutenance.html`, puis navigation CDP `affiche(13)` / `affiche(25)` + captures) — contrôle visuel Read ; export PDF `--print-to-pdf` non vide ; chaque `src`/`href` relatif du fichier existe (script Test-Path sur les attributs extraits par regex).
- [ ] **Step 4:** `npm test`. Cocher, checkpoint, commit : `Jury: deck de soutenance 35 min (HTML autonome, notes orateur, minutage)`.

### Task 8: Cohérence finale et clôture de la préparation jury

**Files:**
- Modify: `docs/jury/audit-certification-dwwm.md`
- Modify: `docs/jury/README.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-07-10-script-soutenance.md` (tout coché)

- [ ] **Step 1:** Audit : « Veille sécurité » À RENFORCER → VALIDÉ (constat → `veille-securite.md`) ; « Veille technique avec sources en anglais » MANQUANT → VALIDÉ (→ `veille-technique.md`) ; retirer les mentions « README/DESIGN obsolètes » des critères « Résumé du projet » (note d'action) et « Cohérence entre spécifications et application finale » (README réécrit, DESIGN classé — statut à réévaluer honnêtement) ; phrase de synthèse « Le produit est plus avancé que son dossier » à actualiser ; synthèse recomptée (recompter réellement les VALIDÉ/À RENFORCER/MANQUANT) ; cases P2 cochées (script oral, focus code, veille sécurité, veille technique, Mailpit) ; P0 « Actualiser README.md et docs/DESIGN.md » cochée.
- [ ] **Step 2:** `docs/jury/README.md` : indexer `soutenance/soutenance.html`, `soutenance/demo-11-minutes.md`, `soutenance/questions-reponses.md`, `veille-securite.md`, `veille-technique.md` ; « Prochaine action recommandée » → répétitions chronométrées + checklist clavier + décision de push ; checkpoint final (préparation jury documentaire TERMINÉE côté agent). `AGENTS.md` : « Prochain travail » → répétitions côté utilisateur ; plus de chantier documentaire planifié ; rappeler `npm run seed:demo` avant chaque répétition.
- [ ] **Step 3:** Contrôle global des liens sur tous les `.md` touchés du chantier ; `git status` (aucun fichier personnel) ; `npm test` + `npx prisma validate` ; cocher tout ce plan. Commit final : `Jury: script de soutenance livre (audit et checkpoint a jour)`.
