# Lot K — Seed de démo (design)

Date : 2026-07-07
Statut : validé, prêt pour plan d'implémentation.

## Contexte

La feuille de route E→J est livrée, mais une base vide ne met rien en valeur :
carte déserte, graphiques à zéro, pagination invisible. Le Lot K fournit
`npm run seed:demo` — un jeu de données réaliste, en bon français, relançable à
volonté avant chaque répétition et le jour de la soutenance.

## Décisions validées

1. **Volume riche** : ~15 auto-écoles géolocalisées, ~40 annonces, ~60
   candidatures étalées sur 12 semaines.
2. **Données marquées, relançables** : tout utilise le domaine réservé
   `@demo.moniteur-connect.example` ; le script supprime les données démo
   existantes (et leurs fichiers) puis recrée tout — les données perso de dev ne
   sont JAMAIS touchées.
3. **Comptes de démo** : une école « vitrine » au dossier complet et un admin,
   identifiants fixes affichés en fin de script.

## Objectifs / périmètre

Dans le périmètre :

- **Script `scripts/seed-demo.js`** (+ `"seed:demo": "node scripts/seed-demo.js"`
  dans `package.json`), même structure que `create-admin.js` : fonction
  `seedDemo()` exportée (appelée par les tests) + runner CLI
  (`if (require.main === module)`), dotenv chargé dans le runner.
- **Constante `DEMO_DOMAIN = 'demo.moniteur-connect.example'`** (domaine `.example`
  réservé, aucun email réel possible). Tout email démo se termine par
  `@${DEMO_DOMAIN}`.
- **Nettoyage préalable (dans `seedDemo`)** :
  1. collecter les chemins de fichiers des candidatures/contrats des écoles démo
     (pattern de `findAnyFilePathsForListing`) et les `deleteStored` ;
  2. `school.deleteMany` sur le domaine (`email: { endsWith: '@' + DEMO_DOMAIN }`)
     — les cascades emportent annonces, candidatures, contrats ;
  3. `alert.deleteMany` et `admin.deleteMany` sur le même domaine.
  Les `PurgeRun` ne sont pas touchés.
- **Écoles (15)** : villes réparties sur la France (Paris, Marseille, Lyon,
  Toulouse, Nice, Nantes, Bordeaux, Lille, Strasbourg, Rennes, Montpellier,
  Grenoble, Dijon, Angers, Aix-en-Provence), **latitude/longitude en dur**
  (aucun appel Nominatim), `emailVerified: true`, SIRET factices uniques
  (`999000012340xx`), ~10 avec `siretStatus: 'verified'` + `siretVerifiedName`
  (badge « École vérifiée ») et le reste `unverified` (contraste). Un seul
  `passwordHash` bcrypt calculé une fois et partagé (rapidité) — mot de passe
  `demo1234`.
- **Annonces (~40)** : titres et descriptions rédigés en vrai français (le jury
  les lira), types variés (cdi, cdd, freelance, apprentissage, null), volumes
  horaires et rémunérations plausibles, colonnes `*Lower` renseignées,
  `viewsCount` entre 20 et 300, `createdAt` étalés sur les 12 dernières
  semaines, ~5 annonces `closed`. Répartition inégale entre écoles (réalisme).
- **Candidatures (~60)** : noms/emails de candidats fictifs (domaine démo),
  `createdAt` étalés sur 84 jours (les barres hebdo du Lot H vivent),
  statuts mélangés — ~60 % `pending`, ~20 % `accepted`, ~20 % `rejected` avec
  `rejectedAt` posé, `trackingToken` opaque généré pour toutes.
