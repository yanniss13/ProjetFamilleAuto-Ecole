# Cahier des charges — MoniteurConnect

**Client :** porteur du projet MoniteurConnect · **Date :** 22 juin 2026 · **Version :** 1.0

## Contexte et besoin

Le secteur de la conduite manque de moniteurs et les auto-écoles peinent à recruter. Le
client souhaite une **plateforme web** mettant en relation les auto-écoles et les
moniteurs indépendants : les auto-écoles publient des offres, les moniteurs y répondent
en ligne, et la plateforme accompagne la démarche jusqu'à l'établissement d'un contrat.

Il s'agit d'un **site d'annonces spécialisé**, sans paiement en ligne, ni planning, ni
facturation entre les parties.

## Utilisateurs

- **Visiteur / moniteur** : consulte les annonces et postule, sans compte.
- **Auto-école** : publie des annonces et gère les candidatures (compte requis).
- **Administrateur** : supervise et modère la plateforme.

## Fonctionnalités attendues

**Côté public / moniteur**
- Liste des annonces avec recherche par mots-clés et filtre par département.
- Détail d'une annonce avec carte de localisation de l'auto-école.
- Candidature sans compte, avec dépôt de 4 pièces : CV, pièce d'identité, permis,
  carte/autorisation d'enseigner.

**Côté auto-école**
- Inscription avec vérification d'email, connexion, mot de passe oublié, profil.
- Création, modification, clôture et suppression d'annonces.
- Réception et consultation des candidatures, téléchargement sécurisé des pièces.
- Acceptation/refus, puis génération et envoi d'un contrat PDF (freelance, CDI, CDD,
  apprentissage, générique).

**Côté administrateur**
- Modération des annonces et des comptes, indicateurs d'activité.

## Exigences clés

- **Sécurité** : mots de passe chiffrés, sessions protégées, pièces sensibles stockées
  hors accès public et réservées à l'auto-école concernée.
- **RGPD** : consentement, durée de conservation et purge des pièces, droits des
  personnes, mentions légales.
- **Technique** : interface responsive, base de données relationnelle exploitable en
  production, envoi d'emails en production. Le choix de la mise en œuvre est laissé au
  prestataire.

## Attentes vis-à-vis du prestataire

- Application web livrée et déployée, avec code source et documentation.
- Proposition d'un découpage en lots priorisés, avec estimation de charge, délai et coût.
- Mise en production progressive : d'abord annonces + candidatures, puis contrats,
  administration et conformité.

## Points de vigilance

Les contrats générés sont des **modèles indicatifs** à valider juridiquement. Le
traitement de **données sensibles** (identité, permis) impose une vigilance RGPD
particulière.
