# Responsive mobile et présentation jury — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser
> `superpowers:executing-plans`. Le dépôt impose un seul agent à la fois ;
> exécuter ce plan en ligne, sans délégation et sans staging partagé.

**Objectif :** Produire une interface volontairement conçue pour 320/375 px,
avec menu burger accessible, présentation centrée et preuves jury fiables, tout
en conservant le rendu desktop.

**Architecture :** La navigation Twig conserve une seule source de liens. Un
script navigateur sans dépendance ajoute le burger en amélioration progressive
et expose une petite fonction pure testable pour synchroniser classe CSS et
ARIA. Les styles mobiles restent sous `max-width: 600px`. Les scripts CDP
imposent ensuite les viewports exacts et régénèrent les preuves.

**Stack :** Node.js CommonJS, Express/Twig, JavaScript DOM sous CSP stricte, CSS
natif, Edge headless/CDP, axe-core, validateur Nu.

## Contraintes globales

- Spécification source :
  `docs/superpowers/specs/2026-07-10-responsive-mobile-presentation-design.md`.
- Tout ajout est en français côté interface et commentaires expliquant le pourquoi.
- TDD obligatoire pour le contrat HTML et la logique du menu.
- Aucun gestionnaire, style ou script inline ; aucune nouvelle dépendance.
- Le menu reste utilisable sans JavaScript et le desktop supérieur à 600 px ne
  change pas visuellement.
- Ne pas modifier les captures 1440 utilisées par le deck et la comparaison.
- Ne pas commiter ni stager sans demande explicite ; préserver les trois fichiers
  personnels non suivis.
- Redémarrer le serveur après toute modification Twig/CSS/JS avant les contrôles.

---

### Tâche 1 : Verrouiller le contrat HTML accessible du burger

**Fichiers :**
- Modifier : `test/ameliorations.cjs`
- Modifier : `views/partials/nav.twig`
- Modifier : `views/layouts/base.twig`

**Interfaces :**
- Produit : `button#navigation-toggle[aria-controls="navigation-principale"]`.
- Produit : `nav#navigation-principale` et chargement différé de
  `/js/mobile-nav.js`.

- [x] **Étape 1 — écrire le test rouge.** Après le démarrage du serveur dans
  `main()`, ajouter :

```js
const pageNavigationMobile = await req(makeJar(), 'GET', '/');
ok(pageNavigationMobile.status === 200
  && pageNavigationMobile.text.includes('id="navigation-toggle"')
  && pageNavigationMobile.text.includes('aria-expanded="false"')
  && pageNavigationMobile.text.includes('aria-controls="navigation-principale"')
  && pageNavigationMobile.text.includes('id="navigation-principale"')
  && pageNavigationMobile.text.includes('src="/js/mobile-nav.js"'),
'navigation mobile : contrat HTML accessible et script charge');
```

- [x] **Étape 2 — constater le rouge.** Exécuter
  `node test/ameliorations.cjs`. Attendu : échec sur le libellé ci-dessus car le
  bouton et le script n'existent pas.

- [x] **Étape 3 — implémenter le contrat minimal.** Dans `nav.twig`, entre la
  marque et la navigation, ajouter :

```twig
<button class="navbar-toggle" id="navigation-toggle" type="button"
        aria-expanded="false" aria-controls="navigation-principale"
        aria-label="Ouvrir le menu" hidden>
  <span aria-hidden="true"></span>
  <span aria-hidden="true"></span>
  <span aria-hidden="true"></span>
</button>
```

Ajouter `id="navigation-principale"` à la navigation existante. Dans
`base.twig`, ajouter avant le bloc `scripts` :

```twig
<script src="/js/mobile-nav.js" defer></script>
```

- [x] **Étape 4 — voir le premier contrat passer.** Créer provisoirement le
  fichier vide `public/js/mobile-nav.js` avec `apply_patch`, puis exécuter le test
  ciblé. Attendu : 33 assertions vertes. Le comportement vient dans la tâche 2.

### Tâche 2 : Développer la logique du menu en TDD

**Fichiers :**
- Modifier : `test/ameliorations.cjs`
- Modifier : `public/js/mobile-nav.js`

**Interfaces :**
- Produit : `setMenuState(navbar, toggle, open)` exportée sous Node et utilisée
  dans le navigateur.
