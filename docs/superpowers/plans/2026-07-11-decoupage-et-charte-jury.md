# Découpage fonctionnel et charte graphique — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Le dépôt
> impose un seul agent à la fois ; exécuter en ligne, sans délégation et sans
> staging partagé.

**Objectif :** Livrer les deux derniers critères facultatifs de l'audit jury —
un découpage fonctionnel des trois parcours (diagramme + lecture guidée) et une
charte graphique formalisée — puis passer l'audit à **32 validés / 1 à
renforcer / 0 manquant**.

**Architecture :** Chantier purement documentaire sous `docs/jury/`. Le
diagramme des parcours réutilise la grammaire visuelle de
`diagrammes/bdd-v2.svg` (SVG écrit à la main, PNG exporté par Edge headless).
La charte n'invente rien : elle extrait et documente les décisions déjà
présentes dans `public/css/style.css`, valeurs copiées à l'identique.

**Stack :** Markdown, SVG à la main, Edge headless (`--screenshot`), PowerShell
pour les vérifications. Aucune dépendance nouvelle.

## Contraintes globales

- Aucun code applicatif modifié : ni vue, ni CSS, ni JS, ni test. Serveur et
  `npm test` inutiles (ne pas casser l'état vert : 15 suites, 448 assertions).
- Ne pas toucher aux captures (`docs/jury/captures/`) ni aux JSON de
  conformité (`docs/jury/conformite/`) : ce sont des preuves datées du
  2026-07-11.
- Tout texte en français ; chaque valeur (hex, classe CSS, route) copiée
  verbatim depuis le dépôt — en cas de doute, vérifier dans le fichier source
  avant d'écrire, ne jamais inventer.
- Un commit par tâche, message au format `Jury: ...` sans accents (convention
  des commits récents). **Ne jamais pousser** (`git push` est une décision
  utilisateur).
- Ne jamais stager les fichiers personnels (`contexte.md`, classeur Excel,
  `.claude/settings.local.json`) — ils sont gitignorés, utiliser des chemins
  explicites dans `git add` par prudence.
- Après chaque document : vérifier que tous les liens relatifs pointent vers
  des fichiers existants.

---

### Tâche 1 : Découpage fonctionnel des trois parcours

**Fichiers :**
- Créer : `docs/jury/decoupage-fonctionnel.md`
- Créer : `docs/jury/diagrammes/parcours-fonctionnels.svg`
- Créer : `docs/jury/diagrammes/parcours-fonctionnels.png` (généré)

**Interfaces :**
- Consomme : grammaire visuelle de `docs/jury/diagrammes/bdd-v2.svg`
  (classes `.titre`, `.legende`, boîtes blanches à liseré `#3b5b8c`).
- Produit : `decoupage-fonctionnel.md` référencé ensuite par l'audit et le
  README jury (tâche 3).

- [x] **Étape 1 — écrire le SVG des trois couloirs.** Créer
  `parcours-fonctionnels.svg` (`viewBox="0 0 1900 860"` environ, fond blanc,
  `font-family="Segoe UI, Arial, sans-serif"`). Réutiliser le style de
  `bdd-v2.svg` : titre en `#1a4d8f` 22 px gras, légendes en `#5b6470` 12,5 px,
  boîtes blanches `stroke #3b5b8c`. Trois couloirs horizontaux étiquetés à
  gauche, boîtes reliées par des flèches gauche → droite (marker `path`
  triangle). Contenu exact des boîtes, dans l'ordre :

  **Couloir 1 — Candidat / moniteur (sans compte)** :
  `Accueil /` → `Annonces /annonces (mots-clés, département, ville + rayon, vue carte)`
  → `Détail /annonces/:id` → `Candidature (CV + pièces, contrôles magic bytes, CSRF)`
  → `Email avec lien de suivi opaque` → `Suivi /suivi/:token`
  → `Signature du contrat (pad ou import PNG)` → `PDF signé + empreinte SHA-256`.
  Boîte en dérivation sous le couloir : `Alertes email /alertes (double opt-in, désabonnement RGPD)`.

  **Couloir 2 — Auto-école (compte requis)** :
  `Inscription /inscription (SIRET Sirene, géocodage, vérification email)`
  → `Connexion /connexion` → `Tableau de bord /tableau-de-bord (statistiques)`
  → `Mes annonces (création, édition, clôture)` → `Candidatures (pièces téléchargeables)`
  → `Acceptation + contrat (identité, termes, signature école)`
  → `Envoi au candidat` → `Contrat contresigné (PDF final aux deux parties)`.
  Boîte en dérivation : `Mon compte /mon-compte (profil, adresse autocomplétée)`.

  **Couloir 3 — Administrateur (cloisonné)** :
  `Connexion /admin/connexion (session régénérée)` → `Dashboard /admin (statistiques plateforme, purge RGPD)`
  → `Écoles (suspension / réactivation)` → `Annonces (modération, retrait)`.

  Sous les couloirs, une ligne de légende : « Garde-fous transversaux : CSRF
  sur tout POST, scoping schoolId, CSP stricte, rate-limit, sessions Prisma. »

- [x] **Étape 2 — valider le XML et contrôler visuellement.** Exécuter
  `[xml](Get-Content docs/jury/diagrammes/parcours-fonctionnels.svg -Raw)` en
  PowerShell (échoue si le XML est invalide), puis lire le SVG avec l'outil
  Read pour un contrôle visuel : aucun texte tronqué ni chevauchement.

- [x] **Étape 3 — exporter le PNG.** Comme pour `bdd-v2.png` :

```powershell
$edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:/Program Files/Microsoft/Edge/Application/msedge.exe' }
& $edge --headless=new --screenshot="$PWD\docs\jury\diagrammes\parcours-fonctionnels.png" --window-size=1900,930 --default-background-color=FFFFFFFF "file:///$PWD/docs/jury/diagrammes/parcours-fonctionnels.svg"
```

  Attendu : PNG > 30 Ko ; le lire (Read) pour contrôle visuel.

- [x] **Étape 4 — écrire la lecture guidée.** Créer
  `docs/jury/decoupage-fonctionnel.md` sur ce squelette (compléter chaque
  parcours avec les étapes du diagramme, sans en ajouter) :

```markdown
# Découpage fonctionnel — les trois parcours

Date : 2026-07-11. Vue fonctionnelle destinée au jury : qui fait quoi, dans
quel ordre, et où chaque étape vit dans le code. Le découpage technique par
lots (A → L) reste documenté dans `resume-projet.md` et `AGENTS.md`.

![Les trois parcours fonctionnels](diagrammes/parcours-fonctionnels.png)

Source vectorielle : [`diagrammes/parcours-fonctionnels.svg`](diagrammes/parcours-fonctionnels.svg).

## 1. Parcours candidat / moniteur — sans compte

Le moniteur ne crée jamais de compte : tout passe par un jeton de suivi opaque
reçu par email. [décrire ici les 8 étapes du couloir 1, une phrase chacune,
avec la route et le contrôleur : src/controllers/pageController.js (accueil),
listingController.js (liste/détail/carte), applicationController.js
(candidature), trackingController.js (suivi), signatureController.js
(signature candidat), alertController.js (alertes)]

## 2. Parcours auto-école — compte requis

[décrire les 8 étapes du couloir 2 : authController.js
(inscription/connexion), dashboardController.js (tableau de bord),
listingController.js monté sous /mes-annonces via src/routes/manageRoutes.js,
applicationController.js (candidatures reçues), contractController.js
(contrat + signature école), accountController.js (mon compte)]

## 3. Parcours administrateur — cloisonné

[décrire les 4 étapes du couloir 3 : adminAuthController.js (connexion) et
adminController.js (dashboard, écoles, annonces, purge) ; rappeler que la
connexion admin régénère la session et ferme l'espace école]

## Garde-fous transversaux

- CSRF sur tous les POST (y compris multipart) ; CSP stricte sans inline.
- Cloisonnement : `requireAuth`, `requireAdmin`, scoping `schoolId` (une école
  reçoit 404 sur les documents d'une autre).
- Uploads : taille, mimetype et magic bytes vérifiés ; stockage hors public/.
- RGPD : purge automatique quotidienne + purge manuelle admin ;
  désabonnement des alertes en un clic.

Chaque étape est couverte par la suite de tests (15 fichiers, 448 assertions) —
la correspondance critère → test est dans `expression-du-besoin-v2.md`.
```

  Remplacer les trois blocs `[décrire ...]` par la prose réelle — vérifier
  chaque nom de contrôleur dans `src/controllers/` avant de l'écrire.

- [x] **Étape 5 — vérifier les liens et commiter.** Vérifier que les deux
  fichiers de diagramme existent et que le Markdown ne référence rien d'autre.
  Puis :

```powershell
git add docs/jury/decoupage-fonctionnel.md docs/jury/diagrammes/parcours-fonctionnels.svg docs/jury/diagrammes/parcours-fonctionnels.png
git commit -m "Jury: decoupage fonctionnel des trois parcours (diagramme + lecture guidee)"
```

### Tâche 2 : Charte graphique formalisée

**Fichiers :**
- Créer : `docs/jury/charte-graphique.md`
- Lire seulement : `public/css/style.css` (source de vérité, ne pas modifier)

**Interfaces :**
- Produit : `charte-graphique.md` référencé ensuite par l'audit et le README
  jury (tâche 3).

- [x] **Étape 1 — écrire le document.** Créer `docs/jury/charte-graphique.md`
  avec ce contenu (valeurs déjà vérifiées dans `style.css` au 2026-07-11 ;
  re-vérifier chaque hex avec `Select-String` avant d'écrire si le CSS a bougé) :

```markdown
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
```

- [x] **Étape 2 — vérifier chaque valeur contre le CSS.** Pour chaque hex et
  chaque classe citée, confirmer sa présence :

```powershell
Select-String -Path public/css/style.css -Pattern '#f4f6f8|#1f2933|#5b6470|#2563eb|#1d4ed8|#dcfce7|#166534|#fee2e2|#991b1b|#e5e7eb|#dbeafe|#1e40af|#fef3c7|#92400e|#eef2ff|#3730a3|#15803d|#b45309' | Measure-Object
Select-String -Path public/css/style.css -Pattern '\.badge-available|\.badge-pending|\.table-scroll|\.skip-link|\.navbar-toggle|focus-visible|prefers-reduced-motion' | Measure-Object
```

  Attendu : chaque motif trouvé au moins une fois. Corriger le document si un
  motif manque (ne jamais « corriger » le CSS).

- [x] **Étape 3 — commiter.**

```powershell
git add docs/jury/charte-graphique.md
git commit -m "Jury: charte graphique formalisee depuis style.css"
```

### Tâche 3 : Passer l'audit à 32/1/0 et aligner le dossier

**Fichiers :**
- Modifier : `docs/jury/audit-certification-dwwm.md`
- Modifier : `docs/jury/README.md`
- Modifier : `AGENTS.md`
- Modifier : ce plan (cocher les cases)

- [x] **Étape 1 — les deux lignes de l'audit.** Dans le tableau « Audit du
  dossier projet » :
  - Ligne « Découpage fonctionnel avec descriptions (facultatif) » :
    statut `À RENFORCER` → `VALIDÉ` ; constat →
    « [`decoupage-fonctionnel.md`](decoupage-fonctionnel.md) (2026-07-11) :
    diagramme des trois parcours (candidat, auto-école, administrateur) avec
    routes réelles et lecture guidée contrôleur par contrôleur. » ; action →
    « Dérouler le diagramme en 60 secondes pendant la partie conception. »
  - Ligne « Charte graphique (facultative) » : statut `À RENFORCER` →
    `VALIDÉ` ; constat → « [`charte-graphique.md`](charte-graphique.md)
    (2026-07-11) : palette avec ratios WCAG, typographie système, composants
    et règles d'accessibilité extraits de `public/css/style.css`. » ; action →
    « Citer la règle des 4,5:1 si la question du choix des couleurs vient. »

- [x] **Étape 2 — la synthèse de l'audit.** Remplacer « **30 sont validés** …
  **3 sont à renforcer** — deux critères facultatifs (découpage fonctionnel
  destiné au jury, charte graphique formalisée) et l'environnement de
  production démontré » par « **32 sont validés** … **1 est à renforcer** —
  l'environnement de production démontré (déploiement PostgreSQL réel et
  exercice de restauration) ». Adapter la phrase « 2 facultatifs + prod »
  partout où elle apparaît dans l'audit.

- [x] **Étape 3 — README jury et AGENTS.** Dans `docs/jury/README.md` :
  ajouter les deux documents à la liste « Dossier consolidé » (avec le
  diagramme), passer « 30 validés / 3 à renforcer » à « 32 validés / 1 à
  renforcer », et ajouter une ligne au checkpoint final (action terminée du
  2026-07-11, fichiers créés, audit 32/1/0). Dans `AGENTS.md` : remplacer
  « 30 validés / 3 à renforcer » par « 32 validés / 1 à renforcer ».

- [x] **Étape 4 — vérifier les liens des fichiers touchés.** Pour chaque lien
  Markdown relatif ajouté ou modifié dans les trois fichiers, vérifier que la
  cible existe sur le disque. Vérifier aussi `git status --short` : seuls les
  fichiers du plan apparaissent, aucun fichier personnel.

- [x] **Étape 5 — cocher ce plan et commiter.**

```powershell
git add docs/jury/audit-certification-dwwm.md docs/jury/README.md AGENTS.md docs/superpowers/plans/2026-07-11-decoupage-et-charte-jury.md
git commit -m "Jury: audit a 32 valides / 1 a renforcer (decoupage + charte livres)"
```

  Puis annoncer à l'utilisateur : audit à 32/1/0, seuls restes = production
  démontrée (agent) et répétitions/checklist clavier/décision de push
  (utilisateur). **Ne pas pousser.**
