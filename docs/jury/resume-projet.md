# MoniteurConnect — résumé du projet

Date : 2026-07-10. Ce résumé décrit l'application **telle qu'elle est livrée**
aujourd'hui (MVP + lots A à L). L'expression du besoin détaillée se trouve dans
[`expression-du-besoin-v2.md`](expression-du-besoin-v2.md).

## Le problème

Les auto-écoles peinent à recruter des moniteurs diplômés : les canaux
généralistes (job boards grand public, petites annonces) ne vérifient ni le
diplôme, ni l'autorisation d'enseigner, et imposent aux moniteurs indépendants
de créer un compte pour chaque plateforme. Côté auto-école, constituer un
dossier de recrutement complet (CV, pièce d'identité, permis, autorisation
d'enseigner) puis contractualiser reste un processus manuel et dispersé.

## Les acteurs

- **L'auto-école** : seul compte en libre-service. Elle s'inscrit (email
  vérifié, SIRET contrôlé au répertoire Sirene), publie des annonces, reçoit
  des dossiers complets, accepte ou refuse, génère et signe le contrat.
- **Le moniteur indépendant** : aucun compte à créer. Il consulte les annonces
  (liste, recherche, carte, rayon), postule avec ses quatre pièces
  justificatives, suit son dossier par un lien opaque reçu par email et
  contresigne son contrat en ligne.
- **L'administrateur** : compte créé par script, espace de modération séparé
  (statistiques plateforme, suspension d'écoles, retrait d'annonces, purge
  RGPD).

## La solution

Un **job board métier** : publication d'annonces qualifiées (type de contrat,
ville, département, volume horaire, rémunération), candidature publique avec
pièces jointes stockées en privé, workflow d'acceptation qui débouche sur un
**contrat PDF signé électroniquement** par les deux parties (horodatages et
empreintes SHA-256), le tout sans jamais exiger de compte côté moniteur.

## La valeur

- **Friction minimale côté moniteur** : postuler prend une page, le suivi et la
  signature passent par un simple lien.
- **Dossier complet côté école** : quatre pièces vérifiées (types et contenus),
  contrat généré et traçable, tableaux de bord de recrutement.
- **Confiance et conformité** : SIRET vérifié en direct, fichiers privés,
  purge RGPD automatique et journalisée, double opt-in des alertes email.

## Le périmètre livré

MVP (inscription école, annonces, candidatures à 4 pièces, contrats PDF,
emails, carte de localisation), puis onze lots itératifs livrés et un numéro
réservé :

- **A** — correctifs : recherche insensible à la casse, pagination, CSP stricte,
  nettoyage des fichiers orphelins ;
- **B** — notifications candidat et page de suivi par jeton opaque ;
- **C** — administration : modération, suspension, cloisonnement des sessions ;
- **D** — numéro réservé, non ouvert et non compté parmi les lots livrés ;
- **E** — carte des annonces et recherche par ville + rayon ;
- **F** — vérification SIRET en direct (API Recherche d'entreprises) ;
- **G** — signature électronique du contrat (pad canvas, PDF final, SHA-256) ;
- **H** — tableaux de bord statistiques école et admin (SVG sans bibliothèque) ;
- **I** — alertes email moniteurs en double opt-in ;
- **J** — purge RGPD automatique et journalisée ;
- **K** — jeu de données de démonstration relançable (`npm run seed:demo`) ;
- **L** — autocomplétion d'adresse (API Adresse, relais interne).

Trois revues de code transverses ont durci l'ensemble (CSRF multipart, magic
bytes, sessions en base, invalidation de sessions après reset...).

## La stack

Node.js (CommonJS) + Express 5, rendu serveur Twig, Prisma (SQLite en
développement, PostgreSQL ciblé en production avec une chaîne de migrations
dédiée), sessions persistées en base, Leaflet auto-hébergé, PDFKit,
Nodemailer. **15 fichiers de tests, 448 assertions**, sans framework de test —
TDD systématique documenté dans [`../../AGENTS.md`](../../AGENTS.md).
