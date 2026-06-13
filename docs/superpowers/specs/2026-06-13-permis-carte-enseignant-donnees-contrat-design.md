# Design — Permis, carte d'enseignant & données d'identité au contrat

> Date : 2026-06-13. Projet : MoniteurConnect. Statut : validé, implémentation lancée.

## 1. Vue d'ensemble

Étendre le cycle de candidature/contrat avec :
- **A** — deux justificatifs supplémentaires **obligatoires** sur la candidature : permis de
  conduire et carte/autorisation d'enseigner (mêmes formats et stockage privé que CV/CNI).
- **B** — les informations d'identité nécessaires à un contrat complet, **saisies par
  l'auto-école à l'acceptation** (minimisation RGPD) : état civil, autorisation d'enseigner,
  permis de conduire. Ces champs sont **optionnels** et rendus dans le PDF s'ils sont remplis.

## 2. Modèle de données (Prisma)

`Application` — 2 champs :
- `licensePath String?` — permis de conduire (chemin privé relatif).
- `teachingCardPath String?` — carte/autorisation d'enseigner (chemin privé relatif).
Obligatoires à la saisie (colonnes nullables pour les anciennes données).

`Contract` — 7 champs (tous optionnels) :
- `birthDate DateTime?`, `birthPlace String?`, `nationality String?`
- `teachingAuthNumber String?`, `teachingAuthValidUntil DateTime?`
- `licenseNumber String?`, `licenseCategories String?`

Migration additive : `application_docs_contract_identity`.

## 3. Stockage & upload

- `config/storage.js` : deux sous-dossiers en plus — `license/`, `teaching/`.
- `middlewares/upload.js` : `multer.fields([cv, idCard, license, teaching... ])` → 4 fichiers.
  `cv` = PDF ; `idCard`/`license`/`teachingCard` = PDF/JPG/PNG. Nom régénéré, extension du
  mimetype, 5 Mo/fichier. `relPathOf` mappe chaque champ vers son sous-dossier.

## 4. Candidature (Feature A)

- `views/listings/show.twig` : champs fichier « Permis de conduire » et « Carte
  d'enseignant », obligatoires (PDF/JPG/PNG).
- `applicationController.apply` : exige les 4 fichiers (cv, idCard, license, teachingCard),
  stocke les chemins, nettoie tous les fichiers reçus en cas d'échec de validation.
- Routes de téléchargement protégées (école propriétaire) :
  `GET …/candidatures/:appId/permis` et `…/carte-enseignant`, via le helper `streamPiece`.
- `views/dashboard/applications.twig` : liens « Permis » et « Carte d'enseignant » à côté de
  CV / Pièce d'identité.

## 5. Données de contrat (Feature B)

- `views/dashboard/contract_form.twig` : blocs **État civil** (date/lieu de naissance,
  nationalité), **Autorisation d'enseigner** (numéro + validité), **Permis** (numéro +
  catégories). Tous optionnels, avec libellés clairs.
- `validators/contractValidator.js` : parse les nouveaux champs (dates optionnelles via le
  helper `parseDate`, chaînes trimmées → `null` si vides). N'ajoute aucune règle bloquante.
- `controllers/contractController.js` : `buildPrefill` et `accept` propagent les nouveaux
  champs (pré-remplis depuis le contrat existant lors d'une ré-édition).
- `services/contractPdf.js` : la partie « Le Salarié / Le Prestataire » affiche l'état civil
  et la nationalité quand présents ; un **article « Qualifications »** mentionne le numéro
  d'autorisation d'enseigner (+ validité) et le permis (numéro + catégories) quand fournis.

## 6. Tests (`test/smoke.cjs` étendu)

- La candidature envoie désormais 4 fichiers ; assert que `licensePath` (`license/`) et
  `teachingCardPath` (`teaching/`) sont stockés et présents dans `storage/`.
- Téléchargements protégés permis + carte d'enseignant : école A → 200, école B → 404.
- Acceptation avec les nouveaux champs d'identité → enregistrés sur le `Contract` ; PDF
  toujours valide (`%PDF`).
- Nettoyage exhaustif des fichiers (déjà basé sur les chemins en base) couvre les nouvelles
  pièces automatiquement.

## 7. Hors périmètre

N° de sécurité sociale ; autres pièces (casier judiciaire, RIB, diplôme, attestation
d'assurance) ; saisie des données d'identité par le candidat ; champs de contrat rendus
obligatoires.
