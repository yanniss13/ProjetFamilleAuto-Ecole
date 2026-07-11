# Comparaison maquettes v1 / application finale

Date : 2026-07-10. Les maquettes du 23 juin 2026 (11 écrans HTML basse
fidélité, originaux intacts sous
[`../historique/2026-06/wireframes/`](../historique/2026-06/wireframes/index.html))
sont comparées aux écrans réellement livrés, capturés à 1440 px sur le jeu de
démonstration (`npm run seed:demo`, script
[`scripts/captures-jury.js`](../../scripts/captures-jury.js)).

Depuis le 2026-07-11, la chaîne complète est : **v1** (maquettes de juin,
intactes) → **v2** (30 wireframes filaires conformes à l'application livrée,
sous [`wireframes-v2/`](wireframes-v2/index.html), traçabilité dans
[`wireframes-v2/matrice-couverture.md`](wireframes-v2/matrice-couverture.md))
→ **final** (captures réelles sous [`captures/`](captures/)). La colonne
« Wireframe v2 » ci-dessous relie chaque écran maquetté en v1 à son état v2.

## 1. Écrans maquettés en v1

| Écran | Maquette v1 | Wireframe v2 | Application finale | Écarts et justification |
|---|---|---|---|---|
| Accueil | [wf-accueil](../historique/2026-06/spec-assets/wf-accueil.png) | [wf-v2-01](wireframes-v2/wf-v2-01-accueil.html) | [capture](captures/accueil.png) | Fidèle : promesse, deux appels à l'action. La navigation gagne l'entrée « Alertes » (lot I). |
| Liste des annonces | [wf-annonces](../historique/2026-06/spec-assets/wf-annonces.png) | [wf-v2-02](wireframes-v2/wf-v2-02-annonces.html) | [capture](captures/annonces.png) | Enrichie : recherche par ville + rayon avec distance affichée (lot E), badge « École vérifiée » (lot F), bascule vers la vue carte, lien « Créer une alerte » pré-rempli (lot I), pagination (lot A). |
| Détail d'annonce | [wf-annonce-detail](../historique/2026-06/spec-assets/wf-annonce-detail.png) | [wf-v2-04](wireframes-v2/wf-v2-04-annonce-detail.html) | [capture](captures/annonce-detail.png) | Fidèle : contenu, carte de localisation, formulaire de candidature à 4 pièces. S'ajoutent le badge de vérification (lot F) et le compteur de vues côté gestion (lot H). |
| Formulaire d'annonce | [wf-annonce-form](../historique/2026-06/spec-assets/wf-annonce-form.png) | [wf-v2-21](wireframes-v2/wf-v2-21-annonce-creation.html) | [capture](captures/annonce-form.png) | Fidèle aux champs prévus (titre, description, type, lieu, conditions). |
| Candidatures reçues | [wf-candidatures](../historique/2026-06/spec-assets/wf-candidatures.png) | [wf-v2-23](wireframes-v2/wf-v2-23-candidatures.html) | [capture](captures/candidatures.png) | Les 4 pièces sont téléchargeables comme prévu ; s'ajoutent les états de signature du contrat (lot G) et la pagination (lot A). Le filtre par statut prévu en v1 n'a pas été retenu (voir section 3). |
| Mon compte | [wf-compte](../historique/2026-06/spec-assets/wf-compte.png) | [wf-v2-25](wireframes-v2/wf-v2-25-mon-compte.html) | [capture](captures/compte.png) | Téléphone et adresse modifiables, avec autocomplétion d'adresse (lot L). Le changement de mot de passe passe par le flux « oublié » (voir section 3). |
| Connexion | [wf-connexion](../historique/2026-06/spec-assets/wf-connexion.png) | [wf-v2-09](wireframes-v2/wf-v2-09-connexion.html) | [capture](captures/connexion.png) | Fidèle (email + mot de passe, lien mot de passe oublié). |
| Contrat (acceptation) | [wf-contrat](../historique/2026-06/spec-assets/wf-contrat.png) | [wf-v2-24](wireframes-v2/wf-v2-24-contrat-ecole.html) | [capture](captures/contrat.png) | Champs contractuels prévus + identité du candidat, et surtout le **pad de signature de l'école** (dessin ou import) apparu au lot G — visible en bas de la capture pleine page. |
| Tableau de bord | [wf-dashboard](../historique/2026-06/spec-assets/wf-dashboard.png) | [wf-v2-19](wireframes-v2/wf-v2-19-dashboard-ecole.html) | [capture](captures/dashboard.png) | Transformé par le lot H : 5 tuiles, candidatures par semaine, entonnoir de recrutement, top annonces — le v1 ne prévoyait que des compteurs simples. |
| Inscription | [wf-inscription](../historique/2026-06/spec-assets/wf-inscription.png) | [wf-v2-10](wireframes-v2/wf-v2-10-inscription.html) | [capture](captures/inscription.png) | Champs prévus + vérification SIRET en direct (lot F) et autocomplétion d'adresse (lot L). |
| Mes annonces | [wf-mes-annonces](../historique/2026-06/spec-assets/wf-mes-annonces.png) | [wf-v2-20](wireframes-v2/wf-v2-20-mes-annonces.html) | [capture](captures/mes-annonces.png) | Fidèle : liste, statuts, actions (modifier, clôturer, supprimer), badge « contrat signé » en plus (lot G). |

