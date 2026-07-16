# Lot M — Suivi des candidatures en temps réel (design)

Date : 2026-07-16
Statut : validé, prêt pour plan d'implémentation.

## Contexte

MoniteurConnect couvre déjà le parcours complet d'une candidature : dépôt sans
compte, suivi par jeton opaque, acceptation ou refus par l'école, établissement
du contrat, invitation à signer et contreseing du candidat. Chaque page affiche
l'état juste après une navigation ou une redirection, mais une page restée
ouverte ne découvre pas les changements réalisés depuis un autre appareil.

Le Lot M ajoute une actualisation en direct, volontairement limitée à ce
parcours existant. L'effet recherché pour la soutenance est immédiatement
visible : une action sur le téléphone candidat se reflète sur l'écran école, et
inversement, sans actualisation manuelle. Le temps réel reste un enrichissement
progressif ; il ne devient jamais une dépendance du métier.

## Décisions validées

1. **Server-Sent Events natifs.** Le navigateur utilise `EventSource` et le
   serveur répond en `text/event-stream`. Le besoin est unidirectionnel du
   serveur vers chaque page ; WebSocket et nouvelle dépendance front seraient
   superflus.
2. **Événements d'invalidation uniquement.** Un événement indique qu'une
   candidature a changé, sans transporter de document, de jeton ni de donnée
   personnelle. Le navigateur redemande ensuite au serveur un fragment HTML
   autorisé et rendu depuis l'état frais de la base.
3. **Base de données comme source de vérité.** Les événements peuvent être
   perdus sans perdre une modification métier. À chaque ouverture ou
   réouverture du flux, le navigateur récupère systématiquement le fragment
   courant.
4. **Sessions pour les requêtes candidat après le premier lien.** Le jeton reste
   nécessaire pour ouvrir `/suivi/:token`, comme aujourd'hui. Après validation,
   la session mémorise seulement l'identifiant de candidature autorisé ; les
   URLs SSE et fragment ne répètent pas le jeton.
5. **Adaptateur mémoire isolé.** La première version cible un processus Node
   unique, suffisant pour la démonstration locale et une production
   mono-instance. L'interface du service pourra recevoir plus tard un adaptateur
   PostgreSQL `LISTEN/NOTIFY` ou Redis, sans modifier les contrôleurs.
6. **Aucune migration Prisma.** Les autorisations candidat temporaires vivent
   dans la session existante et les abonnements vivent en mémoire.
7. **Aucun QR code dans le produit.** Un QR contenant le jeton de suivi serait un
   secret de signature affichable à des tiers. Un QR de démonstration pourra
   être préparé séparément depuis l'URL régénérée par `npm run seed:demo`.

## Objectifs et périmètre

### Changements visibles couverts

| Action confirmée en base | Page école | Page candidat |
|---|---|---|
| Dépôt d'une candidature | nouvelle carte sur la première page de la liste | sans objet |
| Acceptation et création/réédition du contrat | carte actualisée dans un autre onglet école | statut accepté ou contrat en préparation |
| Refus | carte actualisée dans un autre onglet école | statut refusé |
| Envoi réussi de l'invitation à signer | carte « en attente de signature » | boutons de lecture et de signature |
| Contreseing candidat | badge et téléchargement du PDF signé | état signé et téléchargement du PDF final |

Les publications ont lieu seulement après la réussite de l'écriture Prisma qui
fait foi. `realtimeService.publish` est best-effort et ne lève jamais vers le
contrôleur : une déconnexion ou une erreur SSE ne transforme jamais une action
métier réussie en erreur HTTP.

### Hors périmètre

- chat, messagerie instantanée et présence « utilisateur en ligne » ;
- notifications push système, service worker ou PWA ;
- historique persistant et rejeu des événements ;
- WebSocket, Redis, broker externe ou fonctionnement multi-instance ;
- QR code contenant un jeton candidat dans l'interface publique ;
- mise à jour en direct des statistiques et des pages administrateur ;
- remplacement des emails existants : ils restent le canal durable et le temps
  réel reste un confort lorsque la page est ouverte.