- Produit : initialisation automatique au `DOMContentLoaded` ou immédiate avec
  un script `defer`.

- [x] **Étape 1 — écrire les trois assertions rouges.** Ajouter après le test HTML :

```js
const mobileNavPath = path.join(__dirname, '..', 'public', 'js', 'mobile-nav.js');
ok(fs.existsSync(mobileNavPath), 'navigation mobile : script statique present');
const { setMenuState } = require(mobileNavPath);
const classes = new Set();
const fauxHeader = { classList: {
  toggle: (nom, actif) => (actif ? classes.add(nom) : classes.delete(nom)),
  contains: (nom) => classes.has(nom),
} };
const attributs = {};
const fauxBouton = {
  setAttribute: (nom, valeur) => { attributs[nom] = valeur; },
  getAttribute: (nom) => attributs[nom],
};
setMenuState(fauxHeader, fauxBouton, true);
ok(classes.has('navbar-mobile-open')
  && attributs['aria-expanded'] === 'true'
  && attributs['aria-label'] === 'Fermer le menu',
'navigation mobile : ouverture synchronise classe et attributs ARIA');
setMenuState(fauxHeader, fauxBouton, false);
ok(!classes.has('navbar-mobile-open')
  && attributs['aria-expanded'] === 'false'
  && attributs['aria-label'] === 'Ouvrir le menu',
'navigation mobile : fermeture synchronise classe et attributs ARIA');
```

- [x] **Étape 2 — constater le rouge.** Exécuter le test ciblé. Attendu :
  `setMenuState is not a function`.

- [x] **Étape 3 — implémenter le script complet.** Écrire :

```js
'use strict';

function setMenuState(navbar, toggle, open) {
  navbar.classList.toggle('navbar-mobile-open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
}

function initMobileNav(doc, win) {
  var navbar = doc.querySelector('.navbar');
  var toggle = doc.getElementById('navigation-toggle');
  var nav = doc.getElementById('navigation-principale');
  if (!navbar || !toggle || !nav) return;

  toggle.hidden = false;
  navbar.classList.add('nav-enhanced');
  setMenuState(navbar, toggle, false);

  toggle.addEventListener('click', function () {
    setMenuState(navbar, toggle, toggle.getAttribute('aria-expanded') !== 'true');
  });
  doc.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenuState(navbar, toggle, false);
      toggle.focus();
    }
  });
  doc.addEventListener('click', function (event) {
    if (!navbar.contains(event.target)) setMenuState(navbar, toggle, false);
  });
  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) setMenuState(navbar, toggle, false);
  });
  var desktop = win.matchMedia('(min-width: 601px)');
  var fermeSurDesktop = function (event) {
    if (event.matches) setMenuState(navbar, toggle, false);
  };
  if (desktop.addEventListener) desktop.addEventListener('change', fermeSurDesktop);
  else desktop.addListener(fermeSurDesktop);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setMenuState: setMenuState, initMobileNav: initMobileNav };
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  initMobileNav(document, window);
}
```

- [x] **Étape 4 — voir le vert.** Exécuter le test ciblé. Attendu : 36
  assertions dans `ameliorations.cjs`, donc 448 dans la suite complète.

### Tâche 3 : Appliquer la composition mobile validée

**Fichiers :**
- Modifier : `public/css/style.css`
- Conserver : `views/dashboard/listings.twig`
- Conserver : `views/admin/schools.twig`

**Interfaces :**
- Consomme : `.nav-enhanced`, `.navbar-mobile-open`, `.navbar-toggle`.
- Produit : rendu mobile à une colonne sous 600 px, sans altération desktop.

- [x] **Étape 1 — consigner le rouge visuel.** Référence : anciennes captures
  `r320/r375` de 481–496 px, menu multiligne et observation utilisateur « pas du
  tout responsive ». Le contrôle corrigé doit rester basé sur `viewportWidth`.

- [x] **Étape 2 — restaurer le header desktop et ajouter le burger.** Hors media
  query, conserver le header original et ajouter les règles du bouton :

```css
.navbar { position: relative; }
.navbar-toggle {
  display: none;
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: #fff;
  color: var(--color-primary);
  cursor: pointer;
}
.navbar-toggle span {
  display: block;
  width: 20px;
  height: 2px;
  margin: 4px auto;
  border-radius: 999px;
  background: currentColor;
  transition: transform 0.18s ease, opacity 0.18s ease;
}
```

