# Conformité W3C, responsive et accessibilité — rapport daté

Date des contrôles : 2026-07-10, rejoués intégralement le **2026-07-11** sur la
version mobile finale (burger accessible). Ce rapport archive les preuves demandées par
la checklist DWWM (page, méthode, résultat) pour les critères « Validation
W3C », « Interfaces responsives » et « Validateur d'accessibilité ».

## 1. Méthodologie reproductible

Périmètre : les **15 pages** du parcours réel (8 publiques, 6 école, 1 admin),
rendues avec le jeu de démonstration. Préparation :

```powershell
npm run seed:demo
$env:PORT='4071'; node src/server.js   # serveur dédié aux contrôles
```

Contrôles (résultats bruts JSON sous [`conformite/`](conformite/)) :

```powershell
node scripts/conformite-jury.js --controle=tout   # w3c | axe | debordement
node scripts/captures-jury.js --largeur=320 --sortie=docs/jury/captures/r320
node scripts/captures-jury.js --largeur=375 --sortie=docs/jury/captures/r375
node scripts/captures-jury.js --largeur=768 --sortie=docs/jury/captures/r768
```

Outils et versions : Microsoft Edge headless piloté en CDP
(`scripts/lib/cdp.js`), validateur **Nu du W3C** (https://validator.w3.org/nu/,
appelé le 2026-07-10, HTML posté en séquence avec 2 s de pause), **axe-core**
(devDependency, version exacte dans `package-lock.json`) injecté dans les
pages rendues. La détection de débordement compare désormais `scrollWidth` au
**viewport visuel** à 320, 375, 768 et 1440 px ; `innerWidth` n'est pas fiable
sous l'émulation mobile lorsque Chromium élargit le viewport de mise en page.

Limites documentées : le HTML validé est celui **sérialisé par le DOM** de la
page chargée (doctype rajouté), pas l'octet-à-octet servi par Express — des
normalisations d'attributs mineures sont possibles. Après toute modification
de vue, **redémarrer le serveur** avant de re-contrôler (cache des templates
Twig). L'état AVANT corrections est conservé dans
[`conformite/resume-avant-corrections.json`](conformite/resume-avant-corrections.json).

## 2. Validation W3C

Constat initial : 3 erreurs (inscription, contrat, compte) et 2 avertissements
(dashboard, admin). Corrections apportées :

| Problème | Pages | Correction |
|---|---|---|
| `autocomplete="street-address"` invalide sur un `input` monoligne | inscription, compte | Jeton monoligne valide `address-line1` (`views/auth/register.twig`, `views/dashboard/account.twig`) |
| `label for="signature-canvas"` : un canvas n'est pas un contrôle de formulaire | contrat (+ page de signature candidat, même gabarit) | Titre `span.label-titre` stylé comme un label + `aria-label` sur le canvas (`views/dashboard/contract_form.twig`, `views/tracking/sign.twig`, règle partagée dans `style.css`) |
| `<section>` sans titre (avertissement) | dashboard, admin | `div.stats-grid` à la place de `section` (`views/dashboard/index.twig`, `views/admin/dashboard.twig`) |

Résultat après corrections (re-validation Nu du 2026-07-10) :
**0 erreur et 0 avertissement sur les 15 pages.**

| Page | Erreurs avant | Après | Avertissements avant | Après |
|---|---:|---:|---:|---:|
| accueil | 0 | 0 | 0 | 0 |
| annonces | 0 | 0 | 0 | 0 |
| annonce-detail | 0 | 0 | 0 | 0 |
| carte | 0 | 0 | 0 | 0 |
| inscription | 1 | 0 | 0 | 0 |
| connexion | 0 | 0 | 0 | 0 |
| alertes | 0 | 0 | 0 | 0 |
| suivi | 0 | 0 | 0 | 0 |
| dashboard | 0 | 0 | 1 | 0 |
| mes-annonces | 0 | 0 | 0 | 0 |
| annonce-form | 0 | 0 | 0 | 0 |
| candidatures | 0 | 0 | 0 | 0 |
| contrat | 1 | 0 | 0 | 0 |
| compte | 1 | 0 | 0 | 0 |
| admin | 0 | 0 | 1 | 0 |

## 3. Responsive (320 / 375 / 768 / 1440 px)

### Correction du faux positif

Le contrôle initial concluait à 0/60 en comparant `scrollWidth` à
`window.innerWidth`. À une largeur demandée de 320 px, Chromium produisait par
exemple `visualViewport.width = 320`, mais `innerWidth = scrollWidth = 485` :
la page débordait pour l'utilisateur tout en passant le test. Le script de
capture utilisait aussi `--window-size`, qui règle la fenêtre extérieure et non
le viewport ; les dossiers `r320` et `r375` contenaient donc souvent les mêmes
PNG d'environ 485 px.

