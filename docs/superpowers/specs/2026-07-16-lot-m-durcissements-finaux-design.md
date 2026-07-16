# Lot M — durcissements finaux BFCache et session — conception

Date : 2026-07-16  
Statut : validé par l'utilisateur

## Objectif

Fermer deux angles résiduels du Lot M avant sa fusion dans `prisma-7`, sans
placer le temps réel sur le chemin critique de la page de suivi :

1. recréer le flux `EventSource` lorsqu'une page revient du BFCache ;
2. rendre la page de suivi même si la sauvegarde explicite de l'autorisation
   temps réel échoue.

## Retour depuis le BFCache

`pagehide` ferme toujours la source courante et neutralise ses travaux en
attente. Lorsqu'un événement `pageshow` arrive avec `event.persisted === true`,
le client recrée inconditionnellement une seule connexion temps réel pour le
contexte de la page.

Le gestionnaire de cycle précédent se retire avant cette recréation. Des cycles
BFCache successifs ne doivent donc accumuler ni gestionnaires `pagehide`, ni
gestionnaires `pageshow`, ni sources actives concurrentes.

Le rattrapage ne nécessite aucun mécanisme supplémentaire : le `onopen` de la
nouvelle source demande déjà le fragment frais. Une page précédemment arrêtée
par un 204 terminal peut retenter une fois au retour BFCache ; elle recevra un
nouveau 204 si la session reste invalide, puis retombera dans l'état terminal
existant.

Un `pageshow` ordinaire (`persisted !== true`) ne crée aucune nouvelle source.
Le client n'effectue aucun rechargement complet de page.

## Échec de la liaison de session

Dans `trackingController.show`, le bloc dégradable entoure uniquement
`bindRealtimeApplication(req, application.id)`. Les erreurs de recherche par
jeton et de rendu Twig continuent de remonter au gestionnaire d'erreurs Express.

Avant de modifier `req.session.realtimeApplicationIds`, la liaison conserve
l'état exact précédent de cette propriété. Si `req.session.save()` échoue, elle
restaure cet état puis relance l'erreur. Le contrôleur absorbe cette erreur de
liaison seulement et rend la page normalement.

Le rollback n'est pas une mesure de sécurité : le candidat a déjà présenté un
jeton valide. Il garantit un comportement déterministe. Sans rollback,
l'auto-sauvegarde Express de fin de réponse pourrait réussir après l'échec du
`save()` explicite et autoriser le flux selon une course. La règle devient :
« sauvegarde explicite échouée = pas de temps réel pour ce rendu ; la prochaine
visite retente la liaison ».

Aucun changement du client n'est requis pour ce cas. En l'absence d'identifiant
persisté, le flux répond 204 et le fragment 401 ; le client existant affiche
« Temps réel indisponible » par son chemin terminal.

## Preuves attendues

Les tests du Lot M doivent établir :

- `pagehide` ferme la première source ;
- `pageshow` persistant crée exactement une nouvelle source, dont `onopen`
  relit le fragment frais ;
- plusieurs cycles BFCache conservent une seule source active par cycle et un
  `pageshow` non persistant ne recrée rien ;
- un échec unique du store pendant le `save()` explicite produit une page de
  suivi 200 ;
- l'autorisation est rollbackée et le flux candidat suivant répond 204 ;
- les erreurs de recherche et de rendu ne sont pas absorbées par ce mécanisme.

Les tests `test/lot-m.cjs`, la suite complète, `prisma validate` et
`git diff --check` doivent être verts avant la fusion.