## Architecture

### Service d'abonnements

`src/services/realtimeService.js` encapsule une table
`Map<canal, Set<abonné>>`, sans exposer ce choix aux contrôleurs. Son interface
publique minimale est :

- construction normalisée des canaux école/annonce et candidature ;
- `subscribe(channel, subscriber)` : enregistre le callback et renvoie une
  fonction `unsubscribe()` idempotente ;
- `publish(channel, event)` : appelle les abonnés présents, isole l'échec d'un
  abonné et ne lève jamais ;
- suppression du canal lorsque son dernier abonné part.

Les canaux sont séparés par annonce pour la liste école et par candidature pour
le suivi candidat. La charge utile est bornée à un type d'événement connu et à
un identifiant numérique de candidature. Aucune PII et aucun jeton de suivi ne
sont publiés.

### Endpoints SSE et fragments

Deux familles de flux sont ajoutées dans les routeurs existants :

- **école** : `GET /mes-annonces/:listingId/candidatures/temps-reel` pour le
  flux et `GET /mes-annonces/:listingId/candidatures/:applicationId/carte` pour
  le fragment, protégés par la session école et la propriété de l'annonce ;
- **candidat** : `GET /suivi/temps-reel/:applicationId` pour le flux et
  `GET /suivi/fragment/:applicationId` pour le fragment, protégés par
  l'autorisation enregistrée dans la session après ouverture d'un jeton valide.

Les routes statiques de temps réel sont déclarées avant `/:token` dans
`trackingRoutes`, afin qu'elles ne soient jamais interprétées comme un jeton.
Les réponses fragment école réutilisent le même contrôle de possession que les
téléchargements de pièces. Une ressource valide appartenant à une autre école
renvoie 404 et ne révèle donc pas son existence.

Les middlewares `requireAuth` et `loadSchool` distinguent exclusivement ces
requêtes grâce à leurs en-têtes : `Accept: text/event-stream` pour un flux et
`X-Realtime-Fragment: 1` pour un fragment `fetch` de même origine. Sans session
école valide, ils répondent respectivement 204 et 401. Toutes les navigations
HTML ordinaires conservent leur redirection et leur message flash actuels.

Un flux valide envoie les en-têtes suivants avant tout abonnement :

- `Content-Type: text/event-stream; charset=utf-8` ;
- `Cache-Control: no-store` ;
- `Connection: keep-alive` ;
- `X-Accel-Buffering: no` pour empêcher la mise en tampon par un futur proxy.

Le contrôleur appelle `flushHeaders()`, écrit `retry: 5000` puis un commentaire
de connexion. Les invalidations utilisent `event: invalidate` et un `data` JSON
minimal. Les heartbeats sont des commentaires SSE, jamais des événements
métier. Aucun identifiant d'événement ni `Last-Event-ID` n'est utilisé, puisque
le protocole choisit le rattrapage par relecture du fragment plutôt que le rejeu.

CSRF ne s'applique pas : ces endpoints GET ne modifient aucune donnée. La CSP
reste stricte, car tout JavaScript demeure dans `public/js/realtime.js`.

### Liaison candidat à la session

Après résolution réussie de `/suivi/:token`, le contrôleur ajoute l'identifiant
de la candidature dans `req.session.realtimeApplicationIds`, liste bornée aux
cinq accès les plus récents. Il ne stocke jamais le jeton. La session est
explicitement sauvegardée avant le rendu afin que le script `defer` ne puisse
pas ouvrir son premier flux avant la persistance de cette autorisation.

Cette liste permet plusieurs onglets de suivi dans un même navigateur sans que
le deuxième écrase l'autorisation du premier. Une session absente ou qui ne
contient pas l'identifiant demandé reçoit :

- `204 No Content` sur le flux SSE, statut qui ordonne à `EventSource` d'arrêter
  ses reconnexions ;
