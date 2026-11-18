# Messagerie école ↔ moniteur — design court

Date : 2026-11-18. Approuvé par le propriétaire (« go ») sur la version 1.

## Intention

Permettre à l'auto-école et au moniteur d'échanger à propos d'une candidature
(précisions, disponibilités, pièces à compléter) sans quitter la plateforme,
le moniteur restant **sans compte** : son lien de suivi `/suivi/<jeton>` fait
office d'accès.

## Décisions du propriétaire

- Chaque message part **par email** au destinataire (lien vers le fil) **et**
  apparaît **en direct** si le fil est ouvert.
- Le fil est **ouvert** tant que la candidature est « en attente » ou
  « acceptée » ; **lecture seule** après un refus ; supprimé avec la
  candidature par la purge RGPD.

## Approches considérées

1. **Fil intégré aux pages existantes** — retenu : bloc « Messages » sur la
   page de suivi du moniteur, fil par candidature côté école depuis la carte
   de candidature, compteur de non-lus. Réutilise le bus temps réel du lot M
   (signal d'invalidation + fragment HTML) et le mailer.
2. Boîte de réception côté école listant toutes les conversations : plus
   confortable, mais une page et des requêtes en plus ; peut venir ensuite.
3. Messagerie complète (pièces jointes, accusés détaillés) : trop lourde,
   surface de risque fichiers.

## Design

- **Données** : modèle `Message` (id, applicationId → Application en
  `onDelete: Cascade`, `author` « school » | « applicant », `body` texte
  1–2 000 caractères, `createdAt`, `readAt` nullable). Index sur
  `applicationId`. La purge supprime les messages avec la candidature.
- **Côté école** (`/mes-annonces/:id/candidatures/:appId/messages`, GET + POST),
  scopé par `findOwnedById` : afficher le fil, marquer comme lus les messages du
  moniteur à l'ouverture, formulaire si le fil est ouvert. La carte de
  candidature affiche un lien « Messages » avec le nombre de non-lus.
- **Côté moniteur** (`/suivi/:token/messages`, POST ; fil affiché sur la page
  de suivi) : le jeton fait office d'auth ; les messages de l'école sont
  marqués lus à l'affichage du suivi.
- **Fil fermé** (candidature refusée) : formulaire masqué et POST refusé
  (redirection + message).
- **Temps réel** : nouvel événement `message-created` publié sur le canal de
  la candidature et sur celui de l'annonce ; les pages rechargent le fil via
  un fragment. Sans JavaScript, tout fonctionne par formulaire + redirection.
- **Emails** : `sendNewMessage` au destinataire, sans recopier le texte du
  message (le lien suffit, pas de donnée personnelle dans la boîte mail au-delà
  du nécessaire), best-effort comme les autres envois.
- **Sécurité** : CSRF existant, texte échappé par Twig, limiteur d'envoi
  (30 messages / 15 min par IP), longueur bornée, ressource d'une autre école
  → 404.

## Laissé au développeur

Libellés exacts, mise en page du fil dans la charte existante, découpage des
fichiers (service `messageService`, contrôleur `messageController`, partials).
