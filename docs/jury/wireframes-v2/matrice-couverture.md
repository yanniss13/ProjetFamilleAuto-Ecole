# Matrice de couverture — wireframes v2

Date : 2026-07-11. Une ligne par écran/état. « Contrôle structurel » =
`tools/check-wireframes.cjs` (30/30, unicité, champs, formulations interdites,
liens) ; « contrôle visuel » = inspection humaine du PNG 1440 px généré par
`tools/capture-wireframes.cjs`. La « capture finale de référence » renvoie à la
page réelle équivalente sous [`../captures/`](../captures/) quand elle existe
(15 pages du parcours jury), sinon « site local » (état accessible en lançant
l'application avec le seed de démo).

| ID | Fichier | Acteur | Route | Vue/source | État | Capture de référence | Structurel | Visuel |
|---|---|---|---|---|---|---|---|---|
| accueil | `wf-v2-01-accueil.html` | public | `GET /` | `index.twig` | visiteur | [`../captures/accueil.png`](../captures/accueil.png) | VALIDÉ | VALIDÉ |
| annonces | `wf-v2-02-annonces.html` | public | `GET /annonces` | `listings/index.twig` | liste filtrée | [`../captures/annonces.png`](../captures/annonces.png) | VALIDÉ | VALIDÉ |
| carte | `wf-v2-03-carte.html` | public | `GET /annonces?vue=carte` | `listings/index.twig` | carte filtrée | [`../captures/carte.png`](../captures/carte.png) | VALIDÉ | VALIDÉ |
| annonce-detail | `wf-v2-04-annonce-detail.html` | public | `GET /annonces/:id` | `listings/show.twig` | annonce ouverte | [`../captures/annonce-detail.png`](../captures/annonce-detail.png) | VALIDÉ | VALIDÉ |
| alertes | `wf-v2-05-alertes.html` | public | `GET /alertes` | `alerts/new.twig` | formulaire | [`../captures/alertes.png`](../captures/alertes.png) | VALIDÉ | VALIDÉ |
| alerte-confirmee | `wf-v2-06-alerte-confirmee.html` | public | `GET /alertes/confirmer/:token` | `alerts/confirmed.twig` | succès | site local | VALIDÉ | VALIDÉ |
| alerte-desabonnement | `wf-v2-07-alerte-desabonnement.html` | public | `GET /alertes/desabonner/:token` | `alerts/unsubscribe.twig` | confirmation | site local | VALIDÉ | VALIDÉ |
| alerte-supprimee | `wf-v2-08-alerte-supprimee.html` | public | `POST /alertes/desabonner/:token` | `alerts/unsubscribed.twig` | succès | site local | VALIDÉ | VALIDÉ |
| connexion | `wf-v2-09-connexion.html` | public | `GET /connexion` | `auth/login.twig` | formulaire | [`../captures/connexion.png`](../captures/connexion.png) | VALIDÉ | VALIDÉ |
| inscription | `wf-v2-10-inscription.html` | public | `GET /inscription` | `auth/register.twig` | formulaire | [`../captures/inscription.png`](../captures/inscription.png) | VALIDÉ | VALIDÉ |
| email-verifie | `wf-v2-11-email-verifie.html` | public | `GET /verifier-email/:token` | `auth/verify-notice.twig` | succès | site local | VALIDÉ | VALIDÉ |
| mot-de-passe-oublie | `wf-v2-12-mot-de-passe-oublie.html` | public | `GET /mot-de-passe-oublie` | `auth/forgot.twig` | formulaire | site local | VALIDÉ | VALIDÉ |
| reinitialisation | `wf-v2-13-reinitialisation.html` | public | `GET /reinitialiser/:token` | `auth/reset.twig` | jeton valide | site local | VALIDÉ | VALIDÉ |
| suivi-attente | `wf-v2-14-suivi-attente.html` | candidat | `GET /suivi/:token` | `tracking/show.twig` | pending | site local | VALIDÉ | VALIDÉ |
| suivi-refuse | `wf-v2-15-suivi-refuse.html` | candidat | `GET /suivi/:token` | `tracking/show.twig` | rejected | site local | VALIDÉ | VALIDÉ |
| suivi-accepte | `wf-v2-16-suivi-accepte.html` | candidat | `GET /suivi/:token` | `tracking/show.twig` | accepted, contrat envoyé | site local | VALIDÉ | VALIDÉ |
| signature-candidat | `wf-v2-17-signature-candidat.html` | candidat | `GET /suivi/:token/signer` | `tracking/sign.twig` | à signer | site local | VALIDÉ | VALIDÉ |
| suivi-signe | `wf-v2-18-suivi-signe.html` | candidat | `GET /suivi/:token` | `tracking/show.twig` | signé | [`../captures/suivi.png`](../captures/suivi.png) | VALIDÉ | VALIDÉ |
| dashboard-ecole | `wf-v2-19-dashboard-ecole.html` | école | `GET /tableau-de-bord` | `dashboard/index.twig` | données de démo | [`../captures/dashboard.png`](../captures/dashboard.png) | VALIDÉ | VALIDÉ |
| mes-annonces | `wf-v2-20-mes-annonces.html` | école | `GET /mes-annonces` | `dashboard/listings.twig` | ouverte et clôturée | [`../captures/mes-annonces.png`](../captures/mes-annonces.png) | VALIDÉ | VALIDÉ |
| annonce-creation | `wf-v2-21-annonce-creation.html` | école | `GET /mes-annonces/nouvelle` | `dashboard/listing_form.twig` | création | [`../captures/annonce-form.png`](../captures/annonce-form.png) | VALIDÉ | VALIDÉ |
| annonce-modification | `wf-v2-22-annonce-modification.html` | école | `GET /mes-annonces/:id/modifier` | `dashboard/listing_form.twig` | édition | site local | VALIDÉ | VALIDÉ |
| candidatures | `wf-v2-23-candidatures.html` | école | `GET /mes-annonces/:id/candidatures` | `dashboard/applications.twig` | états multiples | [`../captures/candidatures.png`](../captures/candidatures.png) | VALIDÉ | VALIDÉ |
| contrat-ecole | `wf-v2-24-contrat-ecole.html` | école | `GET /mes-annonces/:id/candidatures/:appId/accepter` | `dashboard/contract_form.twig` | signature école | [`../captures/contrat.png`](../captures/contrat.png) | VALIDÉ | VALIDÉ |
| mon-compte | `wf-v2-25-mon-compte.html` | école | `GET /mon-compte` | `dashboard/account.twig` | profil | [`../captures/compte.png`](../captures/compte.png) | VALIDÉ | VALIDÉ |
| connexion-admin | `wf-v2-26-connexion-admin.html` | admin | `GET /admin/connexion` | `admin/login.twig` | formulaire | site local | VALIDÉ | VALIDÉ |
| dashboard-admin | `wf-v2-27-dashboard-admin.html` | admin | `GET /admin` | `admin/dashboard.twig` | plateforme | [`../captures/admin.png`](../captures/admin.png) | VALIDÉ | VALIDÉ |
| admin-ecoles | `wf-v2-28-admin-ecoles.html` | admin | `GET /admin/ecoles` | `admin/schools.twig` | pagination | site local | VALIDÉ | VALIDÉ |
| admin-annonces | `wf-v2-29-admin-annonces.html` | admin | `GET /admin/annonces` | `admin/listings.twig` | pagination | site local | VALIDÉ | VALIDÉ |
| etats-systeme | `wf-v2-30-etats-systeme.html` | transversal | `403 / 404 / 429 / 500` | `errors/*.twig` + flashs | erreurs | site local | VALIDÉ | VALIDÉ |

Contrôles rejoués le 2026-07-11 : `check-wireframes.cjs` → « Wireframes v2 :
30/30 écrans, liens et formulations valides. » ; `capture-wireframes.cjs` →
« 30/30 PNG … 0 invalide(s) » (chaque PNG > 15 Ko, largeur 1440 exacte) ;
inspection visuelle des 30 PNG par lots de 4 à 5.