- `401 Unauthorized` sur le fragment ;
- `404 Not Found` lorsque l'identifiant autorisé ne correspond plus à une
  candidature existante.

Le lien initial `/suivi/:token` contient toujours le secret, conformément au
parcours existant. Le dépôt ne journalise actuellement pas les URLs des requêtes.
La documentation de production précisera néanmoins que les journaux d'un
reverse proxy doivent masquer ce segment. Les URLs SSE et fragment, plus
fréquentes, ne contiennent jamais le jeton.

### Fragments et DOM

Deux partials Twig deviennent les unités de remplacement :

- `views/tracking/_status.twig` rend le statut, les explications, les boutons de
  contrat et les empreintes déjà visibles sur la page de suivi ;
- `views/dashboard/_application-card.twig` rend une carte candidature complète,
  avec ses documents et actions autorisés.

Les vues complètes incluent ces partials au premier rendu. Après un événement,
le script récupère le partial approprié, le parse comme document HTML, vérifie
la présence de la racine attendue, puis remplace uniquement cette racine. Il
n'exécute aucun script reçu et n'utilise aucun texte de l'événement comme HTML.
Twig continue d'échapper toutes les données utilisateur.

Une séquence ou un `AbortController` neutralise une réponse ancienne si deux
rafraîchissements se chevauchent. La mise à jour ne déplace pas le focus. Si
l'élément actuellement focalisé appartient au fragment à remplacer, le script
ne remplace pas pendant une saisie ; il affiche plutôt une invitation discrète
à actualiser. Les actions métier ordinaires restent des formulaires et liens
serveur.

Sur la première page des candidatures, une nouvelle candidature est insérée en
tête sans rechargement. Sur une page paginée ultérieure, ou si l'insertion rend
les contrôles de pagination potentiellement obsolètes, un bandeau « Une nouvelle
candidature est disponible » propose l'actualisation au lieu de modifier la
composition de la page. Une carte déjà présente peut être remplacée sur toutes
les pages.

## Cycle de connexion et rattrapage

1. Au chargement, le HTML serveur est déjà complet et utilisable.
2. Le script ouvre un seul `EventSource` pour la page.
3. Chaque événement `open`, y compris après reconnexion, déclenche une lecture
   du fragment frais. Ce rattrapage couvre tous les événements perdus pendant
   une coupure.
4. Chaque événement d'invalidation déclenche la même lecture, avec dédoublonnage
   des requêtes concurrentes.
5. Le serveur écrit un commentaire heartbeat toutes les 25 secondes pour garder
   le flux actif à travers les intermédiaires réseau.
6. Le serveur ferme volontairement le flux après 5 minutes. Cette borne force
   une nouvelle validation de session et constitue aussi un filet de
   rafraîchissement périodique si un signal a été perdu.
7. Si la session reste valide, la reconnexion native reprend. Si elle a expiré,
   la réponse 204 arrête définitivement `EventSource` pour cette page.

Une réponse SSE ouverte ne repasse pas spontanément dans le middleware de
session. La durée maximale est donc une exigence de sécurité, pas seulement une
optimisation réseau. Elle permet également à `express-session` et au
`PrismaSessionStore` de terminer le cycle de réponse et d'appliquer leur logique
de `touch`.

Le service n'ajoute aucune boucle rapide. Il laisse `EventSource` appliquer sa
temporisation native lors d'une coupure ordinaire. Le script appelle
explicitement `close()` lors d'un état terminal, à la navigation et à la
destruction de la page.

## Nettoyage serveur

Chaque contrôleur conserve la fonction `unsubscribe()` renvoyée par le service.
Un unique nettoyage idempotent :

- arrête le heartbeat ;
- arrête le minuteur de durée maximale ;
- retire l'abonné du canal ;
- tolère plusieurs appels sans erreur.

Il est branché sur l'événement `close` de la réponse et appelé aussi avant la
fermeture volontaire des cinq minutes. Un abonné déconnecté ne reçoit plus
aucune publication et un canal vide disparaît de la table mémoire.

