# Wireframes v2 exhaustifs — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Le dépôt
> impose un seul agent à la fois : ne pas déléguer et ne jamais partager le
> staging.

**Objectif :** Livrer 30 écrans/états filaires v2 fonctionnellement conformes
à l'application, avec navigation, matrice de traçabilité, PNG, planche SVG et
PDF, sans modifier les wireframes v1 ni le code produit.

**Architecture :** Un manifeste CommonJS décrit chaque écran et ses métadonnées.
Un générateur documentaire produit les 30 HTML à partir de composants partagés
et d'un CSS filaire unique. Des scripts locaux vérifient la couverture, les
liens et les formulations interdites, puis Edge headless produit les PNG ; un
générateur PDF assemble les exports contrôlés.

**Stack :** Node.js CommonJS pour la génération et les contrôles, HTML/CSS
statiques, SVG, Edge headless, Python/reportlab pour le PDF déjà disponible
dans l'environnement. Aucune dépendance du projet ajoutée.

## Contraintes globales

- Ne jamais modifier `docs/historique/2026-06/`, ses wireframes, ses PNG/SVG/PDF.
- Ne modifier aucun fichier sous `src/`, `public/`, `test/`, `prisma/` ou `storage/`.
- Ne jamais modifier `docs/jury/captures/` ni `docs/jury/conformite/`.
- Les sorties v2 vivent uniquement sous `docs/jury/wireframes-v2/`.
- Tout texte est en français et toute route/vue citée est vérifiée dans le dépôt.
- Aucun écran ne montre une réouverture d'annonce, un filtre de candidature par
  statut, un changement de mot de passe dans Mon compte ou une suppression
  d'école par l'admin.
- Les HTML sont filaires gris mais les champs, actions, états et navigations
  correspondent exactement au produit livré.
- Les captures v2 sont à 1440 px ; elles ne remplacent aucune capture finale.
- Un commit par tâche, message `Jury: ...` sans accents ; ne jamais pousser.
- `git add` utilise exclusivement des chemins explicites.

---

### Tâche 1 : Manifeste, squelette et contrôle de couverture

**Fichiers :**
- Créer : `docs/jury/wireframes-v2/screens.cjs`
- Créer : `docs/jury/wireframes-v2/tools/check-wireframes.cjs`
- Créer : `docs/jury/wireframes-v2/tools/generate.cjs`
- Créer : `docs/jury/wireframes-v2/wireframe-v2.css`
- Créer : `docs/jury/wireframes-v2/index.html` (généré)

**Interfaces :**
- Produit : `screens` (`Array<Screen>`) où chaque `Screen` possède `id`,
  `filename`, `title`, `role`, `route`, `view`, `state`, `capture`, `section`
  et `body`.
- Produit : `renderScreen(screen): string`, `renderIndex(screens): string` et
  `writeAll(): void` exportés par `tools/generate.cjs`.
- Consomme ensuite : toutes les tâches ajoutent les écrans à `screens.cjs` et
  relancent `node docs/jury/wireframes-v2/tools/generate.cjs`.

- [ ] **Étape 1 — écrire le contrôle qui échoue sans les 30 écrans.** Le script
  charge `screens.cjs`, vérifie l'unicité des `id`/`filename`, le préfixe
  `wf-v2-`, les 30 identifiants attendus ci-dessous, les champs obligatoires,
  l'existence du HTML généré et l'absence des formulations interdites.

```js
const EXPECTED = [
  'accueil','annonces','carte','annonce-detail','alertes','alerte-confirmee',
  'alerte-desabonnement','alerte-supprimee','connexion','inscription',
  'email-verifie','mot-de-passe-oublie','reinitialisation','suivi-attente','suivi-refuse','suivi-accepte',
  'signature-candidat','suivi-signe','dashboard-ecole','mes-annonces',
  'annonce-creation','annonce-modification','candidatures','contrat-ecole',
  'mon-compte','connexion-admin','dashboard-admin','admin-ecoles',
  'admin-annonces','etats-systeme'
];
const FORBIDDEN = [
  'Rouvrir', 'Filtrer par statut', 'Modifier le mot de passe depuis Mon compte',
  'Supprimer cette école'
];
```

  Le script sort `Wireframes v2 : 30/30 écrans, liens et formulations valides.`
  uniquement si toutes les assertions passent.