Corrections apportées :

- `conformite-jury.js` compare au viewport visuel et archive `viewportWidth` ;
- `captures-jury.js` impose `Emulation.setDeviceMetricsOverride` et masque les
  scrollbars pour conserver la largeur PNG demandée ;
- navigation burger accessible sous 600 px, avec repli progressif ;
- tableaux larges contenus dans `.table-scroll` ;
- empreintes SHA-256 sécables avec `overflow-wrap:anywhere` ;
- cartes, formulaires, filtres, graphiques et actions recomposés pour 320/375.

Passage final du **2026-07-11** sur la version mobile livrée : **0 débordement
sur les 60 combinaisons** (15 pages × 4 largeurs), chaque JSON archivant le
`viewportWidth` exact. Les **45 captures** ont été régénérées le même jour :
15 PNG de 320 px, 15 de 375 px et 15 de 768 px exactement, sans aucun doublon
binaire entre `r320` et `r375`. Le contrôle interactif du burger (ouverture au
clic, fermeture à Échap avec retour du focus, fermeture au clic extérieur,
aucun débordement menu ouvert) est passé sur six pages à 320 et 375 px.

## 4. Accessibilité (axe-core)

Constat initial : 2 violations distinctes, toutes de niveau **serious** :

| Violation axe | Pages | Correction |
|---|---|---|
| `color-contrast` : `.muted`, `.pagination-status`, pied de page sous 4,5:1 (tous via `var(--color-muted)`) | toutes (via le pied de page) | `--color-muted` #6b7280 → **#5b6470** (ratios calculés : 5,5:1 sur `--color-bg`, 6,0:1 sur blanc) + constante `MUTED` alignée dans `dashboard-charts.js` |
| `svg-img-alt` : SVG `role="img"` sans nom accessible | dashboard, admin (4 graphiques) | `aria-label` français sur chaque SVG généré (`public/js/dashboard-charts.js`, paramètre `libelle` de `renderBarChart`/`renderFunnel`) |

Résultat après corrections (re-run axe du 2026-07-10) : **0 violation sur les
15 pages** — tous niveaux confondus, pas seulement critical/serious ; aucune
violation restante à justifier.

JSON par page : `conformite/axe-<page>.json`. Acquis d'accessibilité déjà en
place et vérifiés dans les gabarits : lien d'évitement « Aller au contenu »
(`views/layouts/base.twig`), `:focus-visible` global et
`prefers-reduced-motion` (`public/css/style.css`), labels sur tous les champs,
régions `aria-live` pour les messages. Le #6b7280 restant dans
`src/services/mailer.js` concerne les gabarits d'email, hors périmètre des
pages auditées.

## 5. Checklist clavier manuelle (à dérouler avant la soutenance)

Ce qui ne s'automatise pas honnêtement — à vérifier à la main, navigateur
maximisé puis à 375 px :

1. **Lien d'évitement** : premier Tab sur chaque page → « Aller au contenu »
   apparaît, Entrée saute au contenu principal.
2. **Parcours candidat au clavier seul** : annonces → filtre/recherche →
   détail → formulaire de candidature (tous les champs et fichiers
   atteignables) → envoi.
3. **Parcours école au clavier seul** : connexion → tableau de bord →
   candidatures → formulaire d'acceptation.
4. **Focus visible** à chaque arrêt de tabulation (liseré bleu
   `:focus-visible`), y compris pagination et navigation.
5. **Burger mobile** à 320/375 : bouton annoncé « Ouvrir le menu »,
   `aria-expanded` passe à `true`, Échap ferme puis rend le focus au bouton ; un
   clic extérieur ferme également le panneau.
6. **Aucune souricière** : la tabulation traverse chaque page de bout en bout
   et en revient (Maj+Tab).
7. **Limite connue et assumée** : le pad de signature se dessine à la souris
   ou au doigt — alternative accessible : le bouton « Importer une
   signature » (fichier PNG/JPEG), atteignable au clavier. À dire au jury si
   la question vient.

## 6. Synthèse

- W3C : passage final du 2026-07-11 sur la version mobile livrée — 15/15 pages
  à **0 erreur, 0 avertissement**.
- Responsive : faux positif corrigé, passage final du 2026-07-11 à **0
  débordement sur 60 combinaisons** et 45 captures aux largeurs exactes.
- Accessibilité : passage axe du 2026-07-11 à **0 violation sur les 15 pages**,
  burger compris ; la checklist clavier manuelle (section 5) reste à dérouler
  par l'utilisateur avant la soutenance.
- Toutes les commandes sont reproductibles en section 1 pour produire des
  preuves fraîches à tout moment.
