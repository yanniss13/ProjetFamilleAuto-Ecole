# Démonstration — déroulé des 11 minutes

Date : 2026-07-10. Fenêtre : minutes 14 à 25 de la soutenance (voir le
[deck](soutenance.html)). Règle d'or : le seed fournit des états déjà riches —
on ne saisit en direct que ce qui a de la valeur devant le jury.

## Préparation (la veille, puis re-vérifiée 1 h avant)

1. `.env` : `SMTP_HOST=localhost`, `SMTP_PORT=1025` (sans `SMTP_USER` — le
   transport n'envoie pas de bloc d'authentification, c'est prévu pour
   Mailpit). Lancer Mailpit, vérifier http://localhost:8025.
2. `npm run dev` — vérifier http://localhost:3000.
3. `npm run seed:demo` — noter les identifiants et l'URL de suivi affichés en
   fin de script (le jeton change à chaque seed).
4. Préparer sur le bureau : `cv.pdf`, `identite.pdf`, `permis.pdf`,
   `carte-enseignant.pdf` (petits PDF de test).
5. Onglets pré-ouverts, dans cet ordre :
   1. http://localhost:3000/annonces
   2. http://localhost:8025 (Mailpit)
   3. http://localhost:3000/connexion
   4. http://localhost:3000/admin
   5. `docs/jury/captures/` ouvert dans l'explorateur (secours)
6. Comptes (post-it hors caméra) : école vitrine
   `ecole.vitrine@demo.moniteur-connect.example` / `demo1234` — admin
   `admin@demo.moniteur-connect.example` / `admin1234`.
7. Zoom navigateur 125 %, notifications OS coupées, session école/admin
   déconnectée (navigation privée recommandée).

### Préparation temps réel

- démarrer le serveur, puis exécuter le seed avec
  `DEMO_BASE_URL` réglée sur l'adresse IPv4 LAN du PC et le port 3000 ;
- ouvrir sur le téléphone l'URL « Suivi candidat (temps réel, en attente) » ;
- ouvrir sur le PC la liste des candidatures de l'annonce correspondante ;
- conserver deux onglets PC comme scénario de secours si le réseau local refuse
  le téléphone.

## Déroulé minuté

| Min | Onglet / URL | Action | Phrase clé | Critères couverts |
|---|---|---|---|---|
| 14:00 | `/annonces` | Rechercher « Marseille », rayon 25 km | « Recherche par ville et rayon — les distances sont calculées serveur. » | Front/back, recherche |
| 14:45 | même page | Basculer en vue carte, survoler un marqueur | « Les annonces groupées par école, Leaflet auto-hébergé — aucune ressource externe, CSP stricte. » | Carte, sécurité |
| 15:30 | annonce phare | Ouvrir le détail | « Badge École vérifiée : le SIRET est contrôlé au répertoire Sirene à l'inscription, jamais bloquant. » | API externe, intégrité |
| 16:15 | même page | Dérouler le formulaire de candidature, joindre les 4 pièces, envoyer | « Aucun compte moniteur : c'est le choix produit central. Les fichiers sont contrôlés par contenu, pas par extension. » | Formulaires, uploads |
| 17:30 | Mailpit | Ouvrir l'email de confirmation, cliquer le lien de suivi | « Le candidat suit son dossier par un jeton opaque — la page n'expose aucune donnée personnelle. » | Emails, RGPD |
| 18:15 | `/connexion` | Connexion école vitrine → candidatures de l'annonce | « Toute requête de gestion est scopée par l'école : une autre école recevrait 404. » | Auth, droits |
| 19:00 | candidature fraîche | Accepter : remplir le contrat, **dessiner la signature au pad**, valider | « Le téléphone candidat vient de passer à Acceptée sans actualisation ; le serveur n'a envoyé qu'un signal, puis la page a relu l'état autorisé en base. » | Métier, temps réel |
| 20:30 | même écran | Envoyer l'invitation à signer | « Le PDF est horodaté et son empreinte SHA-256 est calculée ; l'email reste le canal durable. » | Workflow, PDF, crypto |
| 21:00 | suivi candidat | Cocher l'acceptation, signer et valider ; montrer le badge « Contrat signé » apparaître côté école | « Le PDF final porte les deux signatures et une nouvelle empreinte. » | Signature, sécurité, temps réel |
| 22:30 | page de suivi | Télécharger le PDF final signé, montrer la page des signatures | « Horodatages et empreintes des deux versions : le dossier est traçable de bout en bout. » | Sorties |
| 23:00 | `/tableau-de-bord` | Faire défiler tuiles, barres, entonnoir | « Statistiques calculées serveur, SVG construits en DOM — zéro bibliothèque de graphiques. » | Dashboard |
| 23:45 | `/admin` | Connexion admin, montrer stats plateforme puis **« Lancer une purge maintenant »** | « L'alerte jamais confirmée du jeu de démo vient d'être supprimée : la purge RGPD est journalisée — voici le compteur. » | Admin, RGPD |
| 24:45 | — | Retour au deck | « Voyons maintenant comment la signature est implémentée. » | Transition focus code |

Total : ~11 minutes. Si une étape déborde, sacrifier 23:00 (dashboard) — les
statistiques sont aussi sur la diapositive de secours.

## Scénario de secours (si le direct casse)

Dans l'ordre du déroulé, montrer les captures versionnées (mêmes écrans,
mêmes données de démo) : [`../captures/annonces.png`](../captures/annonces.png),
[`../captures/carte.png`](../captures/carte.png),
[`../captures/annonce-detail.png`](../captures/annonce-detail.png),
[`../captures/suivi.png`](../captures/suivi.png) (état « contrat signé »),
[`../captures/candidatures.png`](../captures/candidatures.png),
[`../captures/contrat.png`](../captures/contrat.png) (pad de signature),
[`../captures/dashboard.png`](../captures/dashboard.png),
[`../captures/admin.png`](../captures/admin.png). Le dossier **déjà signé du
seed** reste montrable même sans refaire le parcours : URL de suivi affichée
en fin de `npm run seed:demo` (PDF final téléchargeable). Les diapositives
18-20 du deck reprennent ces captures — la démo peut se faire entièrement
sur le deck en dernier recours.

## Reset (après chaque répétition)

`npm run seed:demo` : supprime et recrée toutes les données de démo, y
compris l'alerte antidatée que la purge consomme en direct. Les candidatures
saisies à la main pendant la répétition disparaissent aussi (elles portent le
domaine réel saisi — les supprimer via l'admin si besoin, ou les laisser :
elles n'apparaissent que dans l'espace de l'école vitrine).

**Attention** : la purge automatique tourne 30 s après le démarrage du
serveur — si le serveur a tourné avant la démo, l'alerte purgeable a déjà été
consommée. Relancer `npm run seed:demo` APRÈS le démarrage du serveur.