- [ ] **Étape 2 — exécuter le contrôle et constater l'échec initial.**

```powershell
node docs/jury/wireframes-v2/tools/check-wireframes.cjs
```

  Attendu : sortie 1 avec `screens.cjs` absent ou `0/30 écrans`.

- [ ] **Étape 3 — créer le manifeste avec les 30 entrées et leurs sources.**
  Utiliser exactement cette cartographie :

| ID | Fichier | Rôle | Route | Vue/source |
|---|---|---|---|---|
| accueil | `wf-v2-01-accueil.html` | public | `GET /` | `index.twig` |
| annonces | `wf-v2-02-annonces.html` | public | `GET /annonces` | `listings/index.twig` |
| carte | `wf-v2-03-carte.html` | public | `GET /annonces?vue=carte` | `listings/index.twig` |
| annonce-detail | `wf-v2-04-annonce-detail.html` | public | `GET /annonces/:id` | `listings/show.twig` |
| alertes | `wf-v2-05-alertes.html` | public | `GET /alertes` | `alerts/new.twig` |
| alerte-confirmee | `wf-v2-06-alerte-confirmee.html` | public | `GET /alertes/confirmer/:token` | `alerts/confirmed.twig` |
| alerte-desabonnement | `wf-v2-07-alerte-desabonnement.html` | public | `GET /alertes/desabonner/:token` | `alerts/unsubscribe.twig` |
| alerte-supprimee | `wf-v2-08-alerte-supprimee.html` | public | `POST /alertes/desabonner/:token` | `alerts/unsubscribed.twig` |
| connexion | `wf-v2-09-connexion.html` | public | `GET /connexion` | `auth/login.twig` |
| inscription | `wf-v2-10-inscription.html` | public | `GET /inscription` | `auth/register.twig` |
| email-verifie | `wf-v2-11-email-verifie.html` | public | `GET /verifier-email/:token` | `auth/verify-notice.twig` |
| mot-de-passe-oublie | `wf-v2-12-mot-de-passe-oublie.html` | public | `GET /mot-de-passe-oublie` | `auth/forgot.twig` |
| reinitialisation | `wf-v2-13-reinitialisation.html` | public | `GET /reinitialiser/:token` | `auth/reset.twig` |
| suivi-attente | `wf-v2-14-suivi-attente.html` | candidat | `GET /suivi/:token` | `tracking/show.twig` |
| suivi-refuse | `wf-v2-15-suivi-refuse.html` | candidat | `GET /suivi/:token` | `tracking/show.twig` |
| suivi-accepte | `wf-v2-16-suivi-accepte.html` | candidat | `GET /suivi/:token` | `tracking/show.twig` |
| signature-candidat | `wf-v2-17-signature-candidat.html` | candidat | `GET /suivi/:token/signer` | `tracking/sign.twig` |
| suivi-signe | `wf-v2-18-suivi-signe.html` | candidat | `GET /suivi/:token` | `tracking/show.twig` |
| dashboard-ecole | `wf-v2-19-dashboard-ecole.html` | école | `GET /tableau-de-bord` | `dashboard/index.twig` |
| mes-annonces | `wf-v2-20-mes-annonces.html` | école | `GET /mes-annonces` | `dashboard/listings.twig` |
| annonce-creation | `wf-v2-21-annonce-creation.html` | école | `GET /mes-annonces/nouvelle` | `dashboard/listing_form.twig` |
| annonce-modification | `wf-v2-22-annonce-modification.html` | école | `GET /mes-annonces/:id/modifier` | `dashboard/listing_form.twig` |
| candidatures | `wf-v2-23-candidatures.html` | école | `GET /mes-annonces/:id/candidatures` | `dashboard/applications.twig` |
| contrat-ecole | `wf-v2-24-contrat-ecole.html` | école | `GET /mes-annonces/:id/candidatures/:appId/accepter` | `dashboard/contract_form.twig` |
| mon-compte | `wf-v2-25-mon-compte.html` | école | `GET /mon-compte` | `dashboard/account.twig` |
| connexion-admin | `wf-v2-26-connexion-admin.html` | admin | `GET /admin/connexion` | `admin/login.twig` |
| dashboard-admin | `wf-v2-27-dashboard-admin.html` | admin | `GET /admin` | `admin/dashboard.twig` |
| admin-ecoles | `wf-v2-28-admin-ecoles.html` | admin | `GET /admin/ecoles` | `admin/schools.twig` |
| admin-annonces | `wf-v2-29-admin-annonces.html` | admin | `GET /admin/annonces` | `admin/listings.twig` |
| etats-systeme | `wf-v2-30-etats-systeme.html` | transversal | `403 / 404 / 429 / 500` | `errors/*.twig` + flashs |

