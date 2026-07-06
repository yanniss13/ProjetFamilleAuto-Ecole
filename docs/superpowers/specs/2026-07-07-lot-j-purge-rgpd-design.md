# Lot J — Purge RGPD automatique (design)

Date : 2026-07-07
Statut : validé, prêt pour plan d'implémentation.

## Contexte

La plateforme accumule des données personnelles qui n'ont plus de raison d'être
conservées : alertes email jamais confirmées, candidatures refusées (avec CV,
pièce d'identité, permis…), jetons de vérification/réinitialisation expirés.
Le Lot J les purge automatiquement, avec une trace visible côté admin — dernier
lot de la feuille de route jury, et l'argument « conformité » de l'oral.

## Décisions validées

1. **Périmètre : trois catégories.** Alertes jamais confirmées (> 7 jours),
   candidatures refusées (> 180 jours, fichiers compris), jetons expirés des
   écoles (mis à null). Les candidatures acceptées et les contrats ne sont
   JAMAIS purgés (valeur légale).
2. **Déclenchement : automatique au démarrage + CLI.** Exécution différée au
   démarrage du serveur puis toutes les 24 h (`setInterval` unref'd, même
   pattern que le nettoyage des sessions), plus `npm run purge` à la main.
3. **Traçabilité : journal en base + dashboard admin.** Table `PurgeRun`
   (date + compteurs), « Dernière purge RGPD » affichée sur `/admin`, et un
   bouton « Lancer une purge maintenant » (POST admin) pour la démo.

## Objectifs / périmètre

Dans le périmètre :

- **Colonne `Application.rejectedAt DateTime?`** — posée par
  `applicationService.updateStatus` quand le statut passe à `rejected` (null
  sinon). C'est la date de départ du délai de purge ; repli sur `createdAt`
  pour les lignes refusées avant ce lot (colonne null).
- **Modèle `PurgeRun`** :
  ```prisma
  model PurgeRun {
    id                   Int      @id @default(autoincrement())
    ranAt                DateTime @default(now())
    unconfirmedAlerts    Int
    rejectedApplications Int
    expiredTokens        Int
  }
  ```
  (Migration des deux via la recette diff+deploy.)
- **Service `src/services/purgeService.js`** :
  - Délais : `ALERT_DAYS` (défaut 7, env `PURGE_ALERTES_JOURS`) et
    `REJECTED_DAYS` (défaut 180, env `PURGE_CANDIDATURES_REFUSEES_JOURS`),
    lus à l'exécution (surchargables par les tests) ;
  - `runPurge()` → `{ unconfirmedAlerts, rejectedApplications, expiredTokens }` :
    1. `alert.deleteMany` où `confirmedAt: null` ET `createdAt < now − ALERT_DAYS` ;
    2. candidatures `status: 'rejected'` dont `rejectedAt < now − REJECTED_DAYS`
       (ou `rejectedAt: null` ET `createdAt < now − REJECTED_DAYS`) : `findMany`
       (avec contrat par sécurité), suppression best-effort des fichiers via
       `deleteStored` (cv, pièce d'identité, permis, carte enseignant + chemins
       de contrat s'il en reste), puis `deleteMany` par ids ;
    3. jetons école : `updateMany` où `verifyTokenExpiry < now` → null sur
       `verifyTokenHash`/`verifyTokenExpiry` ; idem pour `resetTokenHash`/
       `resetTokenExpiry`. `expiredTokens` = somme des deux `count` ;
    4. écrit une ligne `PurgeRun` avec les compteurs et la renvoie (les
       compteurs remontent à l'appelant : CLI, route admin, tests).
    `runPurge` peut lever (l'appelant décide) ;
  - `findLatestRun()` — dernière ligne `PurgeRun` (dashboard admin) ;
  - `schedulePurge()` — lance un premier run différé (~30 s) puis toutes les
    24 h ; timers `unref()` ; chaque run sous try/catch avec log
    (`[purge] ...`) : une purge qui échoue ne doit jamais tuer le serveur.
- **Démarrage** : `schedulePurge()` appelé dans `src/server.js` APRÈS le
  démarrage du serveur — PAS dans `app.js` : les tests importent `app` et ne
  doivent déclencher aucun timer de purge.
- **Script CLI `scripts/purge.js`** (+ `"purge": "node scripts/purge.js"` dans
  `package.json`) : charge dotenv, appelle `runPurge()`, affiche les compteurs
  en français, code de sortie 1 en cas d'erreur.
- **Dashboard admin** (`adminController.dashboard` + `views/admin/dashboard.twig`) :
  bloc « Purge RGPD » sous les graphiques — dernière purge (date + compteurs,
  ou mention « aucune purge pour l'instant ») et formulaire bouton
  « Lancer une purge maintenant » ;
- **Route `POST /admin/purge`** (adminRoutes, protégée comme les autres actions
  admin) : `runPurge()` puis flash succès avec les compteurs, redirection
  `/admin`. En cas d'erreur : circuit d'erreur normal (500).

Hors périmètre (YAGNI) :
- Purge des annonces clôturées (pas de PII au-delà de l'école), anonymisation
  partielle, écran d'historique complet des purges (la dernière suffit),
  réglage des délais dans l'UI admin, planificateur externe (cron système).

## Architecture

### Ordre et sûreté

- Les fichiers des candidatures sont supprimés AVANT les lignes (sinon les
  chemins sont perdus) ; `deleteStored` est best-effort — un fichier déjà
  absent ne fait pas échouer la purge.
- Chaque catégorie est indépendante : l'échec d'une requête fait échouer le
  run (pas de compteurs partiels trompeurs dans `PurgeRun`) ; le run planifié
  suivant retentera.
- Aucune donnée d'école active n'est touchée : seuls les JETONS expirés sont
  nettoyés, jamais les comptes.

### Gestion d'erreurs

- Boucle planifiée : try/catch + `console.error('[purge] ...')` — le serveur
  survit toujours.
- CLI : message d'erreur en français + exit 1.
- Route admin : `next(err)` (page 500 standard).

## Tests (`test/lot-j.cjs`, port 4066, ajouté à `npm test`)

Données antidatées via `prisma...create` puis `update` du `createdAt`/`rejectedAt` ;
fichiers réels créés dans `storage/` pour vérifier leur suppression physique ;
délais par défaut (7/180 jours) — les seeds sont antidatés au-delà.

- `updateStatus(..., 'rejected')` pose `rejectedAt` ; un autre statut le laisse null ;
- purge des alertes : vieille non confirmée supprimée ; récente non confirmée
  ET vieille confirmée conservées ;
- purge des candidatures : vieille refusée supprimée AVEC ses fichiers sur
  disque ; vieille refusée sans `rejectedAt` (repli `createdAt`) supprimée ;
  refusée récente, vieille acceptée et vieille en attente conservées ;
- jetons : école avec jetons expirés → hash et expiry à null ; jetons encore
  valides conservés ; compteur = nombre de nettoyages ;
- `PurgeRun` : ligne écrite avec les bons compteurs ; `findLatestRun` la renvoie ;
- admin : `/admin` affiche la dernière purge et le bouton ; `POST /admin/purge`
  (session admin) purge et redirige avec flash ; sans session admin → redirection
  connexion (garde existante) ;
- `scripts/purge.js` existe et est branché dans `package.json` (vérification
  statique — le CLI est un wrapper mince de `runPurge`, déjà testé).

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `prisma/schema.prisma` + migration | `Application.rejectedAt` + modèle `PurgeRun` |
| `src/services/applicationService.js` | `updateStatus` pose `rejectedAt` |
| `src/services/purgeService.js` | nouveau (runPurge, findLatestRun, schedulePurge) |
| `src/server.js` | appel `schedulePurge()` |
| `scripts/purge.js` + `package.json` | CLI `npm run purge` |
| `src/controllers/adminController.js` + `src/routes/adminRoutes.js` | tuile + `POST /admin/purge` |
| `views/admin/dashboard.twig` | bloc « Purge RGPD » |
| `test/lot-j.cjs` + `package.json` + `AGENTS.md` | tests + intégration + passation |
