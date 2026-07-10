# MoniteurConnect — expression du besoin (v2)

**Version :** 2.0 · **Date :** 2026-07-10 · remplace pour la présentation la
[v1 du 22 juin 2026](../historique/2026-06/CAHIER-DES-CHARGES.md), conservée
intacte comme preuve de conception initiale.

## Chronologie

1. **v1 — 22 juin 2026** : cahier des charges, spécifications, wireframes et
   MCD/MLD initiaux, classés sous [`docs/historique/2026-06/`](../historique/2026-06/README.md).
2. **Itérations — fin juin / début juillet 2026** : MVP puis lots A à L, chacun
   avec sa spécification et son plan TDD (`docs/superpowers/{specs,plans}/`).
3. **v2 — 10 juillet 2026** : le présent document, aligné sur l'application
   réellement livrée. Les écarts avec la v1 sont récapitulés en fin de document
   et détaillés dans [`comparaison-maquettes.md`](comparaison-maquettes.md).

## Le besoin

Le secteur de la conduite manque de moniteurs et les auto-écoles peinent à
recruter. Le client veut une **plateforme web** qui met en relation les
auto-écoles et les moniteurs indépendants : les auto-écoles publient des
offres, les moniteurs y répondent en ligne, et la plateforme accompagne la
démarche **jusqu'au contrat signé**. C'est un site d'annonces spécialisé —
sans paiement en ligne, ni planning, ni facturation entre les parties.

## Objectifs

1. Publier et trouver des annonces qualifiées (métier, lieu, conditions).
2. Réduire la friction côté moniteur : candidature complète **sans compte**.
3. Sécuriser le dossier côté école : pièces vérifiées, accès privé, traçabilité.
4. Contractualiser en ligne : PDF généré, signé par les deux parties, prouvable.
5. Rester conforme : minimisation des données, purge automatique, double opt-in.

## Acteurs et cas d'usage livrés

**Visiteur / moniteur (sans compte)** : consulter les annonces (liste,
recherche par mots-clés, filtre département, recherche par ville et rayon, vue
carte) ; voir le détail avec la localisation de l'école et son badge « École
vérifiée » ; postuler avec 4 pièces (CV, pièce d'identité, permis,
carte/autorisation d'enseigner) ; suivre son dossier via un lien opaque reçu
par email ; contresigner le contrat en ligne ; s'abonner à des alertes email
(double opt-in) et s'en désabonner.

**Auto-école (compte en libre-service)** : s'inscrire (email vérifié, SIRET
contrôlé au répertoire Sirene, adresse autocomplétée) ; gérer ses annonces
(création, modification, clôture, suppression) ; consulter les candidatures et
télécharger les pièces (accès limité à ses propres annonces) ; refuser ou
accepter avec établissement du contrat et **signature au pad** ; inviter le
candidat à contresigner ; suivre son activité (vues, candidatures, entonnoir,
top annonces).

**Administrateur (compte créé par script)** : espace séparé et cloisonné ;
statistiques plateforme ; modération des annonces (retrait) et des écoles
(suspension/réactivation) ; déclenchement et journal des purges RGPD.

## Contraintes

- **Sécurité** : mots de passe **hachés** (bcrypt), sessions régénérées à la
  connexion et persistées en base, CSRF sur tous les POST, CSP stricte sans
  script inline, rate limiting sur les routes sensibles, validation serveur
  systématique (formats, longueurs), contrôle des magic bytes des fichiers,
  stockage privé hors de `public/`, accès aux pièces réservé à l'école
  propriétaire.
- **RGPD** : minimisation (la page de suivi n'expose aucune donnée personnelle),
  purge automatique journalisée (alertes non confirmées : 7 jours ;
  candidatures refusées et leurs fichiers : 180 jours ; jetons expirés),
  désabonnement en deux temps avec suppression réelle.
- **Accessibilité** : lien d'évitement, focus visible, labels, régions
  `aria-live`, réduction des animations respectée.
- **Économie** : aucun service payant — Nominatim (géocodage), API Adresse et
  API Recherche d'entreprises (services publics), Leaflet auto-hébergé.
- **Réversibilité** : SQLite en développement, PostgreSQL en production par
  changement de provider et de `DATABASE_URL`, sans changement de code.

## Critères d'acceptation

Chaque critère est adossé à un test automatisé existant :

| Critère | Preuve (fichier de test) |
|---|---|
| Parcours complet : inscription → annonce → candidature 4 pièces → acceptation → contrat → envoi | `test/smoke.cjs` (65 assertions) |
| Recherche insensible à la casse, pagination à 20 | `test/lot-a.cjs` |
| Suivi candidat sans compte, sans fuite de données personnelles | `test/lot-b.cjs` |
| Cloisonnement école/admin, suspension, modération | `test/lot-c.cjs`, `test/ameliorations-v2.cjs` |
| Recherche par rayon et vue carte | `test/lot-e.cjs` |
| Vérification SIRET jamais bloquante | `test/lot-f.cjs` |
| Contrat signé par les deux parties, empreintes SHA-256 exactes, invalidation à la ré-édition | `test/lot-g.cjs` (49 assertions) |
| Statistiques schoolId-scopées, jamais de NaN | `test/lot-h.cjs` |
| Alertes en double opt-in, panne d'envoi jamais bloquante | `test/lot-i.cjs` |
| Purge RGPD : bons délais, jamais les dossiers acceptés | `test/lot-j.cjs` |
| Démo relançable sans toucher aux données réelles | `test/lot-k.cjs` |
| Autocomplétion d'adresse via relais interne (CSP), jamais bloquante | `test/lot-l.cjs` |
| CSRF, magic bytes, isolation entre écoles, uploads nettoyés en échec | `test/correctifs.cjs`, `test/ameliorations.cjs`, `test/smoke.cjs` |

## Hors-périmètre assumé

- Comptes moniteurs (la friction minimale est un choix produit central).
- Paiement en ligne, facturation, planning.
- Messagerie interne (le contact passe par email/téléphone du dossier).
- Application mobile native (le site est responsive).
- Modification d'annonce par l'admin (il retire, il ne réécrit pas).

## Écarts corrigés depuis la v1

- « Mots de passe **chiffrés** » (v1) → mots de passe **hachés** (bcrypt) : le
  terme exact compte, un hachage n'est pas réversible.
- Administration et purge annoncées « ultérieures » en v1 → **livrées** (lots
  C et J).
- Le déploiement en production (hébergement, PostgreSQL, SMTP, sauvegardes)
  reste un chantier documenté à part — voir la feuille de route de
  l'[audit](audit-certification-dwwm.md).
- Les autres écarts fonctionnels (réouverture d'annonce, filtre par statut...)
  sont justifiés un par un dans
  [`comparaison-maquettes.md`](comparaison-maquettes.md) et
  [`inventaire-documents-historiques.md`](inventaire-documents-historiques.md).

## Points de vigilance (inchangés depuis la v1)

Les contrats générés restent des **modèles indicatifs** à valider
juridiquement avant usage réel. Le traitement de données sensibles (identité,
permis) impose la vigilance RGPD mise en œuvre ci-dessus.