## 2. Écrans nés après les maquettes

Ces écrans n'existaient pas en v1 : ils sont issus de la feuille de route
validée E→L, chacun avec sa spécification et ses tests. Tous sont désormais
maquettés en v2 (carte : wf-v2-03 ; suivi et signature : wf-v2-14 à 18 ;
alertes : wf-v2-05 à 08 ; administration : wf-v2-26 à 29 — voir le
[sommaire v2](wireframes-v2/index.html)).

| Écran | Capture | Origine et rôle |
|---|---|---|
| Carte des annonces | [carte.png](captures/carte.png) | Lot E — vue carte Leaflet groupée par école, filtrable par ville + rayon et département. |
| Suivi candidat | [suivi.png](captures/suivi.png) | Lots B et G — page publique par jeton opaque, sans aucune donnée personnelle ; la capture montre l'état final « contrat signé » avec téléchargement. |
| Administration | [admin.png](captures/admin.png) | Lots C, H et J — statistiques plateforme, modération, suspension, purge RGPD et son journal. |
| Alertes email | [alertes.png](captures/alertes.png) | Lot I — abonnement public en double opt-in (département + mot-clé). |

Le **pad de signature** est visible dans [contrat.png](captures/contrat.png)
(signature de l'école à l'acceptation). La page de contreseing candidat n'est
pas capturée : le jeu de démonstration ne contient aucun contrat « envoyé mais
non contresigné » (le dossier vitrine est déjà signé) et le script de captures
n'écrit rien en base ; elle sera montrée en direct pendant la démonstration
(elle est par ailleurs couverte par `test/lot-g.cjs`).

## 3. Prévu en v1, non réalisé sous cette forme

Écarts assumés, repris de
[`inventaire-documents-historiques.md`](inventaire-documents-historiques.md) :

| Prévu en v1 | Réalisé | Justification |
|---|---|---|
| Réouvrir une annonce clôturée | Clôture seulement | Une annonce pourvue ne doit pas réapparaître par erreur ; recréer est explicite et traçable. |
| Modifier son mot de passe depuis « Mon compte » | Flux « mot de passe oublié » | Un seul chemin de changement, durci (jeton haché, sessions ouvertes ailleurs détruites après réinitialisation). |
| Filtrer les candidatures par annonce **et statut** | Consultation par annonce, paginée | Les volumes réels par annonce restent faibles ; les états de signature sont déjà visibles ligne à ligne. |
| Une école connectée peut déposer une candidature | Refus explicite (`rejectBackOfficeApplication`) | Anti-usurpation : une session back-office ne doit pas produire de candidatures. |
| L'admin gère annonces/candidatures/contrats « comme une école » | Espace de modération séparé | Séparation des pouvoirs : l'admin suspend, retire et purge ; il n'agit jamais au nom d'une école. |
| Supprimer un compte école depuis l'admin | Suspension / réactivation | Réversible et conservateur : la suppression définitive emporterait contrats et obligations légales. |
| Admin et purge « prévus ultérieurement » | Livrés (lots C et J) | La feuille de route a rattrapé puis dépassé la v1. |

## Conclusion

La v1 a été maquettée avant toute ligne de code, respectée sur les parcours
fondamentaux, puis **dépassée par itérations spécifiées et testées** (lots A à
L). Les écarts ne sont pas des oublis : chacun est une décision produit
argumentée ci-dessus. Cette chronologie — maquette, réalisation fidèle,
itérations justifiées — est précisément ce que le critère « cohérence entre
maquette initiale et application finale » demande de démontrer.
