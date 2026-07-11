# Cas d'utilisation, diagramme fonctionnel et spécifications v2 — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Le dépôt
> impose un seul agent à la fois ; exécuter en ligne, sans délégation et sans
> staging partagé.

**Objectif :** Produire les versions 2 datées des trois documents de conception
en retard sur le produit — cas d'utilisation, diagramme fonctionnel,
spécifications fonctionnelles et techniques — sous `docs/jury/`, sans toucher
aux originaux de juin.

**Architecture :** Chronologie assumée devant le jury : les documents de juin
restent des v1 intactes sous `docs/historique/2026-06/` ; chaque v2 vit dans
`docs/jury/`, cite sa v1, couvre les lots E→L et renvoie aux documents v2 déjà
livrés (besoin, découpage, BDD, charte, conformité) au lieu de les dupliquer.
Les diagrammes réutilisent la grammaire visuelle de `bdd-v2.svg` et
`parcours-fonctionnels.svg` (SVG à la main, PNG exporté par Edge headless).

**Stack :** Markdown, SVG à la main, Edge headless (`--screenshot`), PowerShell
pour les vérifications. Aucune dépendance nouvelle.

## Contraintes globales

- **Ne jamais modifier `docs/historique/2026-06/`** (preuves de conception
  initiale) ni les **wireframes** : la maquette v1 est un critère VALIDÉ de
  l'audit précisément parce qu'elle est restée intacte.
- Aucun code applicatif modifié : ni vue, ni CSS, ni JS, ni test (état vert à
  préserver : 15 suites, 448 assertions). Ne pas toucher aux captures ni aux
  JSON de conformité.
- Tout texte en français ; chaque route, contrôleur ou fonctionnalité citée
  doit être vérifiée dans le code avant d'être écrite — l'inventaire
  (`docs/jury/inventaire-documents-historiques.md`, section « Fonctions
  historiques non présentes ») liste les pièges connus : pas de réouverture
  d'annonce, pas de changement de mot de passe depuis « Mon compte », pas de
  filtre de statut sur les candidatures, pas de suppression d'école par
  l'admin (suspension seulement), pas de candidature depuis une session
  école/admin.
- Un commit par tâche, message `Jury: ...` sans accents. **Ne jamais pousser.**
- Ne jamais stager les fichiers personnels (gitignorés) ; `git add` avec des
  chemins explicites.
- Après chaque document : vérifier que tous les liens relatifs pointent vers
  des fichiers existants.

---

### Tâche 1 : Diagramme de cas d'utilisation v2 (trois acteurs)

**Fichiers :**
- Créer : `docs/jury/diagrammes/cas-utilisation-v2.svg`
- Créer : `docs/jury/diagrammes/cas-utilisation-v2.png` (généré)
- Lire seulement : `docs/historique/2026-06/spec-assets/cas-utilisation-moniteur.svg`
  (grammaire visuelle v1 : acteurs bâtons, ellipses, cadre système)

**Interfaces :**
- Produit : les deux fichiers de diagramme, référencés ensuite par le
  diagramme fonctionnel v2 (tâche 2) et les specs v2 (tâche 3).

- [x] **Étape 1 — écrire le SVG.** Un seul diagramme
  (`viewBox="0 0 1900 1000"` environ, fond blanc), trois acteurs à gauche et
  un cadre système « MoniteurConnect » contenant les ellipses. Reprendre les
  couleurs du dossier (`#1a4d8f` pour les titres, boîtes à liseré `#3b5b8c`,
  légendes `#5b6470`). Cas d'utilisation exacts par acteur (libellés à copier
  tels quels, vérifiés dans les routes) :

  **Moniteur / candidat (sans compte)** : Consulter et filtrer les annonces
  (mots-clés, département, ville + rayon) ; Basculer en vue carte ; Voir le
  détail d'une annonce ; Postuler avec pièces jointes ; Suivre sa candidature
  par jeton ; Signer le contrat en ligne ; Télécharger le PDF signé ;
  S'abonner aux alertes email (double opt-in) ; Se désabonner (suppression
  RGPD).

  **Auto-école (authentifiée)** : S'inscrire (vérification SIRET + email) ;
  Se connecter / réinitialiser son mot de passe ; Gérer son profil ; Créer,
  modifier, clôturer ou supprimer une annonce ; Consulter les candidatures et
  télécharger les pièces ; Accepter une candidature (contrat + signature) ;
  Refuser une candidature ; Envoyer le contrat au candidat ; Télécharger le
  contrat contresigné ; Consulter ses statistiques.

  **Administrateur (espace cloisonné)** : Se connecter à l'administration ;
  Consulter les statistiques plateforme ; Suspendre ou réactiver une
  auto-école ; Retirer une annonce ; Lancer la purge RGPD.

  Relations `include` en pointillé uniquement là où c'est réel : « Postuler »
  inclut « Contrôle des pièces (magic bytes) » ; « Accepter une candidature »
  inclut « Générer le contrat PDF ». Pas d'héritage d'acteurs.

