# Lot B — Notifications & suivi candidat (design)

Date : 2026-06-29
Statut : validé, prêt pour plan d'implémentation.

## Contexte

MoniteurConnect (Express 5 + Twig + Prisma) : les moniteurs indépendants postulent à une
annonce **sans créer de compte**. Aujourd'hui le candidat ne reçoit **aucun email** (seule
l'auto-école est notifiée au dépôt), et il n'a aucun moyen de connaître l'issue de sa
candidature : l'acceptation/refus se fait côté école, et seul l'envoi du contrat est
déclenché manuellement.

Le Lot B comble ce manque : confirmation de candidature, page de suivi durable, et emails
automatiques à l'acceptation/refus. Il s'inscrit dans la feuille de route Lots A–D (Lot A
livré). Lots C (admin) et D (qualité/prod) suivront.

## Objectifs

1. À la candidature, envoyer au candidat un **email de confirmation** contenant un **lien de
   suivi durable**.
2. Offrir une **page de suivi publique** `/suivi/<token>` montrant le statut de la
   candidature.
3. Envoyer **automatiquement** au candidat un email à l'**acceptation** et au **refus**,
   rappelant le lien de suivi.

Hors périmètre (décisions explicites) :

- L'envoi du **contrat** reste **manuel** (bouton « Envoyer le contrat » côté école) : l'école
  garde le contrôle du document juridique. Aucun PDF de contrat n'est exposé sur la page de
  suivi.
- Pas de compte moniteur (inchangé).

## Décisions de conception

### Jeton de suivi : stocké en clair (et pourquoi)

Nouveau champ `Application.trackingToken String? @unique` : une valeur opaque de 256 bits
générée à la création de la candidature, **stockée en clair**, **durable**, **réutilisable**,
**sans expiration**.

Cela diverge volontairement du motif des jetons de vérification d'email / réinitialisation
de mot de passe, qui sont **hashés** en base (`src/services/tokens.js`). Justification :

- Un jeton d'auth hashé protège une **action sur le compte** (vérifier, réinitialiser) qu'une
  fuite de base ne doit pas permettre de forger.
- Le jeton de suivi ne donne accès qu'au **statut** d'une candidature — c'est-à-dire des
  données (`applicantName`, annonce, `status`) **déjà présentes en clair** dans la table
  `Application`. Le stocker en clair n'aggrave donc pas une fuite de base.
- En clair, il permet de **reconstruire le lien** dans les emails d'acceptation/refus, ce que
  le hash interdirait (on ne peut pas retrouver le `raw` depuis le hash).

Sécurité résiduelle : 256 bits ⇒ devinette/brute-force infaisable, donc la route GET de suivi
n'a pas besoin de rate-limiting dédié.

Helper : ajouter `generateOpaqueToken()` à `src/services/tokens.js`
(`crypto.randomBytes(32).toString('hex')`) plutôt que réutiliser `generateToken()` (dont le
`hash` ne sert pas ici), pour exprimer clairement l'intention.

### Migration

Ajout d'une colonne nullable `trackingToken` à `Application`. Les
candidatures **existantes** (créées avant le Lot B) gardent `trackingToken = NULL` : elles
n'ont pas de page de suivi (acceptable — leurs candidats avaient déjà postulé sans lien). Pas
de backfill. La contrainte `@unique` autorise plusieurs NULL sous SQLite et PostgreSQL.

## Composants & flux

### 1. Candidature → email de confirmation

Dans `src/controllers/applicationController.js` (`apply`) :

1. Générer `trackingToken = generateOpaqueToken()`.
2. L'inclure dans `applicationService.createForListing(...)` (nouveau champ).
3. Après création (et après la notif école existante), appeler
   `mailer.sendApplicationConfirmation(applicantEmail, applicantName, listingTitle, trackingToken)`
   qui envoie un email avec le lien `${APP_URL}/suivi/${trackingToken}`.
4. **Best-effort** : l'échec de cet email ne modifie pas la réponse (le candidat a déjà le
   flash de succès ; cohérent avec la notif école actuelle qui n'est pas vérifiée).

### 2. Page de suivi publique

- Route : `GET /suivi/:token` → `trackingController.show` (nouveau routeur
  `src/routes/trackingRoutes.js`, monté publiquement dans `src/routes/index.js`).
- Service : `applicationService.findByTrackingToken(token)` →
  `prisma.application.findUnique({ where: { trackingToken: token }, include: { listing: { include: { school: true } }, contract: true } })`.
