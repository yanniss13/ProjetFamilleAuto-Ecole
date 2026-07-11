# Inventaire des documents historiques

Date de la revue : 2026-07-10

Ce document explique comment réutiliser les fichiers ajoutés au dépôt sans confondre
la conception de juin 2026 avec l'état actuel de l'application. Les originaux n'ont pas
été modifiés pendant la revue.

## Règle de reprise

Les documents datés du 22 au 25 juin 2026 sont des **preuves de conception initiale**.
Ils ne doivent pas être présentés comme une description exacte des lots A à L livrés
ensuite. Pour la soutenance :

1. conserver les originaux comme version initiale ;
2. produire une version actuelle ou un addendum daté ;
3. expliquer les écarts entre le prévu et le réalisé ;
4. prendre le code, les migrations, les tests et `AGENTS.md` comme vérité actuelle.

## Inventaire et usage recommandé

| Fichiers | Date | Rôle | État actuel | Usage recommandé |
|---|---:|---|---|---|
| `docs/historique/2026-06/CAHIER-DES-CHARGES.md` | 22/06 | Expression du besoin | Le besoin et les acteurs restent pertinents. Il parle de mots de passe « chiffrés » au lieu de « hachés » et annonce un déploiement qui n'est pas documenté. | Conserver comme v1, puis créer une v2 actualisée pour le jury. |
| `docs/historique/2026-06/SPECIFICATIONS-FONCTIONNELLES-ET-TECHNIQUES.md` | 23/06 | Spécifications principales | Document riche de 26 pages, mais antérieur aux lots E à L. L'administration et la purge y sont encore futures. | Source éditable à consolider ; le PDF du même nom est un export à régénérer après mise à jour. **Fait le 2026-07-11 :** v2 dans [`docs/jury/specifications-v2.md`](specifications-v2.md). |
| `docs/historique/2026-06/decoupage/decoupage-fonctionnel.{html,xlsx,pdf}` | 23/06 | Liste des fonctions par module et acteur | Environ 40 fonctions historiques. Plusieurs sont absentes ou ont changé ; les lots E à L manquent. | Garder les trois formats comme v1 et produire un tableau actuel séparé. Le HTML est le plus facile à relire, le PDF est l'export de présentation. |
| `docs/historique/2026-06/wireframes/*.html` | 23/06 | Maquettes initiales navigables | 11 écrans plus un sommaire. Lisibles et cohérents avec le MVP initial, mais sans alertes, rayon, suivi, signature, statistiques avancées, admin ou purge. | **Ne pas écraser.** Les présenter comme maquettes initiales et créer un tableau des écarts avec l'application finale. **Fait le 2026-07-11 :** 30 wireframes v2 sous [`docs/jury/wireframes-v2/`](wireframes-v2/index.html) (les v1 restent intactes) ; écarts dans [`comparaison-maquettes.md`](comparaison-maquettes.md). |
| `docs/historique/2026-06/spec-assets/wf-*.png` et `docs/historique/2026-06/wireframes/moniteur-connect-wireframe.svg` | 23/06 | Exports des maquettes | 11 PNG lisibles et une planche SVG globale. | Utiliser les PNG dans le dossier et le diaporama ; conserver le HTML comme source. |
| `docs/historique/2026-06/diagrammes/diagramme-fonctionnel.{md,pdf}` | 24/06 | Flux global, processus, données, architecture et cas d'utilisation | Le fond initial est exploitable, mais les diagrammes s'arrêtent avant les lots récents. | Mettre à jour le Markdown ou créer une version 2 ; régénérer ensuite le PDF. **Fait le 2026-07-11 :** v2 dans [`docs/jury/diagramme-fonctionnel-v2.md`](diagramme-fonctionnel-v2.md). |
| `docs/historique/2026-06/diagrammes/diagramme-cas-utilisation-*.pdf` et `docs/historique/2026-06/spec-assets/cas-utilisation-*.{svg,png}` | 24/06 | Cas d'utilisation moniteur et auto-école | Diagrammes lisibles. Ils ne couvrent pas l'administrateur ni les alertes, le suivi et la signature. | Conserver comme v1 et créer un addendum ou une v2 complète. **Fait le 2026-07-11 :** v2 dans [`docs/jury/diagrammes/cas-utilisation-v2.svg`](diagrammes/cas-utilisation-v2.svg). |
| `docs/historique/2026-06/diagrammes/{mcd.pdf,mld.pdf,mcd-looping.sql}` et `docs/historique/2026-06/spec-assets/{mcd,mld}.{svg,png}` | 24–25/06 | MCD/MLD historique | Seulement 4 entités : école, annonce, candidature, contrat. Le schéma Prisma actuel en possède 8. Les noms français du SQL ne correspondent pas aux modèles Prisma anglais. | Actualiser à partir de `prisma/schema/` ; ne pas utiliser tel quel devant le jury. |
| `docs/historique/2026-06/spec-assets/{architecture.png,modele-donnees.png}` | 23–24/06 | Architecture et modèle simplifié | Très lisibles, mais antérieurs aux sessions Prisma, à l'admin, aux alertes, à la purge et aux API SIRET/Adresse. | Réutiliser le style graphique pour une version 2 actuelle. |
| `docs/_a_retirer_du_projet/captures-cours-uml/image1.png` à `image8.png` | 24/06 | Captures d'un cours École R17 sur les diagrammes UML | Supports pédagogiques tiers, non spécifiques à MoniteurConnect. | Examiner puis retirer ce dossier du projet ; ne pas présenter ces images comme des livrables. **Fait le 2026-07-12 :** dossier supprimé. |