- [x] **Étape 2 — valider le XML et contrôler visuellement.**
  `[xml](Get-Content docs/jury/diagrammes/cas-utilisation-v2.svg -Raw)` en
  PowerShell (échoue si XML invalide), puis lecture visuelle (outil Read) :
  aucun texte tronqué, aucune ellipse superposée.

- [x] **Étape 3 — exporter le PNG.**

```powershell
$edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:/Program Files/Microsoft/Edge/Application/msedge.exe' }
& $edge --headless=new --screenshot="$PWD\docs\jury\diagrammes\cas-utilisation-v2.png" --window-size=1900,1000 --default-background-color=FFFFFFFF "file:///$PWD/docs/jury/diagrammes/cas-utilisation-v2.svg"
```

  Attendu : PNG > 30 Ko, contrôle visuel (Read).

- [x] **Étape 4 — commiter.**

```powershell
git add docs/jury/diagrammes/cas-utilisation-v2.svg docs/jury/diagrammes/cas-utilisation-v2.png
git commit -m "Jury: cas d'utilisation v2 (trois acteurs, lots E a L couverts)"
```

### Tâche 2 : Diagramme fonctionnel v2

**Fichiers :**
- Créer : `docs/jury/diagramme-fonctionnel-v2.md`
- Lire seulement : `docs/historique/2026-06/diagrammes/diagramme-fonctionnel.md`
  (v1 : reprendre son plan de sections, pas son contenu périmé)

**Interfaces :**
- Consomme : `diagrammes/parcours-fonctionnels.{svg,png}` (tâche livrée le
  2026-07-11), `diagrammes/cas-utilisation-v2.{svg,png}` (tâche 1),
  `diagrammes/bdd-v2.{svg,png}`.
- Produit : `diagramme-fonctionnel-v2.md`, référencé par les specs v2
  (tâche 3).

