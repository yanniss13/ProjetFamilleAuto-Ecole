# Lot C — Admin & modération (design)

Date : 2026-06-29
Statut : validé, prêt pour plan d'implémentation.

## Contexte

MoniteurConnect (Express 5 + Twig + Prisma) n'a aujourd'hui aucun rôle d'administration :
rien n'empêche une fausse auto-école de publier du spam, et personne ne supervise la
plateforme. Le Lot C ajoute un **administrateur** distinct des auto-écoles, avec une
**modération réactive** (post-modération) : tout reste publié immédiatement, mais l'admin
peut retirer une annonce abusive et suspendre/réactiver une auto-école.

Feuille de route : Lots A (correctifs) et B (notifications/suivi) livrés et fusionnés. Lot C
ici ; Lot D (tests ciblés, logging, prépa prod) ensuite.

## Décisions validées

1. **Auth admin** : modèle `Admin` séparé + login dédié `/admin/connexion` (PAS un drapeau
   sur `School`). Un admin n'est pas une auto-école.
2. **Modération** : post-modération réactive — voir tout ; retirer une annonce ; suspendre /
   réactiver une école.
3. **Création admin** : script CLI `npm run admin:create` (déterministe, non-interactif). Pas
   d'inscription admin en self-service, pas de bootstrap par variables d'env.

## Objectifs / périmètre

Dans le périmètre :
- Un modèle `Admin` + authentification isolée (login, logout, session `adminId`).
- Un espace `/admin/*` protégé.
- Un tableau de bord d'aperçu + listes de toutes les écoles et annonces.
- Retrait d'une annonce (avec nettoyage des fichiers privés).
- Suspension / réactivation d'une auto-école, avec effets : connexion bloquée + annonces
  masquées du public + session coupée.
- Script CLI de création d'admin.

Hors périmètre (YAGNI / lots ultérieurs) :
- Pré-modération / file d'approbation.
- Auto-inscription admin, vérification email admin, reset mot de passe admin (les admins sont
  créés par CLI ; un reset pourra être ajouté plus tard).
- Suppression d'un compte école par l'admin (la suspension suffit au MVP).
- Journal d'audit des actions de modération (Lot D logging).

## Modèle de données

Nouveau modèle :