## Écarts confirmés avec le code actuel

### Fonctions livrées après les documents

Les sources historiques omettent tout ou partie des éléments suivants :

- recherche par rayon et vue carte des annonces ;
- vérification SIRET en direct ;
- suivi candidat par jeton opaque ;
- signature électronique école/candidat et PDF final avec empreintes SHA-256 ;
- tableaux de bord statistiques ;
- alertes email en double opt-in ;
- purge RGPD automatique et journalisée ;
- seed de démonstration ;
- autocomplétion d'adresse ;
- sessions persistantes en base et durcissements issus des revues de code.

### Fonctions historiques non présentes sous la forme décrite

| Prévu dans les documents | État constaté dans le code actuel |
|---|---|
| Réouvrir une annonce | Aucune route de réouverture ; seule la clôture existe dans `src/routes/manageRoutes.js`. |
| Modifier son mot de passe depuis « Mon compte » | Le profil modifie téléphone/adresse. Le mot de passe passe par le flux « oublié/réinitialiser ». |
| Filtrer les candidatures par annonce et statut | Les candidatures sont consultées par annonce et paginées, sans filtre de statut. |
| Une auto-école connectée peut déposer une candidature | Le code refuse explicitement toute candidature depuis une session école ou admin (`rejectBackOfficeApplication`). |
| L'admin gère les annonces, candidatures, contrats et profils comme une école | L'admin dispose d'un espace de modération séparé : statistiques, écoles, annonces, suspension/réactivation, suppression d'annonce et purge. |
| Supprimer un compte auto-école depuis l'admin | L'admin suspend ou réactive ; aucune route de suppression d'école n'existe. |
| Administration et purge « prévues ultérieurement » | Elles sont livrées et testées dans les lots C, H et J. |
| Quatre entités de données | Le schéma actuel contient `School`, `Listing`, `Application`, `Contract`, `Session`, `Admin`, `Alert` et `PurgeRun`. |

## Décision documentaire recommandée

Ne pas corriger silencieusement les wireframes d'origine. La meilleure preuve pour le
jury est une chronologie :

- **v1 — juin 2026** : besoin, spécifications, wireframes et MCD/MLD initiaux ;
- **itérations — fin juin/début juillet** : lots A à L, spécifications et plans TDD ;
- **v2 — préparation jury** : dossier consolidé, modèle de données actuel et tableau
  « prévu / réalisé / écart justifié ».

Cette approche valorise l'itération et évite de faire passer des documents rétrospectifs
pour des documents écrits avant le développement.
