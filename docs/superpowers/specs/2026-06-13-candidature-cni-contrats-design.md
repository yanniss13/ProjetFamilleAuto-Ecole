# Design — Pièce d'identité & génération de contrats

> Date : 2026-06-13. Projet : MoniteurConnect. Statut : validé, implémentation lancée.

## 1. Vue d'ensemble

Deux features liées au cycle de candidature :

- **A — Pièce d'identité** : un 2e fichier **obligatoire** (PDF/JPG/PNG) sur le formulaire
  de candidature, à côté du CV.
- **B — Workflow d'acceptation + contrat** : l'auto-école peut **Accepter** ou **Refuser**
  une candidature reçue. À l'acceptation, un mini-formulaire collecte les termes finaux et
  génère un **PDF de contrat** (modèle choisi selon le type de l'annonce), téléchargeable
  par l'école puis **envoyable au candidat par email** sur action manuelle.

Changement de sécurité associé (RGPD) : déplacer CV + CNI + contrats hors de `public/`
vers un dossier privé `storage/`, servi via des **routes protégées** réservées à l'école
propriétaire. Le contrat part au candidat (sans compte) **en pièce jointe email**.

## 2. Modèle de données (Prisma)

### `Application` — 2 champs ajoutés
- `idCardPath String?` — chemin privé relatif de la CNI (obligatoire à la saisie ;
  colonne nullable pour ne pas casser d'éventuelles anciennes données).
- `status String @default("pending")` — `pending` | `accepted` | `rejected`.
- Relation inverse `contract Contract?`.

### `Contract` — nouvelle entité (1‑1 avec `Application`)
- `id Int @id`
- `applicationId Int @unique` + relation `onDelete: Cascade`
- `type String` — `freelance` | `cdi` | `cdd` | `apprentissage` | `generic`
- `startDate DateTime`
- `endDate DateTime?` (CDD) · `motif String?` (motif de recours CDD)
- `grossSalary String` — texte libre (« 2200€ brut/mois », « 25€/h »…)
- `weeklyHours Int?` · `trialPeriodWeeks Int?` · `workplace String`
- `providerSiret String?` (freelance) · `schoolAddress String?` · `applicantAddress String?`
- `extraClauses String?`
- `pdfPath String` — chemin privé relatif du PDF généré
- `sentToApplicantAt DateTime?`
- `createdAt DateTime` · `updatedAt DateTime`

Migration **additive** et sûre (defaults + colonnes nullables + nouvelle table) :
`contracts_and_idcard`.

## 3. Stockage & sécurité des fichiers

- Dossier privé **`storage/`** (gitignoré), sous-dossiers `cv/`, `id/`, `contracts/`,
  créés au démarrage. Plus aucun fichier sensible sous `public/`.
- `config/storage.js` : expose `STORAGE_DIR` + sous-chemins, garantit l'existence des dossiers.
- `multer` en `.fields([cv, idCard])` : `cv` = `application/pdf` ; `idCard` =
  `application/pdf | image/jpeg | image/png`. Nom de fichier **régénéré**, extension dérivée
  du mimetype. Chemins stockés **relatifs** à `storage/` (ex. `cv/ab12.pdf`).
- **Routes de téléchargement protégées** (sous `/mes-annonces`, propriétaire vérifié)
  pour CV, CNI et contrat → stream avec `Content-Disposition`. Aucune URL publique.

## 4. Feature A — Candidature avec pièce d'identité

- `views/listings/show.twig` : champ fichier « Pièce d'identité (PDF, JPG ou PNG) »,
  obligatoire ; `enctype=multipart/form-data` déjà en place.
- `applicationController.apply` : traite `req.files.cv` + `req.files.idCard`, exige les deux
  (type validé par multer), stocke les chemins privés ; en cas d'échec de validation, supprime
  tous les fichiers déjà reçus (pas d'orphelins).

## 5. Feature B — Workflow d'acceptation & contrat

Nouveaux fichiers : `controllers/contractController.js`, `services/contractService.js`,
`validators/contractValidator.js`, `services/contractPdf.js` (modèles pdfkit).

Routes (sous `/mes-annonces`, `requireAuth` + `loadSchool`, propriétaire vérifié) :

| Route | Rôle |
|---|---|
| `POST .../:id/candidatures/:appId/refuser` | `status = rejected` (pas d'email) |
| `GET  .../:id/candidatures/:appId/accepter` | mini-formulaire (pré-rempli depuis l'annonce / dernier contrat) — sert aussi à ré-éditer |
| `POST .../:id/candidatures/:appId/accepter` | valide les termes → upsert `Contract` + génère le PDF → `status = accepted` |
| `GET  .../:id/candidatures/:appId/cv` | stream du CV (école) |
| `GET  .../:id/candidatures/:appId/piece-identite` | stream de la CNI (école) |
| `GET  .../:id/candidatures/:appId/contrat/telecharger` | stream du PDF de contrat |
| `POST .../:id/candidatures/:appId/contrat/envoyer` | email du PDF au candidat (pièce jointe) → `sentToApplicantAt` |

**Mini-formulaire** (`dashboard/contract_form.twig`) : type (pré-sélectionné depuis
`listing.contractType`, modifiable) ; date de début (oblig.) ; date de fin + motif (si CDD) ;
salaire (oblig., pré-rempli depuis `listing.compensation`) ; heures/sem (pré-rempli) ;
lieu (pré-rempli ville) ; période d'essai ; SIRET prestataire (freelance) ; **adresse de
l'école** + **adresse du candidat** ; clauses additionnelles. Champs école pré-remplis
depuis le dernier contrat saisi par l'école.

**Validation** (`contractValidator`) : `startDate` requise et valide ; si `cdd`, `endDate`
requise et > `startDate` + `motif` requis ; `grossSalary` requis ; `weeklyHours` 1–60 si
fourni ; `trialPeriodWeeks` >= 0 si fourni ; `workplace` requis ; adresses requises (contrat
« prêt à signer »).

`views/dashboard/applications.twig` : badge de statut, boutons **Accepter / Refuser** si
`pending`, liens protégés **CV / Pièce d'identité**, et si accepté : **Télécharger le
contrat** + **Envoyer au candidat** (avec date d'envoi le cas échéant).

## 6. Modèles de contrat

Module `services/contractPdf.js` : `buildContractPdf({ type, school, applicant, listing, terms })`
→ `Promise<Buffer>` via pdfkit. En-tête commun (parties + identifiants) puis corps spécifique
au type (freelance / cdi / cdd / apprentissage / generic), clauses, zone de signatures.

**Chaque modèle porte un avertissement** : « Modèle indicatif — à faire valider
juridiquement avant signature. » L'apprentissage renvoie au **CERFA officiel** (pas de
reproduction du formulaire officiel).

## 7. Mailer

`mailer.sendContractToApplicant(applicantEmail, applicantName, listingTitle, pdfAbsolutePath)`
→ email avec le PDF **en pièce jointe** (`attachments`). En mode dev (sans SMTP), log seulement.

## 8. Tests (`test/smoke.cjs` étendu)

- Candidature avec **CV + CNI** → assert les deux stockés sous `storage/` (et **absents**
  de `public/`), chemins en base.
- **Refus** d'une candidature → `status = rejected`.
- **Acceptation** avec termes → `Contract` créé + PDF généré (commence par `%PDF`) +
  `status = accepted`.
- Routes de téléchargement **CV / CNI / contrat** protégées : école B → 404, école A → 200.
- **Envoi au candidat** → `sentToApplicantAt` posé.
- Cloisonnement maintenu ; nettoyage des données + fichiers en fin de test.

## 9. Dépendances & migration

- Ajout dépendance : **`pdfkit`**.
- Migration Prisma : `contracts_and_idcard`.
- `.gitignore` : ignorer `storage/*` (garder les `.gitkeep`).

## 10. Hors périmètre (non traité ici)

Signature électronique ; éditeur de modèles de contrat dans l'app ; page de profil
auto-école (adresse stockée durablement) ; email automatique au candidat au refus ;
reproduction du CERFA d'apprentissage.