- [x] **Étape 1 — lire la v1 et lister ses sections.** Ouvrir le Markdown de
  juin et noter son sommaire (flux global, processus, données, architecture,
  cas d'utilisation). La v2 reprend ce sommaire, en version courte : chaque
  section s'appuie sur un diagramme déjà versionné plutôt que sur une
  redescription.

- [x] **Étape 2 — écrire le document.** Squelette imposé :

```markdown
# Diagramme fonctionnel — version 2 (2026-07-11)

Version actualisée du diagramme fonctionnel du 24/06
(`../historique/2026-06/diagrammes/diagramme-fonctionnel.md`, conservé intact
comme preuve de conception). La v1 s'arrêtait avant les lots E → L ; cette v2
décrit l'application réellement livrée.

## 1. Flux global et parcours

![Les trois parcours fonctionnels](diagrammes/parcours-fonctionnels.png)

[3 à 5 phrases : les trois parcours, le fait que le moniteur n'a pas de
compte, le rôle du jeton de suivi ; renvoyer à decoupage-fonctionnel.md pour
la lecture étape par étape]

## 2. Cas d'utilisation

![Cas d'utilisation v2 — trois acteurs](diagrammes/cas-utilisation-v2.png)

[2 phrases : ce qui a changé depuis la v1 — acteur admin, alertes, suivi,
signature, statistiques, purge ; source vectorielle en lien]

## 3. Architecture applicative

[décrire la chaîne routes → contrôleurs → services (Prisma) → vues Twig avec
les dossiers réels de src/ ; les middlewares transversaux (requireAuth,
requireAdmin, loadSchool, CSRF, sessions Prisma, CSP) ; les deux relais API
internes (/api/siret, /api/adresse) avec cache et rate-limit ; citer
src/app.js et src/routes/index.js comme points d'entrée de lecture]

## 4. Données

![Modèle de données v2](diagrammes/bdd-v2.png)

[2 phrases : 8 modèles contre 4 en v1 ; renvoyer à base-de-donnees.md pour la
lecture guidée, les migrations et les procédures de sauvegarde]

## 5. Processus clés

[trois sous-sections courtes, chacune en liste numérotée d'étapes vérifiées
dans le code : « Candidature » (dépôt → contrôles → emails → suivi),
« Signature du contrat » (acceptation → signature école → envoi → signature
candidat → PDF final + SHA-256), « Purge RGPD » (planification 30 s puis
24 h → critères → journal PurgeRun)]

## 6. Écarts avec la v1

Le tableau complet « prévu / réalisé » est tenu dans
[`inventaire-documents-historiques.md`](inventaire-documents-historiques.md) ;
les écarts d'écrans dans [`comparaison-maquettes.md`](comparaison-maquettes.md).
```

  Remplacer chaque bloc `[...]` par la prose réelle, en vérifiant chaque
  affirmation dans `src/` (jamais de fonctionnalité citée sans route ou
  service existant). Pas d'export PDF : le Markdown versionné est la source
  présentée ; le PDF de juin reste l'export v1.

- [x] **Étape 3 — vérifier les liens et commiter.** Chaque lien et chaque
  image du document doivent exister sur disque. Puis :

```powershell
git add docs/jury/diagramme-fonctionnel-v2.md
git commit -m "Jury: diagramme fonctionnel v2 (architecture et processus reels)"
```

### Tâche 3 : Spécifications fonctionnelles et techniques v2

**Fichiers :**
- Créer : `docs/jury/specifications-v2.md`
- Lire seulement : `docs/historique/2026-06/SPECIFICATIONS-FONCTIONNELLES-ET-TECHNIQUES.md`

**Interfaces :**
- Consomme : tous les documents v2 du dossier jury (besoin, découpage,
  diagramme fonctionnel v2, BDD, charte, conformité) et `AGENTS.md` (état des
  lots).
- Produit : `specifications-v2.md`, référencé ensuite par le README jury
  (tâche 4).

- [x] **Étape 1 — écrire le document consolidé.** Ce n'est PAS une réécriture
  des 26 pages de juin : c'est la spécification de l'application livrée, qui
  assemble les documents v2 existants et spécifie ce qui n'est écrit nulle
  part ailleurs — les exigences fonctionnelles par lot. Squelette imposé :

```markdown
# Spécifications fonctionnelles et techniques — version 2 (2026-07-11)

La v1 du 23/06 (26 pages,
`../historique/2026-06/SPECIFICATIONS-FONCTIONNELLES-ET-TECHNIQUES.md`) est
conservée intacte comme preuve de conception. Cette v2 spécifie l'application
réellement livrée (lots A → L) et renvoie aux documents dédiés plutôt que de
les recopier.

## 1. Périmètre et besoin

Renvoi : [`expression-du-besoin-v2.md`](expression-du-besoin-v2.md) (besoin,
objectifs, critères d'acceptation adossés aux tests, hors-périmètre).
[2 phrases de rappel : qui, quoi, pourquoi]

## 2. Spécifications fonctionnelles

Vue d'ensemble : [`decoupage-fonctionnel.md`](decoupage-fonctionnel.md) et
[`diagramme-fonctionnel-v2.md`](diagramme-fonctionnel-v2.md).

[Puis un tableau par acteur — moniteur, auto-école, administrateur — à
4 colonnes : Fonction | Règles de gestion essentielles | Routes | Tests.
Environ 10 lignes moniteur, 12 auto-école, 5 admin. Chaque ligne vérifiée
dans src/routes/ et test/ ; reprendre les cas d'utilisation de la tâche 1
comme liste de départ. Exemples de règles à retrouver dans le code : pièces
contrôlées par magic bytes ; candidature refusée depuis une session
école/admin ; contrat invalidé si ré-édité après signature ; alerte
supprimée réellement au désabonnement.]

## 3. Spécifications techniques

- Stack et justifications : Node.js CommonJS, Express 5, Twig autoescape,
  Prisma (SQLite dev, trajectoire PostgreSQL documentée), sessions en base,
  Leaflet auto-hébergé — alternatives rejetées dans le deck et
  [`soutenance/questions-reponses.md`](soutenance/questions-reponses.md).
- Données : [`base-de-donnees.md`](base-de-donnees.md) (8 modèles, migrations,
  sauvegarde/restauration).
- Sécurité : [liste vérifiée dans le code : bcrypt, CSRF global y compris
  multipart, CSP stricte sans inline, scoping schoolId, magic bytes,
  rate-limits, purge RGPD ; renvoyer à veille-securite.md]
- Interfaces externes : [API Sirene via /api/siret, API Adresse via
  /api/adresse, SMTP/Mailpit — caches et comportement en panne, vérifiés
  dans src/services/]
- Qualité : TDD (15 suites, 448 assertions), conformité W3C/axe/responsive
  du 2026-07-11 ([`conformite.md`](conformite.md)), charte
  ([`charte-graphique.md`](charte-graphique.md)).

## 4. Contraintes et limites assumées

[reprendre honnêtement : production PostgreSQL non démontrée (seul critère
d'audit restant), emails via Mailpit en local, pad de signature avec
alternative d'import accessible]
```

  Remplacer chaque bloc `[...]` par le contenu réel vérifié. Les tableaux de
  la section 2 sont le cœur du document : pas de fonction sans route existante
  ni test nommé.

- [x] **Étape 2 — contre-vérifier avec l'inventaire.** Relire la section
  « Fonctions historiques non présentes sous la forme décrite » de
  l'inventaire : aucune de ces huit formulations périmées ne doit réapparaître
  dans la v2.

- [x] **Étape 3 — vérifier les liens et commiter.**

```powershell
git add docs/jury/specifications-v2.md
git commit -m "Jury: specifications fonctionnelles et techniques v2 (lots A a L)"
```

### Tâche 4 : Intégrer au dossier jury et clore

**Fichiers :**
- Modifier : `docs/jury/README.md`
- Modifier : `docs/jury/inventaire-documents-historiques.md`
- Modifier : ce plan (cocher les cases)

- [x] **Étape 1 — README jury.** Dans « Documents de référence », bloc
  « Dossier consolidé », ajouter trois lignes sur le modèle des existantes :
  spécifications v2 (`specifications-v2.md`), diagramme fonctionnel v2
  (`diagramme-fonctionnel-v2.md`) et cas d'utilisation v2
  (`diagrammes/cas-utilisation-v2.svg`). Ajouter au checkpoint final une
  entrée datée 2026-07-11 : les trois v2 livrées, v1 de juin intactes,
  wireframes volontairement non modifiés (preuve de maquette initiale).

- [x] **Étape 2 — inventaire historique.** Dans le tableau d'inventaire,
  compléter la colonne « Usage recommandé » des trois lignes concernées
  (spécifications, diagramme fonctionnel, cas d'utilisation) par la mention
  « **Fait le 2026-07-11 :** v2 dans `docs/jury/` » avec le lien relatif.
  Ne rien retirer du texte existant.

- [x] **Étape 3 — vérifications finales.** Tous les liens des fichiers
  touchés pointent vers des fichiers existants ; `git status --short` ne
  montre que les fichiers de ce plan ; `git diff --check` sans erreur.

- [x] **Étape 4 — cocher ce plan et commiter.**

```powershell
git add docs/jury/README.md docs/jury/inventaire-documents-historiques.md docs/superpowers/plans/2026-07-11-diagrammes-et-specs-v2.md
git commit -m "Jury: dossier consolide avec les v2 (specs, fonctionnel, cas d'utilisation)"
```

  Puis annoncer à l'utilisateur : les trois v2 sont livrées et reliées ; les
  wireframes et documents de juin restent des v1 intactes ; **ne pas
  pousser** (décision utilisateur).