- [x] **Étape 3 — remplacer le media mobile provisoire par la composition
  validée.** Restaurer d'abord `.navbar`, `.navbar-links` et `.page-header` à
  leurs règles desktop d'origine (pas de `flex-wrap`/`gap` ajouté hors media
  query), puis remplacer le media mobile provisoire par :

```css
@media (max-width: 600px) {
  .navbar {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 0;
    padding: 0.5rem 1rem;
  }
  .navbar-brand {
    grid-column: 2;
    justify-self: center;
    text-align: center;
  }
  .navbar-toggle:not([hidden]) {
    display: block;
    grid-column: 3;
  }
  .navbar-links {
    position: relative;
    grid-column: 1 / -1;
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
    margin-top: 0.5rem;
    padding: 0.75rem 0 0.25rem 0.75rem;
    border-top: 1px solid var(--color-border);
  }
  .navbar-links::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.75rem;
    bottom: 0.25rem;
    width: 3px;
    border-radius: 999px;
    background: var(--color-primary);
  }
  .nav-enhanced .navbar-links { display: none; }
  .nav-enhanced.navbar-mobile-open .navbar-links { display: flex; }
  .navbar-links a,
  .navbar-links .link-button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    width: 100%;
    padding: 0.6rem 1rem;
    border-radius: var(--radius);
    text-align: center;
  }
  .navbar-links a:hover,
  .navbar-links .link-button:hover { background: #eff6ff; }
  .navbar-links .inline-form { display: block; width: 100%; }
  .navbar-mobile-open .navbar-toggle span:nth-child(1) {
    transform: translateY(6px) rotate(45deg);
  }
  .navbar-mobile-open .navbar-toggle span:nth-child(2) { opacity: 0; }
  .navbar-mobile-open .navbar-toggle span:nth-child(3) {
    transform: translateY(-6px) rotate(-45deg);
  }

  .container {
    width: 100%;
    max-width: 100%;
    margin: 1.25rem auto;
    padding: 0 1rem;
  }
  h1 { font-size: clamp(1.6rem, 8vw, 2.1rem); }
  .hero,
  .form-card,
  .listing-card,
  .application-card,
  .map-section,
  .chart-card,
  .purge-card { width: 100%; padding: 1.25rem; }
  .hero,
  .form-card h1,
  .form-card h2,
  .page-header { text-align: center; }
  .page-header {
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }
  .dashboard-actions,
  .view-toggle,
  .signature-actions,
  .application-actions {
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .page-header .btn,
  .dashboard-actions .btn,
  .view-toggle .btn,
  .signature-actions .btn,
  .application-actions .btn,
  .form-card .btn-primary {
    width: 100%;
    max-width: 320px;
    text-align: center;
  }
  .dashboard-actions .inline-form,
  .application-actions .inline-form { width: 100%; max-width: 320px; }
  .filter-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .filter-bar input,
  .filter-bar select,
  .filter-bar .btn { width: 100%; min-width: 0; }
  .stats-grid,
  .charts-grid { grid-template-columns: minmax(0, 1fr); }
  .listing-card-header,
  .application-head {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .listing-card-header > div:first-child { flex-basis: auto; }
  .listing-card-badges { justify-content: center; }
  #map,
  #listings-map { height: 360px; }
  .pagination { flex-wrap: wrap; }
  .footer { padding: 1.5rem 1rem; }
}
```

- [x] **Étape 4 — respecter le mouvement réduit.** Étendre la règle :

```css
@media (prefers-reduced-motion: reduce) {
  .skip-link,
  .navbar-toggle span { transition: none; }
}
```

- [x] **Étape 5 — vérifier le CSS et le HTML rendus.** Redémarrer le serveur,
  seeder après démarrage, puis exécuter le contrôle de débordement dans un
  dossier temporaire. Attendu : 0/60 avec `viewportWidth` exact.

### Tâche 4 : Vérifier visuellement et régénérer les preuves

**Fichiers :**
- Régénérer : `docs/jury/captures/r320/*.png`
- Régénérer : `docs/jury/captures/r375/*.png`
- Régénérer : `docs/jury/captures/r768/*.png`
- Régénérer : `docs/jury/conformite/*.json`

