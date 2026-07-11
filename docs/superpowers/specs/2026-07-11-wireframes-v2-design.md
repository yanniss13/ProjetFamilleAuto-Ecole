# Wireframes v2 exhaustifs — conception validée

Date : 2026-07-11.

## Objectif

Produire une maquette filaire v2 qui corresponde fonctionnellement à 100 % à
l'application MoniteurConnect livrée. Les wireframes de juin 2026 restent
intacts sous `docs/historique/2026-06/` : ils constituent la v1 et la preuve de
conception initiale. La v2 vit exclusivement sous `docs/jury/wireframes-v2/`.

Le jury doit pouvoir suivre la chronologie suivante : wireframes v1, écarts
issus des lots A à L, wireframes v2 conformes, puis captures du produit final.

## Principe graphique

La v2 reste une maquette filaire, pas une copie haute fidélité des captures.
Elle emploie une palette grise, des contours simples et une typographie système.
En revanche, la structure, les champs, les actions, les statuts, les messages
et la navigation correspondent exactement aux vues et routes actuelles.

Un kit partagé fournit la navigation publique, école et administration, les
cartes, tableaux, formulaires, badges, flashs, pagination, états vides et blocs
de signature. Aucun écran ne redéfinit ces composants localement.

## Livrables

- `docs/jury/wireframes-v2/index.html` : sommaire navigable par acteur ;
- un fichier HTML autonome par écran, utilisant `wireframe-v2.css` ;
- `docs/jury/wireframes-v2/matrice-couverture.md` : écran, rôle, route, vue
  Twig, état représenté, capture finale et statut de vérification ;
- un PNG pleine page par écran sous `docs/jury/wireframes-v2/png/` ;
- une planche SVG avec miniatures et légende des acteurs ;
- un PDF paginé avec couverture, sommaire, écrans et routes ;
- un lien depuis le README jury, les spécifications v2 et la comparaison des
  maquettes.

## Inventaire des écrans

### Espace public

1. Accueil (`GET /`).
2. Liste des annonces, filtres et pagination (`GET /annonces`).
3. Carte des annonces et rayon (`GET /annonces?vue=carte`).
4. Détail d'annonce et candidature (`GET /annonces/:id`).
5. Alertes email — abonnement (`GET /alertes`).
6. Alertes — confirmation du double opt-in (`GET /alertes/confirmer/:token`).
7. Alertes — confirmation de désabonnement (`GET /alertes/desabonner/:token`).
8. Connexion auto-école (`GET /connexion`).
9. Inscription avec SIRET et adresse (`GET /inscription`).
10. Mot de passe oublié (`GET /mot-de-passe-oublie`).
11. Réinitialisation du mot de passe (`GET /reinitialiser/:token`).

### Espace candidat par jeton

12. Suivi en attente.
13. Suivi refusé.
14. Suivi accepté, contrat à signer.
15. Signature candidat avec pad, import et consentement (`GET /suivi/:token/signer`).
16. Suivi signé avec téléchargement et empreinte SHA-256.

Les cinq états de suivi utilisent la même structure partagée, mais restent des
écrans distincts dans le dossier et le PDF : ils portent des décisions et des
actions différentes.

### Espace auto-école

17. Tableau de bord statistique (`GET /tableau-de-bord`).
18. Mes annonces avec états ouverte/clôturée (`GET /mes-annonces`).
19. Création d'annonce (`GET /mes-annonces/nouvelle`).
20. Modification d'annonce (`GET /mes-annonces/:id/modifier`).
21. Candidatures d'une annonce : attente, refus, contrat envoyé et signé
    (`GET /mes-annonces/:id/candidatures`).
22. Acceptation, termes et signature école
    (`GET /mes-annonces/:id/candidatures/:appId/accepter`).
23. Mon compte avec autocomplétion d'adresse (`GET /mon-compte`).

La maquette n'affiche jamais de réouverture d'annonce, de filtre de candidature
par statut ou de changement de mot de passe depuis Mon compte, car ces fonctions
n'existent pas dans le produit.

### Administration

24. Connexion admin (`GET /admin/connexion`).
25. Dashboard plateforme et purge RGPD (`GET /admin`).
26. Modération des écoles, suspension et réactivation (`GET /admin/ecoles`).
27. Modération et retrait des annonces (`GET /admin/annonces`).

L'administration ne supprime pas une école et n'agit jamais au nom d'une école.

### États système

28. Planche des états transversaux : succès, erreur de validation, limite 429,
    CSRF expiré, 403, 404 et 500. Les états sont regroupés, car ils ne constituent
    pas des parcours autonomes.

## Navigation et annotations

Chaque écran affiche la navigation réellement disponible pour son rôle. Une
barre d'annotation séparée du contenu indique : identifiant WF-V2, route GET,
vue Twig correspondante, rôle et état de données. Les liens internes du
wireframe mènent aux écrans v2 appropriés ; aucune action ne pointe vers la v1.

Les actions POST sont représentées par leurs boutons et accompagnées de la
route dans la matrice, sans simuler une écriture. Les variantes mobile ne sont
pas dupliquées : une planche responsive montre le burger, la pile en une colonne
et les tableaux défilants à 320 px.

## Source de vérité et méthode de contrôle

La conformité ne repose pas sur une appréciation visuelle seule. Pour chaque
écran, la matrice est vérifiée contre :

1. le routeur dans `src/routes/` ;
2. le contrôleur et la vue Twig rendue ;
3. les champs, actions et conditions présents dans la vue ;
4. la capture finale correspondante sous `docs/jury/captures/` lorsqu'elle
   existe ;
5. le site local seedé pour les écrans ou états sans capture actuelle.

Un contrôle automatisé vérifie les liens HTML, l'existence de chaque route et
vue citées, l'absence des formulations historiques périmées et la présence des
28 entrées dans la matrice. Le contrôle visuel compare ensuite chaque PNG au
site réel, en se concentrant sur la hiérarchie et les fonctions plutôt que sur
les couleurs de production.

## Exports et qualité

Les captures sont produites à 1440 px, sans texte tronqué ni débordement. La
planche SVG est validée comme XML. Le PDF répète le nom de l'écran, sa route et
son numéro de page. Les liens, le SVG et chaque page du PDF sont contrôlés avant
livraison.

La suite applicative est exécutée en fin de chantier afin de confirmer qu'aucun
code produit n'a été modifié. Les commits utilisent des chemins explicites et
ne contiennent ni v1, ni capture finale existante, ni JSON de conformité.

## Hors périmètre

- modification du code, des vues, du CSS ou des scripts de l'application ;
- modification des wireframes v1 ou de leurs exports ;
- régénération des captures finales et des JSON de conformité ;
- reproduction pixel à pixel de la charte graphique finale ;
- simulation fonctionnelle d'envois de formulaire dans les wireframes.