- [ ] **Étape 4 — écrire le générateur et le kit CSS minimal.** Le layout doit
  fournir `publicNav()`, `schoolNav()`, `adminNav()`, l'annotation `.wf-meta`,
  le contenu `.wf-page`, les composants `.card`, `.field`, `.btn`, `.badge`,
  `.table-scroll`, `.map-placeholder`, `.signature-pad`, `.flash`, `.pagination`
  et une règle mobile sous 600 px. Le HTML généré contient une balise title,
  un lien vers `wireframe-v2.css`, le label `WIREframe v2`, la navigation du
  rôle, le `body` du manifeste et la barre route/vue/état.

- [ ] **Étape 5 — générer le sommaire et vérifier le socle.**

```powershell
node docs/jury/wireframes-v2/tools/generate.cjs
node docs/jury/wireframes-v2/tools/check-wireframes.cjs
```

  Attendu à ce stade : le générateur crée 30 fichiers, mais le contrôle échoue
  avec `contenu incomplet` tant que les corps des tâches 2 à 5 portent l'état
  `draft: true`. Le sommaire doit déjà lister 30 liens regroupés par rôle.

- [ ] **Étape 6 — commiter le socle.**

```powershell
git add docs/jury/wireframes-v2/screens.cjs docs/jury/wireframes-v2/tools/check-wireframes.cjs docs/jury/wireframes-v2/tools/generate.cjs docs/jury/wireframes-v2/wireframe-v2.css docs/jury/wireframes-v2/index.html
git commit -m "Jury: socle et manifeste des 30 wireframes v2"
```

### Tâche 2 : Écrans publics 01 à 13

**Fichiers :**
- Modifier : `docs/jury/wireframes-v2/screens.cjs`
- Régénérer : `docs/jury/wireframes-v2/wf-v2-01-accueil.html` à
  `wf-v2-13-reinitialisation.html`

**Interfaces :**
- Consomme : `Screen.body` accepte du HTML statique utilisant uniquement les
  classes du kit CSS.
- Produit : 13 écrans avec `draft: false`.

- [ ] **Étape 1 — renseigner les contenus exacts des écrans 01 à 04.**
  Accueil : titre, proposition de valeur et deux CTA. Liste : champs mot-clé,
  département, ville, rayon, boutons Filtrer/Liste/Carte, lien d'alerte, cartes
  avec distance, badge école vérifiée et pagination. Carte : mêmes filtres,
  carte, marqueurs groupés et compteur non localisé. Détail : titre, lieu,
  contrat, heures, rémunération, description, école vérifiée, carte et formulaire
  candidat avec nom, email, téléphone optionnel, message, CV, identité, permis,
  carte enseignant et bouton d'envoi.