## Expérience visuelle et accessibilité

Un partial commun contient un indicateur avec `role="status"` et
`aria-live="polite"`. Il expose trois états :

- « Actualisation en direct » lorsque le flux est ouvert ;
- « Reconnexion en cours » pendant une coupure récupérable ;
- « Temps réel indisponible — actualisez la page si nécessaire » lorsque le
  flux est fermé définitivement ou que l'autorisation a expiré.

Les changements métier sont annoncés dans une seconde zone polie, avec un texte
court comme « Le contrat est maintenant prêt à signer ». Les annonces ne volent
jamais le focus, n'ouvrent pas de modale et ne déclenchent pas de son. Les
couleurs ne sont pas le seul moyen de distinguer les états.

Sans `EventSource`, sans JavaScript ou après une erreur réseau durable, le
contenu rendu côté serveur reste complet. Les formulaires, les redirections,
les emails et l'actualisation manuelle conservent exactement le comportement
actuel.

## Gestion des erreurs et limites connues

- Une erreur d'abonné est isolée dans `realtimeService` ; les autres abonnés
  reçoivent toujours l'événement et l'action métier reste réussie.
- Un fragment non 200, redirigé ou dont la racine attendue manque n'est jamais
  injecté. L'ancien contenu reste affiché avec un état dégradé.
- Une session expirée produit un arrêt terminal sans boucle de reconnexion
  agressive.
- En HTTP/1.1, les navigateurs limitent couramment à environ six les connexions
  simultanées par origine. Chaque page MoniteurConnect consomme au maximum un
  flux ; de nombreux onglets peuvent donc atteindre cette limite. HTTP/2 ou une
  mutualisation inter-onglets serait l'évolution ultérieure, hors Lot M.
- L'adaptateur mémoire ne propage pas les événements entre plusieurs processus
  Node. Une production multi-instance devra le remplacer par un bus partagé.
- Les événements ne constituent ni un journal ni une preuve : seuls les états
  Prisma, les horodatages du contrat et les emails existants ont cette fonction.

## Stratégie de tests

Le développement suit le TDD dans `test/lot-m.cjs`, sur le port 4072, ajouté à
la commande `npm test`. Les données restent suffixées par `STAMP` et sont
nettoyées en `finally` sans supposer une base vide.

### Preuves automatisées comportementales — Node et HTTP

- isolation des canaux école/annonce et candidature ;
- publication à plusieurs abonnés malgré l'échec de l'un d'eux ;
- désabonnement idempotent et suppression d'un canal vide ;
- vraie coupure cliente : ouverture du flux, abonné présent, destruction de la
  requête HTTP, événement `close`, publication, callback désormais absent ;
- en-têtes SSE, premier signal et heartbeat avec délais de test raccourcis ;
- fermeture forcée avec un délai configurable uniquement pour le test ;
- ouverture d'un jeton candidat valide, sauvegarde de l'identifiant en session
  et URLs de flux/fragment sans jeton ;
- session absente ou supprimée du `PrismaSessionStore` : 204 sur le flux et 401
  sur le fragment ;
- annonce d'une autre école et candidature non autorisée : 404 ;
- émission après dépôt, acceptation, refus, envoi réussi et signature, jamais
  avant la persistance correspondante ;
- réponse HTML serveur complète en l'absence de JavaScript ;
- première page école capable de recevoir une nouvelle carte, page ultérieure
  basculant vers le bandeau d'actualisation.

Le script navigateur peut être exécuté dans `vm` avec un faux DOM et un faux
`EventSource`, selon le précédent de `test/lot-l.cjs`, afin de vérifier la
machine d'états et l'appel de rafraîchissement à chaque `open`. Cette simulation
ne constitue pas un test dans un vrai navigateur.

### Preuves automatisées structurelles

Le harnais Node contrôle :

- la présence de `role="status"`, `aria-live="polite"` et des libellés dans le
  HTML rendu ;