- **École vitrine** (`ecole.vitrine@` + domaine, à Marseille) : ~6 annonces dont
  les plus vues, ~15 candidatures dont :
  - plusieurs avec de **vrais petits fichiers PDF** écrits dans `storage/`
    (CV + pièces — contenu PDF minimal valide, généré par le script) pour que
    les téléchargements fonctionnent en démo ;
  - **un dossier complet jusqu'au contrat signé**, généré par les services du
    Lot G : signatures PNG (base64 embarquée dans le script, même fixture que
    `test/lot-g.cjs`) sauvées via `signatureImage.saveSignature`, PDF proposé
    puis PDF final via `buildContractPdf` (les deux signatures + horodatages),
    empreintes `sha256Hex` réelles, `sentToApplicantAt` posé — la page de suivi
    candidat ET les téléchargements école sont démontrables.
- **Alertes** : 3 confirmées (départements/mots-clés variés — publier une
  annonce en démo déclenche des emails visibles dans Mailpit) + **1 non
  confirmée antidatée de 10 jours** : le bouton « Lancer une purge maintenant »
  supprime visiblement quelque chose devant le jury.
- **Admin démo** : `admin@` + domaine, mot de passe `admin1234` (hash bcrypt
  dédié, distinct de celui des écoles).
- **Sortie console du CLI** : compteurs créés, identifiants des deux comptes,
  URLs clés (`/annonces?vue=carte`, `/tableau-de-bord`, `/admin`,
  `/suivi/<token du contrat signé>`, `/alertes`).
- **Déterminisme** : aucune bibliothèque de faux-données, aucun `Math.random()`
  pour le contenu (les textes sont écrits) ; seuls les écarts de dates peuvent
  utiliser des pas fixes. Relancer produit le même état (aux jetons près).

Hors périmètre (YAGNI) :
- Bibliothèque type faker, images/logos d'écoles, seed destiné à la production,
  option de vidage complet de la base, données aléatoires.

## Architecture

- Le script réutilise EXCLUSIVEMENT les modules existants : `prisma`,
  `utils/password` (hash), `services/tokens` (jetons opaques),
  `services/contractPdf`, `services/signatureImage`, `utils/hash`,
  `config/storage`. Aucune logique métier dupliquée.
- Insertion directe via Prisma (pas via HTTP) : plus rapide, pas de serveur à
  démarrer, et les colonnes calculées (`*Lower`) sont renseignées par le script.
- `seedDemo()` renvoie les compteurs
  `{ schools, listings, applications, alerts, signedContracts }` + les infos de
  connexion (le CLI les affiche, les tests les vérifient).
- Erreur en cours de seed : le CLI affiche le message et sort en code 1 ; un
  re-lancement repart du nettoyage (état cohérent garanti par le
  delete-then-recreate).

## Tests (`test/lot-k.cjs`, port 4067, ajouté à `npm test`)

Pas de serveur HTTP nécessaire sauf pour un contrôle d'affichage ; le cœur du
test appelle `seedDemo()` directement.

- une école NON-démo créée avant le seed **survit** à `seedDemo()` (données
  perso intactes) ;
- `seedDemo()` deux fois de suite → mêmes compteurs, pas de doublons (nombre
  d'écoles démo identique après les deux passes) ;
- volumes : ≥ 15 écoles démo, ≥ 35 annonces, ≥ 55 candidatures, ≥ 4 alertes ;
- toutes les écoles démo sont géolocalisées (latitude/longitude non null) ;
- candidatures réparties : au moins une dans les 7 derniers jours ET au moins
  une entre 60 et 84 jours (les buckets du Lot H ne sont pas vides) ;
- école vitrine : existe, contrat signé (`applicantSignedAt` non null,
  `signedPdfHash` présent), fichiers du contrat ET d'au moins un CV présents
  sur disque ;
- alerte non confirmée antidatée présente (candidate à la purge) ;
- connexion école vitrine via HTTP (`demo1234`) → 302 vers `/tableau-de-bord` ;
- nettoyage final : `seedDemo` étant relançable, le test NE nettoie PAS les
  données démo (elles servent à l'utilisateur) — il ne supprime que son école
  non-démo témoin.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `scripts/seed-demo.js` | nouveau (seedDemo + CLI) |
| `package.json` | script `seed:demo` + test lot-k |
| `test/lot-k.cjs` | nouveau |
| `AGENTS.md` | passation |