- [ ] **Étape 2 — renseigner les alertes 05 à 08.** Abonnement : email,
  département, mot-clé optionnel et message double opt-in. Confirmation : état
  activé et retour aux annonces. Désabonnement : avertissement, bouton POST de
  confirmation et lien d'annulation ; aucun écran ne supprime au GET. Ajouter
  l'état final « Alerte supprimée » rendu après le POST.

- [ ] **Étape 3 — renseigner l'authentification 09 à 13.** Connexion : email,
  mot de passe, mot de passe oublié et création de compte. Inscription : raison
  sociale, email, SIRET avec zone d'état, téléphone, adresse avec suggestions,
  mot de passe et confirmation. Vérification email : succès et lien de
  connexion. Oubli : email et réponse anti-énumération.
  Réinitialisation : nouveau mot de passe, confirmation et état jeton invalide.

- [ ] **Étape 4 — générer et vérifier les 11 fichiers.**

```powershell
node docs/jury/wireframes-v2/tools/generate.cjs
node docs/jury/wireframes-v2/tools/check-wireframes.cjs
```

  Attendu : `public : 13/13`, puis échec uniquement sur les écrans encore draft.

- [ ] **Étape 5 — contrôler visuellement les écrans 02, 03, 04 et 09 dans Edge.**
  Vérifier : aucun champ manquant, aucune carte superposée, contenu entier à
  1440 px de large, et structure mobile en une colonne à 320 px.

- [ ] **Étape 6 — commiter.**

```powershell
git add docs/jury/wireframes-v2/screens.cjs docs/jury/wireframes-v2/wf-v2-01-accueil.html docs/jury/wireframes-v2/wf-v2-02-annonces.html docs/jury/wireframes-v2/wf-v2-03-carte.html docs/jury/wireframes-v2/wf-v2-04-annonce-detail.html docs/jury/wireframes-v2/wf-v2-05-alertes.html docs/jury/wireframes-v2/wf-v2-06-alerte-confirmee.html docs/jury/wireframes-v2/wf-v2-07-alerte-desabonnement.html docs/jury/wireframes-v2/wf-v2-08-alerte-supprimee.html docs/jury/wireframes-v2/wf-v2-09-connexion.html docs/jury/wireframes-v2/wf-v2-10-inscription.html docs/jury/wireframes-v2/wf-v2-11-email-verifie.html docs/jury/wireframes-v2/wf-v2-12-mot-de-passe-oublie.html docs/jury/wireframes-v2/wf-v2-13-reinitialisation.html
git commit -m "Jury: wireframes v2 publics conformes aux routes livrees"
```

### Tâche 3 : Parcours candidat et signature, écrans 14 à 18

**Fichiers :**
- Modifier : `docs/jury/wireframes-v2/screens.cjs`
- Régénérer : `wf-v2-14-suivi-attente.html` à `wf-v2-18-suivi-signe.html`

- [ ] **Étape 1 — modéliser les quatre états du suivi.** La structure partagée
  affiche annonce, école et badge de statut sans PII dans l'URL. Attente :
  dossier reçu. Refus : décision et message neutre. Accepté : contrat en
  préparation ou bouton Signer après envoi. Signé : horodatage, téléchargement
  du PDF final et empreinte SHA-256 sécable.

- [ ] **Étape 2 — modéliser la signature candidat.** Inclure résumé du contrat,
  lien de téléchargement, empreinte proposée, pad canvas filaire, bouton Effacer,
  import PNG/JPEG, case obligatoire « J'ai lu et j'accepte », bouton Signer et
  lien de retour au suivi.

- [ ] **Étape 3 — générer et contrôler les cinq états.**

```powershell
node docs/jury/wireframes-v2/tools/generate.cjs
node docs/jury/wireframes-v2/tools/check-wireframes.cjs
```

  Attendu : `candidat : 5/5`; aucune action école/admin dans leur navigation.