```prisma
model Admin {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Modification :

```prisma
model School {
  // ... existant ...
  suspended Boolean @default(false)
}
```

Migration : nouvelle table `Admin` (avec index unique sur `email`) + colonne `School.suspended`
(défaut `false`, rétro-compatible). Comme la table contient une contrainte `@unique`, la
migration est générée via `prisma migrate diff --from-migrations ./prisma/migrations
--to-schema-datamodel ./prisma/schema.prisma --script`, écrite dans un dossier de migration,
puis appliquée par `prisma migrate deploy` + `prisma generate` (l'environnement non
interactif fait échouer `prisma migrate dev` sur les contraintes uniques).

## Authentification admin

Calquée sur l'auth école existante, mais isolée.

- `src/services/adminService.js` : `findByEmail(email)`, `findById(id)`, `create({ email, passwordHash })`.
- `src/validators/adminValidator.js` : `validateAdminLogin(body)` (email présent + format, mot
  de passe présent) — même style que `schoolValidator`.
- `src/controllers/adminAuthController.js` :
  - `showLogin` / `login` : valide, `schoolService`-like — compare bcrypt avec hash leurre si
    email inconnu (anti-énumération, réutilise le motif `getDummyHash`), régénère la session,
    pose `req.session.adminId`, redirige `/admin`.
  - `logout` : détruit la session, redirige `/admin/connexion`.
- `src/middlewares/requireAdmin.js` : si `!req.session.adminId` → flash + redirect
  `/admin/connexion`.
- `src/middlewares/loadAdmin.js` : charge l'admin via `adminService.findById(req.session.adminId)` ;
  si absent → détruit la session ; sinon expose `req.admin` + `res.locals.currentAdmin`.
- `src/routes/adminRoutes.js` : monte le login public (`/connexion`, `/deconnexion`) et, pour
  tout le reste, applique `requireAdmin` + `loadAdmin`.
- `src/routes/index.js` : `router.use('/admin', adminRoutes)` — placé avec les routes
  publiques (le sous-routeur gère lui-même sa protection).

**Isolation des sessions** : la session école porte `schoolId`, la session admin porte
`adminId`. `requireAuth` (espace école) teste `schoolId` ; `requireAdmin` teste `adminId`. Une
session admin ne donne donc aucun accès à `/tableau-de-bord` / `/mes-annonces` (et inversement).
La régénération de session au login admin empêche un cumul accidentel des deux identités.

**CSRF / sécurité** : le middleware `csrf` global protège déjà tous les POST, y compris admin.
Les vues admin n'utilisent aucun inline (compatibles CSP du Lot A) — boutons de suppression
via `data-confirm` + `public/js/confirm.js` existant.

## Modération

Contrôleur `src/controllers/adminController.js` :

- `dashboard` (`GET /admin`) : compteurs globaux via `prisma.{school,listing,application}.count()`.
- `schools` (`GET /admin/ecoles`) : toutes les écoles, avec `_count.listings` et `suspended`.
- `listings` (`GET /admin/annonces`) : toutes les annonces, avec leur école.
- `removeListing` (`POST /admin/annonces/:id/supprimer`) : suppression **non scopée par
  école** + nettoyage des fichiers privés. Réutilise le helper du Lot A en généralisant :
  `listingService.findAnyFilePathsForListing(id)` (mêmes champs que `findFilePathsForListing`
  mais sans le filtre `schoolId`) + un `listingService.deleteAny(id)` (`prisma.listing.delete`),
  puis `storage.deleteStored` sur chaque chemin. 404 si l'annonce n'existe pas.
- `suspendSchool` / `reactivateSchool` (`POST /admin/ecoles/:id/suspendre|reactiver`) :
  `schoolService.setSuspended(id, true|false)` (`prisma.school.update`). 404 si inexistante.

Service (tout passe par les services, pas de Prisma directement dans le contrôleur admin, pour
rester testable et cohérent) :
- `listingService` : `findAnyFilePathsForListing(id)`, `deleteAny(id)`, `findAllWithSchool()`
  (toutes les annonces + leur école), `countAll()`.
- `schoolService` : `findAllWithCounts()` (toutes les écoles + `_count.listings` + `suspended`),
  `countAll()`, `setSuspended(id, value)`.
- `applicationService` : `countAllGlobal()` (total des candidatures, toutes écoles confondues).
Le `dashboard` agrège ces trois `count*`.

Vues (`views/admin/`) : `login.twig`, `dashboard.twig`, `schools.twig`, `listings.twig`,
héritant de `layouts/base.twig`. Listes en `table.data-table` (style existant). Actions en
formulaires POST avec `_csrf` + `data-confirm`.

## Effets de la suspension

1. **Connexion bloquée** — `authController.login` : après avoir authentifié l'école, si
   `school.suspended` est vrai, renvoyer 403 avec un message explicite (« Votre compte a été
   suspendu. Contactez l'administrateur. »). On accepte de révéler l'état « suspendu » à
   l'intéressé (qui connaît déjà son compte).
2. **Annonces masquées du public** — `listingService.findPublic` ajoute
   `school: { suspended: false }` au `where` ; `findPublicById` ajoute la même condition (donc
   404 sur le détail d'une annonce d'école suspendue).
3. **Session coupée immédiatement** — `loadSchool` : si l'école chargée est `suspended`,
   détruire la session et rediriger vers `/connexion` avec un message. Une école suspendue en
   cours de session perd donc l'accès à son espace sans attendre l'expiration.

Réactivation : remet `suspended = false` ; l'école peut de nouveau se connecter et ses
annonces réapparaissent (leur `status` open/closed est inchangé).

## Création du premier admin (CLI)

- `scripts/create-admin.js` : lit `email` et `password` depuis `process.argv`
  (`node scripts/create-admin.js <email> <password>`), valide (email non vide + `@`, mot de
  passe ≥ 8 caractères ≤ 72 octets — mêmes bornes que les écoles), hache via `utils/password`,
  puis **upsert par email** (`prisma.admin.upsert`) — relancer le script avec le même email met
  à jour le mot de passe. Affiche un message de succès masquant le mot de passe ; sort en code 1
  avec un message clair en cas d'argument manquant/invalide.
- `package.json` : `"admin:create": "node scripts/create-admin.js"`. Usage :
  `npm run admin:create -- admin@exemple.fr motdepasse`.
- La logique réutilisable (`createOrUpdateAdmin({ email, password })`) est exportée pour être
  testée sans passer par argv.

## Fichiers touchés (indicatif)

- `prisma/schema.prisma` + migration — `Admin`, `School.suspended`.
- `src/services/adminService.js` (nouveau), `src/services/schoolService.js` (`findAll`,
  `countAll`, `setSuspended`), `src/services/listingService.js` (`findAnyFilePathsForListing`,
  `deleteAny`, `findAll`/`countAll` ou via contrôleur).
- `src/validators/adminValidator.js` (nouveau).
- `src/controllers/adminAuthController.js`, `src/controllers/adminController.js` (nouveaux).
- `src/middlewares/requireAdmin.js`, `src/middlewares/loadAdmin.js` (nouveaux).
- `src/routes/adminRoutes.js` (nouveau) + `src/routes/index.js` (montage).
- `src/controllers/authController.js` (blocage suspended), `src/middlewares/loadSchool.js`
  (session coupée si suspended), `src/services/listingService.js` (`findPublic`/`findPublicById`
  excluent suspended).
- `views/admin/*.twig` (nouveaux), `views/partials/nav.twig` (branche `currentAdmin`).
- `scripts/create-admin.js` (nouveau), `package.json` (script + éventuel ajout au `test`).
- `test/lot-c.cjs` (nouveau).

## Tests

Nouveau `test/lot-c.cjs` (serveur sur un port dédié, données créées et nettoyées), branché sur
`npm test` :

1. **Création admin** : `createOrUpdateAdmin` insère un admin ; relancer met à jour le mot de
   passe (upsert).
2. **Auth admin** : login OK → session + accès `GET /admin` (200) ; mauvais mot de passe → 401 ;
   `GET /admin` sans session → redirection `/admin/connexion`.
3. **Cloisonnement** : une session **école** sur `GET /admin` → redirigée (pas d'`adminId`) ;
   une session **admin** sur `GET /tableau-de-bord` → redirigée (pas de `schoolId`).
4. **Retrait d'annonce** : l'admin retire une annonce d'une école ; l'annonce et ses fichiers
   (CV/CNI/permis/carte/contrat) disparaissent.
5. **Suspension** : l'admin suspend une école → son annonce n'apparaît plus sur `/annonces` et
   son détail renvoie 404 ; sa connexion est refusée (403) ; après réactivation → annonce de
   nouveau visible et connexion de nouveau possible.

## Risques / points d'attention

- **Non-scopage des actions admin** : les suppressions/suspensions admin agissent sur
  n'importe quelle ligne. Bien garder ces opérations DANS l'espace `/admin` protégé par
  `requireAdmin` ; ne jamais exposer `deleteAny`/`setSuspended` sur une route non-admin.
- **Migration `@unique`** : utiliser la recette `migrate diff` + `migrate deploy` (cf. contexte
  environnement non interactif).
- **Anti-énumération au login admin** : conserver le hash leurre + message générique, comme
  pour l'école.
- **Effet immédiat de la suspension** : la coupure de session via `loadSchool` ajoute une
  requête de lecture déjà présente (l'école est de toute façon chargée) — pas de coût
  supplémentaire.
- **Cohérence du nettoyage de fichiers** : `findAnyFilePathsForListing` doit couvrir
  exactement les mêmes champs que la version scopée du Lot A (CV, CNI, permis, carte, PDF de
  contrat) pour ne pas laisser d'orphelins.