- [x] **Étape 1 — contrôle interactif.** Avec le navigateur local, contrôler à
  320 puis 375 px : accueil, annonces, suivi signé, dashboard, contrat et admin.
  Vérifier ouverture/fermeture du burger, Échap, focus, centrage, boutons,
  formulaires, tableaux et absence de contenu coupé.

- [x] **Étape 2 — régénérer les 45 PNG.** Lancer les trois commandes
  `captures-jury.js --largeur=...` vers les dossiers existants.

- [x] **Étape 3 — vérifier les dimensions binaires.** Attendu : quinze PNG de
  320 px, quinze de 375 px et quinze de 768 px ; aucun doublon binaire entre
  `r320` et `r375`.

- [x] **Étape 4 — contrôle visuel des livrables.** Ouvrir au minimum
  `r320/{accueil,annonces,suivi,dashboard,contrat,admin}.png` et les équivalents
  `r375`. Corriger puis régénérer si un alignement paraît accidentel.

- [x] **Étape 5 — rejouer la conformité complète.** Exécuter
  `conformite-jury.js --controle=tout` dans le dossier officiel. Attendu : W3C
  0/0, axe 0 violation, débordement 0/60 avec `viewportWidth` enregistré.

### Tâche 5 : Corriger tout le dossier actif et les restes de l'audit

**Fichiers :**
- Modifier : `README.md`, `AGENTS.md`, `.env.example`, `.gitignore`
- Modifier : `docs/jury/README.md`, `audit-certification-dwwm.md`,
  `conformite.md`, `resume-projet.md`, `competences-dwwm.md`,
  `base-de-donnees.md`
- Modifier : `docs/jury/soutenance/soutenance.html`,
  `docs/jury/soutenance/questions-reponses.md`
- Modifier : les trois liens cassés dans les plans du 2026-07-10.

- [x] **Étape 1 — preuves responsive.** Documenter le faux positif
  `innerWidth`, les corrections navigation/tableaux/SHA-256 et le protocole de
  régénération. Les captures et la vérification manuelle du burger restent
  explicitement en attente tant qu'aucun navigateur n'est disponible.
- [x] **Étape 2 — état et chiffres.** Remplacer les états intermédiaires
  `19/12/2`, les limites de session obsolètes et les compteurs actifs 438/442/444
  par **448 assertions**. Conserver les anciens chiffres dans les plans
  historiques lorsqu'ils décrivent réellement une étape passée.
- [x] **Étape 3 — périmètre.** Présenter **onze lots livrés** et le lot D réservé,
  au lieu de « douze lots livrés », dans le README, le résumé et le deck.
- [x] **Étape 4 — base de données.** Expliquer que le code Prisma est portable
  mais que les migrations SQLite ne se rejouent pas telles quelles sur
  PostgreSQL ; documenter une chaîne PostgreSQL dédiée, puis les commandes
  `sqlite3 .backup/.restore` et `pg_dump/pg_restore`. Garder la production réelle
  au statut « à renforcer ».
- [x] **Étape 5 — références et propreté locale.** Corriger le lien
  `.env.example` vers `docs/jury/base-de-donnees.md`, les trois liens Markdown
  cassés, puis ignorer explicitement `.claude/settings.local.json`,
  `contexte.md`, le classeur personnel, `tmp/`, `.agents/` et `.superpowers/`.

### Tâche 6 : Vérification finale et passation Claude

**Fichiers :**
- Modifier : `docs/jury/README.md`
- Modifier : ce plan et
  `docs/superpowers/plans/2026-07-10-corrections-audit-jury.md`

- [x] Exécuter `npm test` : 15 suites, 448 assertions, sortie 0.
- [x] Exécuter `npx prisma validate` : schéma valide.
- [x] Contrôler tous les liens Markdown et toutes les ressources locales HTML.
- [x] Exécuter `git diff --check` et inspecter le diff des vues/CSS/JS/docs.
- [x] Vérifier `git status --short` : aucun fichier personnel suivi ou stagé.
- [x] Cocher les deux plans, puis écrire le checkpoint final : comportement du
  burger, dimensions des captures, W3C/axe/responsive, tests, fichiers modifiés,
  serveur arrêté et seuls restes utilisateur (répétition, checklist clavier
  complète, décision de push/suppression des fichiers tiers).