- [ ] **Étape 4 — contrôler visuellement les écrans 14, 15 et 16 à 1440/320 px.**
  Vérifier le pad, le consentement, les empreintes sécables et les CTA distincts.

- [ ] **Étape 5 — commiter.**

```powershell
git add docs/jury/wireframes-v2/screens.cjs docs/jury/wireframes-v2/wf-v2-14-suivi-attente.html docs/jury/wireframes-v2/wf-v2-15-suivi-refuse.html docs/jury/wireframes-v2/wf-v2-16-suivi-accepte.html docs/jury/wireframes-v2/wf-v2-17-signature-candidat.html docs/jury/wireframes-v2/wf-v2-18-suivi-signe.html
git commit -m "Jury: wireframes v2 du suivi et de la signature candidat"
```

### Tâche 4 : Espace auto-école, écrans 19 à 25

**Fichiers :**
- Modifier : `docs/jury/wireframes-v2/screens.cjs`
- Régénérer : `wf-v2-19-dashboard-ecole.html` à `wf-v2-25-mon-compte.html`

- [ ] **Étape 1 — modéliser dashboard et annonces.** Dashboard : cinq tuiles,
  graphique candidatures sur 12 semaines, entonnoir, top annonces et CTA.
  Mes annonces : titre, lieu, statut, candidatures, modifier, clôturer et
  supprimer ; la ligne clôturée ne possède aucun bouton Rouvrir.

- [ ] **Étape 2 — modéliser création et modification.** Les deux variantes de
  `dashboard/listing_form.twig` contiennent titre, description, ville, département, type
  de contrat optionnel, heures optionnelles et rémunération optionnelle. Les
  titres et boutons distinguent Publier de Modifier.

- [ ] **Étape 3 — modéliser candidatures et contrat école.** Candidatures :
  cartes attente/refusée/acceptée/contrat envoyé/signé, quatre pièces, actions
  Accepter/Refuser, télécharger, envoyer et PDF signé selon l'état. Contrat :
  tous les champs réellement livrés (type, dates, motif CDD, rémunération,
  heures, période d'essai, lieu, SIRET prestataire, adresses, identité,
  autorisation, permis, clauses), pad école, import et bouton de génération.

- [ ] **Étape 4 — modéliser Mon compte.** Adresse avec liste de suggestions,
  téléphone et Enregistrer uniquement. Ne pas afficher changement de mot de
  passe, carte d'aperçu ni suppression du compte.

- [ ] **Étape 5 — générer, vérifier et contrôler visuellement 17, 18, 21, 22.**

```powershell
node docs/jury/wireframes-v2/tools/generate.cjs
node docs/jury/wireframes-v2/tools/check-wireframes.cjs
```

  Attendu : `école : 7/7`; aucune formulation interdite.

- [ ] **Étape 6 — commiter.**

```powershell
git add docs/jury/wireframes-v2/screens.cjs docs/jury/wireframes-v2/wf-v2-19-dashboard-ecole.html docs/jury/wireframes-v2/wf-v2-20-mes-annonces.html docs/jury/wireframes-v2/wf-v2-21-annonce-creation.html docs/jury/wireframes-v2/wf-v2-22-annonce-modification.html docs/jury/wireframes-v2/wf-v2-23-candidatures.html docs/jury/wireframes-v2/wf-v2-24-contrat-ecole.html docs/jury/wireframes-v2/wf-v2-25-mon-compte.html
git commit -m "Jury: wireframes v2 exhaustifs de l'espace auto-ecole"
```

### Tâche 5 : Administration et états système, écrans 26 à 30

**Fichiers :**
- Modifier : `docs/jury/wireframes-v2/screens.cjs`
- Régénérer : `wf-v2-26-connexion-admin.html` à `wf-v2-30-etats-systeme.html`