- Si `token` falsy ou candidature introuvable → `notFound(res)` (404).
- Vue : `views/tracking/show.twig` (hérite de `layouts/base.twig`) affichant **uniquement** :
  - titre de l'annonce, nom commercial de l'auto-école, date de candidature
    (`createdAt|date('d/m/Y')`) ;
  - un **badge de statut** (réutilise les classes `badge-*` existantes) ;
  - un message contextuel selon `status` :
    - `pending` → « Votre candidature est en cours d'examen par l'auto-école. »
    - `accepted` → « Votre candidature a été acceptée. L'auto-école vous transmettra votre
      contrat par email. » + si `contract.sentToApplicantAt` : « Contrat envoyé le … ».
    - `rejected` → « Votre candidature n'a pas été retenue cette fois-ci. »
- **Ne doit PAS exposer** : email/téléphone du candidat, message, chemins de pièces, autres
  candidatures, données d'une autre école.

### 3. Emails automatiques accept/refus

Dans `src/controllers/contractController.js` :

- `accept` : après `applicationService.updateStatus(id, 'accepted')`, appeler
  `mailer.sendApplicationAccepted(application.applicantEmail, application.applicantName, application.listing.title, application.trackingToken)`.
- `reject` : après `updateStatus(id, 'rejected')`, appeler
  `mailer.sendApplicationRejected(...)` (mêmes arguments).
- **Best-effort** : un échec d'email n'empêche pas l'action ni la redirection (le statut est
  déjà persité). Le flash de succès existant reste affiché.
- Si `trackingToken` est `NULL` (candidature héritée d'avant le Lot B), l'email est tout de
  même envoyé mais **sans** le lien de suivi (le corps gère l'absence de lien).

### 4. Emails (mailer.js)

Trois nouvelles fonctions suivant le style existant (corps HTML court, `send()` générique,
masquage des emails dans les logs, lien passé en option) :

- `sendApplicationConfirmation(email, name, listingTitle, token)`
- `sendApplicationAccepted(email, name, listingTitle, token)`
- `sendApplicationRejected(email, name, listingTitle, token)`

Chacune construit `link = token ? `${APP_URL}/suivi/${token}` : null` et l'inclut dans le
corps si présent.

## Fichiers touchés (indicatif)

- `prisma/schema.prisma` + nouvelle migration — `Application.trackingToken`.
- `src/services/tokens.js` — `generateOpaqueToken()`.
- `src/services/applicationService.js` — `createForListing` accepte `trackingToken` ;
  nouveau `findByTrackingToken`.
- `src/services/mailer.js` — 3 nouvelles fonctions d'email.
- `src/controllers/applicationController.js` — génère le token + email de confirmation.
- `src/controllers/contractController.js` — emails auto accept/refus.
- `src/controllers/trackingController.js` (nouveau) — `show`.
- `src/routes/trackingRoutes.js` (nouveau) + `src/routes/index.js` — montage public.
- `views/tracking/show.twig` (nouveau).
- `test/smoke.cjs` — assertions de suivi (réutilise le parcours candidature/accept/refus).

## Tests

Extension de `test/smoke.cjs` (qui déroule déjà inscription → annonce → candidature →
acceptation → refus) :

1. La candidature complète enregistre un `trackingToken` non vide en base.
2. `GET /suivi/<token>` → 200 ; contient le titre de l'annonce et le statut « en attente ».
3. La page de suivi **ne contient pas** l'email du candidat (`jean@example.test`) ni de lien
   vers une pièce (`/cv`, `/piece-identite`).
4. Après acceptation : `GET /suivi/<token>` reflète « acceptée ».
5. Après refus (autre candidate Marie) : `GET /suivi/<tokenMarie>` reflète « refusée ».
6. `GET /suivi/zzdoesnotexist` → 404.

Les emails sont best-effort et, en test (`SMTP_HOST=''`), journalisés sans envoi réel ; on ne
les assert pas directement — la couverture porte sur l'état observable (token + page de
suivi). La présence du `trackingToken` prouve que le flux d'envoi a reçu de quoi construire
le lien.

## Risques / points d'attention

- **Confidentialité de la page de suivi** : revue stricte du template pour ne rendre que les
  champs autorisés. Test dédié qui échoue si l'email du candidat apparaît.
- **Best-effort des emails** : ne jamais propager un échec d'envoi dans le flux HTTP.
- **Candidatures héritées** (`trackingToken NULL`) : pas de page de suivi ; emails accept/refus
  envoyés sans lien — comportement géré explicitement.
- **APP_URL** : le lien utilise `process.env.APP_URL` (défaut `http://localhost:3000`) ; à
  configurer correctement en production (déjà utilisé par les emails existants).
