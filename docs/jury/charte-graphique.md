# Charte graphique — MoniteurConnect

Date : 2026-07-11. Cette charte formalise les décisions déjà centralisées dans
`public/css/style.css` (variables CSS sur `:root`). Le CSS reste la source de
vérité : toute évolution se fait là-bas, ce document s'aligne ensuite.

## 1. Palette

| Rôle | Variable | Valeur | Usage |
|---|---|---|---|
| Fond de page | `--color-bg` | `#f4f6f8` | arrière-plan général |
| Surface | `--color-surface` | `#ffffff` | cartes, barre de navigation |
| Texte | `--color-text` | `#1f2933` | texte courant |
| Texte atténué | `--color-muted` | `#5b6470` | légendes — 5,5:1 sur fond, 6:1 sur blanc (WCAG AA, vérifié axe) |
| Primaire | `--color-primary` | `#2563eb` | actions, liens, marque |
| Primaire foncé | `--color-primary-dark` | `#1d4ed8` | survol des actions |
| Succès | `--color-success-bg` / `--color-success-text` | `#dcfce7` / `#166534` | flashs et badges positifs |
| Erreur | `--color-error-bg` / `--color-error-text` | `#fee2e2` / `#991b1b` | flashs, badges refusés, bouton danger |
| Bordure | `--color-border` | `#e5e7eb` | séparations, champs |

Accents locaux hors variables : badge « assigné » `#dbeafe`/`#1e40af`,
« en attente » `#fef3c7`/`#92400e`, distance `#eef2ff`/`#3730a3`,
école vérifiée `#dcfce7`/`#166534`.

## 2. Typographie

- Pile système : `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  — aucun webfont (performance, CSP stricte, rendu natif par OS).
- Marque : 1,1 rem gras 700 ; titres en gras du même ton que le texte.
- Mobile : `h1 { font-size: clamp(1.6rem, 8vw, 2.1rem); }` sous 600 px.
- Chaînes techniques (empreintes SHA-256) : `overflow-wrap: anywhere`.

## 3. Formes et espacements

- Rayon unique : `--radius: 8px` (cartes, champs, boutons) ; pastilles et
  badges en `border-radius: 999px`.
- Cartes : fond blanc, bordure 1 px `--color-border`, padding ~1,25–1,5 rem.
- Cibles tactiles mobiles : hauteur minimale 44 px (boutons, liens du menu,
  bouton burger 44 × 44 px).

## 4. Composants

- **Boutons** : `.btn` neutre (blanc, bordure) ; `.btn-primary` plein
  `--color-primary`, survol `--color-primary-dark` ; `.btn-danger` plein
  `--color-error-text`. Sur mobile : pleine largeur, max 320 px, centrés.
- **Badges de statut** : `.badge-available` (succès), `.badge-assigned`
  (bleu), `.badge-pending` (ambre), `.badge-rejected` (erreur) — couleurs
  ci-dessus.
- **Messages flash** : `.flash-success` / `.flash-error`, annoncés en
  `aria-live`.
- **Formulaires** : labels systématiques, indices `.field-hint`
  (ok `#15803d`, alerte `#b45309`), erreurs à côté du champ.
- **Tableaux larges** : contenus dans `.table-scroll` (défilement interne,
  jamais de débordement de page).
- **Navigation mobile** : burger sous 600 px (`.navbar-toggle`), menu une
  colonne, marque centrée.

## 5. Accessibilité (règles non négociables)

- Focus visible partout : `:focus-visible { outline: 2px solid var(--color-primary); }`.
- Lien d'évitement `.skip-link` en premier élément focusable.
- `prefers-reduced-motion: reduce` désactive les transitions.
- Contrastes AA vérifiés par axe-core (0 violation au 2026-07-11) —
  toute nouvelle couleur de texte doit tenir 4,5:1 minimum.
- Le burger expose `aria-expanded`, `aria-controls` et un `aria-label`
  alterné (« Ouvrir/Fermer le menu ») ; Échap referme et rend le focus.

## 6. Preuves

Application de la charte visible dans les captures 1440 px
(`captures/`) et mobiles (`captures/r320`, `r375`, `r768`) ; contrastes et
noms accessibles contrôlés dans `conformite.md`.