- [ ] **Étape 1 — modéliser la connexion et le dashboard admin.** Connexion
  séparée avec email/mot de passe. Dashboard : quatre tuiles, deux graphiques,
  dernière purge, compteurs et bouton de purge manuelle.

- [ ] **Étape 2 — modéliser la modération.** Écoles : pagination, nom, email,
  SIRET/état Sirene, volumes, statut et actions Suspendre/Réactiver. Annonces :
  cartes ou tableau avec contenu, école, lieu, conditions, candidatures, vues,
  lien public et bouton Retirer. Aucun accès aux candidatures/contrats comme école.

- [ ] **Étape 3 — modéliser la planche système.** Présenter flash succès/erreur,
  erreurs de champ, limite 429, page CSRF expirée avec consigne de réessai, 403,
  404 et 500. Chaque bloc indique le code HTTP et le comportement de retour.

- [ ] **Étape 4 — générer et obtenir le contrôle complet vert.**

```powershell
node docs/jury/wireframes-v2/tools/generate.cjs
node docs/jury/wireframes-v2/tools/check-wireframes.cjs
```

  Attendu exact : `Wireframes v2 : 30/30 écrans, liens et formulations valides.`

- [ ] **Étape 5 — contrôler visuellement 27, 28, 29 et 30.** Vérifier la
  navigation admin, la pagination, les actions autorisées et l'absence des
  pouvoirs d'une école.

- [ ] **Étape 6 — commiter.**

```powershell
git add docs/jury/wireframes-v2/screens.cjs docs/jury/wireframes-v2/wf-v2-26-connexion-admin.html docs/jury/wireframes-v2/wf-v2-27-dashboard-admin.html docs/jury/wireframes-v2/wf-v2-28-admin-ecoles.html docs/jury/wireframes-v2/wf-v2-29-admin-annonces.html docs/jury/wireframes-v2/wf-v2-30-etats-systeme.html
git commit -m "Jury: wireframes v2 administration et etats systeme"
```

### Tâche 6 : Matrice, captures, planche SVG et PDF

**Fichiers :**
- Créer : `docs/jury/wireframes-v2/matrice-couverture.md`
- Créer : `docs/jury/wireframes-v2/tools/capture-wireframes.ps1`
- Créer : `docs/jury/wireframes-v2/tools/build-board.cjs`
- Créer : `docs/jury/wireframes-v2/tools/build-pdf.py`
- Créer : `docs/jury/wireframes-v2/png/wf-v2-*.png` (30 fichiers)
- Créer : `docs/jury/wireframes-v2/wireframes-v2-planche.svg`
- Créer : `docs/jury/wireframes-v2/wireframes-v2.pdf`

- [ ] **Étape 1 — écrire la matrice de couverture.** Une ligne par écran avec
  les colonnes ID, fichier, acteur, route, vue/source, état, capture finale de
  référence (ou « site local »), contrôle structurel et contrôle visuel. Toutes
  les 30 lignes terminent à `VALIDÉ` seulement après inspection.

- [ ] **Étape 2 — écrire et exécuter le script de capture.** Edge headless ouvre
  chaque `file:///.../wf-v2-*.html` avec un profil temporaire isolé, fenêtre
  `1440,1200`, `--full-page` si disponible ou hauteur calculée, et écrit dans
  `png/`. Vérifier ensuite exactement 30 PNG, chacun > 15 Ko et largeur 1440.

- [ ] **Étape 3 — contrôler visuellement les 30 PNG.** Procéder par lots de
  4 à 6 images ; corriger le manifeste/CSS puis régénérer si un texte est
  tronqué, un tableau déborde ou une action manque. Mettre la matrice à VALIDÉ
  écran par écran, pas globalement.

- [ ] **Étape 4 — générer la planche SVG.** `build-board.cjs` produit un SVG
  de couverture avec 30 miniatures référencées, regroupées Public, Candidat,
  École, Admin et Système, plus une légende de correspondance. Valider avec :

