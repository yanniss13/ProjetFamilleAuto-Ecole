# Conformité W3C, responsive et accessibilité — rapport daté

Date des contrôles : 2026-07-10. Ce rapport archive les preuves demandées par
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
pages rendues, détection de débordement par comparaison
`scrollWidth`/`innerWidth` à 320, 375, 768 et 1440 px.

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

Détection automatique de débordement horizontal
(`scrollWidth > innerWidth`) : **aucun débordement sur les 60 combinaisons**
(15 pages × 4 largeurs), dès le premier constat — aucune correction
nécessaire. JSON par page : `conformite/debordement-<page>.json`.

Preuves visuelles : captures pleine page des 15 écrans à chaque largeur —
[`captures/r320/`](captures/r320/), [`captures/r375/`](captures/r375/),
[`captures/r768/`](captures/r768/), référence 1440 px sous
[`captures/`](captures/). Contrôle visuel par échantillon (annonces et
dashboard à 320, contrat à 375, admin à 768) : empilement propre, aucun
chevauchement, navigation et tableaux contenus.

Les grilles `auto-fit`/`minmax`, les formulaires fluides et `flex-wrap` de
`public/css/style.css` expliquent ce résultat.

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
5. **Aucune souricière** : la tabulation traverse chaque page de bout en bout
   et en revient (Maj+Tab).
6. **Limite connue et assumée** : le pad de signature se dessine à la souris
   ou au doigt — alternative accessible : le bouton « Importer une
   signature » (fichier PNG/JPEG), atteignable au clavier. À dire au jury si
   la question vient.

## 6. Synthèse

- W3C : 15/15 pages à 0 erreur, 0 avertissement (après 3 corrections).
- Responsive : 0 débordement sur 60 combinaisons, 45 captures archivées.
- Accessibilité : 0 violation axe (tous niveaux) après 2 corrections
  transverses ; limite du pad de signature documentée.
- Tout est re-jouable en quelques commandes (section 1) — y compris juste
  avant la soutenance pour des preuves fraîches.