- le chargement du script externe avec `defer`, sans JavaScript inline ;
- l'absence du jeton de suivi dans les URLs configurant les requêtes temps réel ;
- les branches JavaScript prévues pour `OPEN`, `CONNECTING`, `CLOSED`, les
  réponses 204/401 et la fermeture explicite.

Ces assertions prouvent la structure attendue, pas le rendu visuel, le
comportement natif réel d'`EventSource` ni la conservation effective du focus
dans un moteur de navigateur.

### Contrôle manuel dans un vrai navigateur

Avant de déclarer le lot terminé, un scénario navigateur complète obligatoirement
les tests Node :

1. ouvrir simultanément le suivi candidat et la liste école ;
2. vérifier les cinq transitions métier sans actualisation manuelle ;
3. couper puis rétablir le réseau et constater le passage
   « Reconnexion en cours » puis le rattrapage ;
4. supprimer/expirer la session et constater l'état terminal sans rafale de
   requêtes ;
5. garder le focus au clavier pendant une actualisation et vérifier qu'il n'est
   ni perdu ni déplacé ;
6. contrôler `aria-live` et les annonces avec les outils d'accessibilité du
   navigateur ;
7. répéter la scène ordinateur/téléphone sur le même réseau local.

Les résultats de ce contrôle sont consignés dans le compte rendu de livraison ;
ils ne sont pas présentés comme des assertions de `test/lot-m.cjs`.

## Fichiers prévus

| Fichier | Nature |
|---|---|
| `src/services/realtimeService.js` | nouveau service d'abonnements mémoire |
| `src/controllers/realtimeController.js` | endpoints SSE, fragments et cycle de connexion |
| `src/routes/trackingRoutes.js` | routes candidat statiques avant `/:token` |
| `src/routes/manageRoutes.js` | routes école dans l'espace déjà protégé |
| `src/middlewares/requireAuth.js`, `src/middlewares/loadSchool.js` | réponses 204/401 ciblées par en-tête, redirections HTML inchangées |
| `src/controllers/trackingController.js` | liaison bornée de la candidature à la session |
| `src/controllers/applicationController.js` | publication après création |
| `src/controllers/contractController.js` | publications après acceptation, refus et envoi |
| `src/controllers/signatureController.js` | publication après contreseing |
| `views/tracking/_status.twig` | nouveau fragment d'état candidat |
| `views/tracking/show.twig` | inclusion du fragment et configuration sans jeton |
| `views/dashboard/_application-card.twig` | nouvelle carte école réutilisable |
| `views/dashboard/applications.twig` | inclusion des cartes, indicateur et pagination |
| `views/partials/realtime-status.twig` | indicateur accessible commun |
| `public/js/realtime.js` | EventSource, rattrapage et remplacement DOM |
| `public/css/style.css` | états visuels et bandeau discret |
| `test/lot-m.cjs`, `package.json` | tests TDD et intégration à la suite |
| `AGENTS.md`, documents jury concernés | état du lot et scénario de démonstration après livraison |

## Critères d'acceptation

Le Lot M est terminé lorsque :

1. les cinq transitions du tableau sont visibles entre deux pages ouvertes sans
   actualisation manuelle dans le scénario nominal ;
2. une coupure suivie d'une reconnexion recharge l'état Prisma courant, même si
   tous les événements intermédiaires ont été perdus ;
3. une session expirée arrête proprement le flux et n'entraîne aucune boucle
   agressive ;
4. toute déconnexion libère son abonnement, son heartbeat et son minuteur ;
5. aucun flux ou fragment ne contourne l'isolation école ou l'autorisation
   candidat ;
6. le parcours complet fonctionne toujours sans JavaScript ;
7. les tests Node distinguent explicitement preuves comportementales,
   structurelles et vérifications manuelles navigateur ;
8. `npm test` réussit intégralement et le scénario ordinateur/téléphone est
   rejoué avant livraison.
