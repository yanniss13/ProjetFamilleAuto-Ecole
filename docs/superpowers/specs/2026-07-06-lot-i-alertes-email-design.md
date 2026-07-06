# Lot I — Alertes email moniteurs (design)

Date : 2026-07-06
Statut : validé, prêt pour plan d'implémentation.

## Contexte

Aujourd'hui un moniteur doit revenir consulter `/annonces` pour découvrir les
nouvelles offres. Le Lot I lui permet de s'abonner (sans compte, comme pour les
candidatures) à une alerte email : dès qu'une annonce correspondant à ses critères
est publiée, il reçoit un email avec le lien. Dernier lot « visible » de la démo
jury avant la purge RGPD (Lot J).

## Décisions validées

1. **Critères : département + mot-clé optionnel.** Pas de ville+rayon (dépendance
   géocodage des deux côtés, fragile) : un email, un département, un mot-clé libre
   facultatif (ex. « CDI », « moto »).
2. **Envoi immédiat à la publication**, en fire-and-forget (même pattern que le
   géocodage à l'inscription) : la publication d'une annonce ne dépend JAMAIS des
   emails. Pas de récap quotidien, pas de scheduler.
3. **Double opt-in.** L'alerte n'est active qu'après clic sur un lien de
   confirmation reçu par email : personne ne peut abonner l'adresse d'un tiers.
   Argument RGPD à l'oral, et prépare le Lot J (purge des alertes non confirmées).

## Objectifs / périmètre

Dans le périmètre :

- **Modèle `Alert`** (migration via la recette diff+deploy — contrainte unique,
  donc surtout pas `migrate dev`) :
  ```prisma
  model Alert {
    id           Int     @id @default(autoincrement())
    email        String
    department   String
    keyword      String? // affiché tel que saisi
    keywordLower String  @default("") // matching + unicité ("" = pas de mot-clé)

    // Double opt-in : jeton de confirmation HASHÉ (comme verifyTokenHash de School,
    // via services/tokens.generateToken) ; confirmedAt null tant que non confirmé.
    confirmTokenHash String?   @unique
    confirmedAt      DateTime?

    // Désabonnement : jeton opaque EN CLAIR (comme trackingToken du Lot B, via
    // generateOpaqueToken) — faible sensibilité, nécessaire pour reconstruire le
    // lien dans chaque email d'alerte.
    unsubscribeToken String @unique

    createdAt DateTime @default(now())

    @@unique([email, department, keywordLower])
    @@index([department])
  }
  ```
- **Routes publiques** (`src/routes/alertRoutes.js`, monté dans `routes/index.js`,
  contrôleur `src/controllers/alertController.js`) :
  - `GET /alertes` — formulaire (email, département, mot-clé optionnel), pré-rempli
    depuis la query string (`?departement=`, `?q=` → mot-clé) ;
  - `POST /alertes` — validation puis création + envoi de l'email de confirmation.
    Rate-limité (10 requêtes / 15 min / IP, comme les limiteurs existants).
    **Message neutre identique dans tous les cas** (anti-énumération) : « Si votre
    adresse est valide, un email de confirmation vient de vous être envoyé. » ;
  - `GET /alertes/confirmer/:token` — active l'alerte (lookup par hash du jeton).
    **Idempotent** : le jeton est conservé après confirmation, un re-clic ré-affiche
    la page de succès (même décision que la vérification d'email école). Jeton
    inconnu → 404 ;
  - `GET /alertes/desabonner/:token` — page de confirmation avec bouton (PAS de
    désabonnement au simple GET : les antivirus/webmails préchargent les liens) ;
  - `POST /alertes/desabonner/:token` — **suppression réelle** de la ligne (RGPD).
    Jeton inconnu → 404 sur les deux routes.
- **Service `src/services/alertService.js`** :
  - `subscribe(email, department, keyword)` → gère le doublon sur
    `(email, department, keywordLower)` : alerte inexistante → création + jeton de
    confirmation ; existante non confirmée → régénère le jeton (renvoi de l'email) ;
    existante confirmée → ne fait rien (le message public reste le même). Renvoie
    `{ alert, rawConfirmToken | null }` ;
  - `confirmByTokenHash(hash)` — pose `confirmedAt` si null, renvoie l'alerte ;
  - `findByUnsubscribeToken(token)` / `deleteByUnsubscribeToken(token)` ;
  - `notifyNewListing(listing)` — **ne lève jamais** (catch interne, fire-and-forget
    côté appelant) : sélectionne les alertes `confirmedAt != null` du département de
    l'annonce, filtre en JS le mot-clé (`keywordLower` contenu dans
    titre/description/ville en minuscules — mêmes colonnes `*Lower` que la
    recherche), puis envoie les emails via `Promise.allSettled`.
- **Déclenchement** : dans `listingController.create`, après `createForSchool`,
  appel `alertService.notifyNewListing(listing)` SANS `await` — la réponse HTTP ne
  dépend pas des envois. Uniquement à la création (pas à l'édition ni à la
  réouverture — YAGNI).
- **Mailer** (`src/services/mailer.js`, mêmes conventions : `esc()` sur tout texte
  utilisateur, `send` ne lève jamais, mode dev = lien loggé) :
  - `sendAlertConfirmation(email, department, keyword, rawToken)` — rappel des
    critères + lien `/alertes/confirmer/<jeton>` ;
  - `sendListingAlert(email, listing, unsubscribeToken)` — titre, ville, lien vers
    `/annonces/<id>`, et lien de désabonnement `/alertes/desabonner/<jeton>` dans
    chaque email (obligation d'opt-out).
- **Validation** (`src/validators/alertValidator.js`) : email (format + longueur
  max), département (même règle que les annonces), mot-clé optionnel (longueur max
  100). Erreurs → re-rendu du formulaire en 400 avec messages en français.
- **Vues** (`views/alerts/`) : `new.twig` (formulaire), `confirmed.twig` (succès de
  confirmation + lien vers `/annonces`), `unsubscribe.twig` (page bouton),
  `unsubscribed.twig` (confirmation de suppression). Typographie française partout.
- **Points d'entrée** : lien « Créer une alerte pour cette recherche » sur
  `/annonces` (pré-rempli avec les filtres courants `departement`/`q`) + entrée
  « Alertes » dans la navigation publique.

Hors périmètre (YAGNI) :
- Récap quotidien / scheduler, alertes ville+rayon, modification d'une alerte (se
  désabonner et en recréer une), gestion/liste des alertes côté admin, expiration du
  jeton de confirmation (les alertes jamais confirmées seront purgées par le Lot J).

## Architecture

### Flux

1. Moniteur remplit `/alertes` → ligne `Alert` non confirmée + email de
   confirmation (best-effort) → message neutre.
2. Clic sur le lien → `confirmedAt` posé → page de succès (re-clic : même page).
3. Une école publie une annonce → `notifyNewListing` en arrière-plan → emails aux
   alertes confirmées et correspondantes, chacun avec son lien de désabonnement.
4. Clic sur « se désabonner » → page avec bouton → POST → ligne supprimée.

### Sécurité

- Jeton de confirmation haché en base (`tokens.generateToken`) : une fuite de la
  base ne permet pas de forger un lien d'activation. Jeton de désabonnement opaque
  en clair (`generateOpaqueToken`) : il ne donne accès à rien d'autre que la
  suppression de sa propre alerte.
- Anti-énumération : `POST /alertes` répond toujours pareil, qu'une alerte existe
  déjà ou non ; rien dans la réponse ne révèle si l'email est connu.
- `esc()` sur titre/ville/mot-clé dans les emails (texte utilisateur), comme les
  emails existants du Lot B.
- CSRF : formulaires classiques (urlencoded), couverts par le middleware global —
  aucune route multipart, rien à ajouter à `DEFERRED_MULTIPART`.

### Gestion d'erreurs

- Échec d'envoi d'un email d'alerte : silencieux (`Promise.allSettled` + catch
  global dans le service) — la publication de l'annonce n'échoue jamais à cause des
  alertes, et un destinataire en erreur n'empêche pas les autres.
- Échec de l'email de confirmation : le message public reste le même (best-effort,
  comme la confirmation de candidature du Lot B).