```powershell
[xml](Get-Content docs/jury/wireframes-v2/wireframes-v2-planche.svg -Raw) | Out-Null
```

- [ ] **Étape 5 — générer le PDF.** `build-pdf.py` utilise reportlab : page de
  couverture, sommaire, puis une page A4 paysage par écran avec titre, route,
  acteur, image entière et numéro de page. Attendu : 32 pages (couverture,
  sommaire, 30 écrans).

- [ ] **Étape 6 — vérifier le PDF.** Utiliser pypdf pour confirmer 32 pages et
  présence des titres, puis rendre toutes les pages avec pypdfium2 sous
  `tmp/pdfs/wireframes-v2/`. Inspecter couverture, sommaire et au moins une page
  de chaque acteur, puis les pages signalées par un ratio ou une taille atypique.

- [ ] **Étape 7 — commiter les preuves.**

```powershell
git add docs/jury/wireframes-v2/matrice-couverture.md docs/jury/wireframes-v2/tools/capture-wireframes.ps1 docs/jury/wireframes-v2/tools/build-board.cjs docs/jury/wireframes-v2/tools/build-pdf.py docs/jury/wireframes-v2/png docs/jury/wireframes-v2/wireframes-v2-planche.svg docs/jury/wireframes-v2/wireframes-v2.pdf
git commit -m "Jury: exports et preuves des 30 wireframes v2"
```

### Tâche 7 : Intégration documentaire et vérification finale

**Fichiers :**
- Modifier : `docs/jury/README.md`
- Modifier : `docs/jury/specifications-v2.md`
- Modifier : `docs/jury/comparaison-maquettes.md`
- Modifier : `docs/jury/inventaire-documents-historiques.md`
- Modifier : `docs/superpowers/plans/2026-07-11-wireframes-v2-exhaustifs.md`

- [ ] **Étape 1 — intégrer les liens.** README : ajouter Wireframes v2 avec
  sommaire, planche et PDF. Spécifications : ajouter une section « Maquettes v2 »
  vers la matrice. Comparaison : ajouter une colonne/lien v2 et expliquer la
  chaîne v1 → v2 → final. Inventaire : conserver le texte existant et ajouter
  « Fait le 2026-07-11 » vers le nouveau dossier.

- [ ] **Étape 2 — vérifier tous les liens relatifs des fichiers touchés.** Un
  script PowerShell parcourt les liens Markdown/HTML et échoue sur toute cible
  absente. Contrôler aussi que les 30 HTML lient `wireframe-v2.css` et que le
  sommaire les référence une fois chacun.

- [ ] **Étape 3 — vérifier les chemins interdits.** Comparer avec le commit
  précédant la tâche 1 : aucun chemin sous historique, wireframes v1, `src/`,
  `public/`, `test/`, captures finales ou conformité ne doit apparaître.

- [ ] **Étape 4 — lancer les validations finales.**

```powershell
node docs/jury/wireframes-v2/tools/generate.cjs
node docs/jury/wireframes-v2/tools/check-wireframes.cjs
npm test
git diff --check
git status --short
```

  Attendu : 30/30, 15 suites/448 assertions, aucune erreur de whitespace et
  uniquement les cinq fichiers documentaires de cette tâche avant commit.

- [ ] **Étape 5 — cocher toutes les cases du plan et commiter.**

```powershell
git add docs/jury/README.md docs/jury/specifications-v2.md docs/jury/comparaison-maquettes.md docs/jury/inventaire-documents-historiques.md docs/superpowers/plans/2026-07-11-wireframes-v2-exhaustifs.md
git commit -m "Jury: dossier aligne sur les 30 wireframes v2"
```

  Ne pas pousser. Annoncer : 30 écrans/états v2 livrés, v1 intactes, matrice
  30/30, PDF 32 pages, tests verts et décision de push laissée à l'utilisateur.