- Jetons inconnus (confirmation, désabonnement) : 404 standard.

## Tests (`test/lot-i.cjs`, port 4065, ajouté à `npm test`)

Le mailer est intercepté en réassignant les fonctions de l'objet exporté (pattern
des lots B/G). Le déclenchement étant fire-and-forget, les vérifications après
publication utilisent une attente bornée (`eventually`, pattern du Lot H).

- inscription : POST crée l'alerte non confirmée, `sendAlertConfirmation` appelé,
  message neutre affiché ;
- doublon : re-POST du même triplet → pas de seconde ligne, message identique ;
- confirmation : le lien active l'alerte (`confirmedAt` posé), re-clic = succès
  (idempotent), jeton inconnu → 404 ;
- publication d'une annonce correspondante → `sendListingAlert` appelé pour
  l'alerte confirmée uniquement (PAS pour la non confirmée, PAS pour un autre
  département, PAS si le mot-clé ne matche pas) ; mot-clé insensible à la casse ;
- la publication réussit (302) même si `sendListingAlert` lève une exception ;
- désabonnement : GET affiche la page bouton, POST supprime la ligne, jeton
  inconnu → 404 ;
- validation : email invalide → 400 avec le formulaire ré-affiché ;
- `/annonces` contient le lien « Créer une alerte » pré-rempli ;
- nettoyage : suppression des alertes et données `STAMP` en `finally`.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `prisma/schema.prisma` + migration | modèle `Alert` |
| `src/services/alertService.js` | nouveau (subscribe, confirm, unsubscribe, notify) |
| `src/services/mailer.js` | `sendAlertConfirmation`, `sendListingAlert` |
| `src/validators/alertValidator.js` | nouveau |
| `src/controllers/alertController.js` | nouveau |
| `src/routes/alertRoutes.js` + `src/routes/index.js` | routes publiques |
| `src/controllers/listingController.js` | déclenchement dans `create` |
| `views/alerts/*.twig` (4 vues) | formulaire + pages jeton |
| `views/listings/index.twig`, `views/partials/nav.twig` | points d'entrée |
| `test/lot-i.cjs` + `package.json` + `AGENTS.md` | tests + intégration |
