# Lot G — Signature électronique du contrat (design)

Date : 2026-07-06
Statut : validé, prêt pour plan d'implémentation.

## Contexte

Aujourd'hui, quand une auto-école accepte une candidature, un PDF de contrat est
généré (`contractPdf.js`, stockage privé `storage/contracts/`) puis envoyé au candidat
en pièce jointe email — sans aucune signature. Le Lot G ferme la boucle : **l'école
signe à l'établissement du contrat, le candidat contresigne en ligne depuis sa page de
suivi**, et le PDF final signé (avec horodatages et empreintes) est envoyé aux deux
parties. Pièce maîtresse de la démo jury.

Positionnement assumé (à dire à l'oral) : signature électronique « simple » au sens
eIDAS — recevable pour un contrat de travail ; pas de certificat qualifié.

## Décisions validées

1. **Les deux parties signent** : l'école dessine sa signature dans le formulaire
   d'établissement du contrat (pad canvas) ; le candidat signe ensuite depuis
   `/suivi/:token`. Pas de signature école « enregistrée » réutilisable (hors périmètre).
2. **Un seul flux d'envoi** : le bouton « Envoyer le contrat » devient « Envoyer pour
   signature » (email = invitation avec lien de suivi, plus de PDF joint à cette
   étape). Le PDF signé final, lui, part en pièce jointe aux deux parties.
3. **Preuves stockées** : images PNG des signatures (stockage privé), horodatages,
   empreinte SHA-256 du PDF proposé (constatable avant signature, gravée dans le PDF
   final) et empreinte du PDF final.

## Objectifs / périmètre

Dans le périmètre :
- **Formulaire contrat (école)** : pad de signature obligatoire (canvas → champ caché
  `data:image/png;base64,...`). À l'acceptation : PNG stocké sous
  `storage/signatures/`, PDF « proposé » régénéré avec la signature école + une page
  de signatures partielle, `proposedPdfHash` (SHA-256 hex) calculé et stocké.
- **Envoi pour signature** : email d'invitation (lien `/suivi/:token`), plus de pièce
  jointe. `sentToApplicantAt` conservé comme aujourd'hui.
- **Page de suivi candidat** : nouveau bloc contrat avec états — « en préparation »
  (accepté non envoyé : rien de visible côté candidat au-delà du statut actuel),
  « à signer » (envoyé, non signé : lien de lecture du PDF proposé + bouton signer),
  « signé » (téléchargement du PDF final + empreinte affichée).
- **Lecture du PDF par le candidat** : `GET /suivi/:token/contrat` (PDF proposé tant
  que non signé, PDF final ensuite). Auth = jeton de suivi, comme la page.
- **Page de signature** : `GET /suivi/:token/signer` — rappel des termes clés, lien
  PDF, empreinte SHA-256 affichée, case obligatoire « J'ai lu et j'accepte », pad.
  `POST /suivi/:token/signer` : valide, stocke le PNG candidat, régénère le **PDF
  final** = contrat + page de signatures complète (deux images, noms, deux
  horodatages, empreinte du PDF proposé), calcule `signedPdfHash`, puis envoie le PDF
  final par email aux deux parties (best-effort).
- **Côté école** : liste des candidatures — état « en attente de signature » /
  « ✍️ Contrat signé » + téléchargement du PDF final quand il existe.
- **Ré-édition** : re-accepter une candidature régénère le contrat → signatures et
  PDF signé INVALIDÉS (colonnes remises à null, fichiers supprimés du disque) ;
  l'école re-signe (le pad fait partie du formulaire). L'email d'invitation doit être
  renvoyé pour que le candidat re-signe.
- **Nettoyage** : refus d'une candidature acceptée et suppressions (annonce, école,
  modération admin) suppriment aussi les PNG de signatures et le PDF signé.

Hors périmètre (YAGNI) :
- Certificat qualifié / eIDAS avancé, horodatage qualifié (RFC 3161).
- OTP email avant signature (le jeton 256 bits reçu par email vaut preuve de
  possession de la boîte mail).
- Refus/annotation du contrat par le candidat (il peut répondre à l'école par email).
- Signature école réutilisable (« Mon compte »).

## Architecture

### Données (modèle `Contract`, migration recette diff+deploy)

```prisma
  // Signature électronique (Lot G). PNG des signatures dans storage/signatures/.
  schoolSignaturePath    String?
  schoolSignedAt         DateTime?
  applicantSignaturePath String?
  applicantSignedAt      DateTime?
  proposedPdfHash        String?   // SHA-256 hex du PDF proposé (avant contreseing)
  signedPdfPath          String?   // PDF final signé, storage/contracts/
  signedPdfHash          String?   // SHA-256 hex du PDF final
```

État dérivé (pas de colonne statut) : signé ⇔ `applicantSignedAt != null` ;
à signer ⇔ `sentToApplicantAt != null && applicantSignedAt == null`.

### Pad de signature (`public/js/signature-pad.js`)

- Vanilla JS statique (CSP), souris + tactile (`pointerdown/move/up`), bouton
  « Effacer », écrit `canvas.toDataURL('image/png')` dans un champ caché `signatureData`
  au submit ; bloque le submit si le pad est vierge (message sous le canvas).
- Réutilisé tel quel par les deux formulaires (école : `contract_form.twig` ;
  candidat : `tracking/sign.twig`) via un attribut `data-signature-pad` sur le canvas.

### Validation serveur d'une signature (`src/services/signatureImage.js`)

- Entrée : chaîne `data:image/png;base64,...`. Contrôles : préfixe exact, base64
  décodable, magic bytes PNG (8 octets), taille décodée ≤ 200 Ko, minimum ~200 octets
  (rejette un canvas vide exporté).
- Sortie : `Buffer` prêt à écrire, nom de fichier régénéré (`crypto.randomBytes`),
  écrit sous `storage/signatures/` (nouveau sous-dossier dans `config/storage.js`).

### Génération PDF (`contractPdf.js`)

- `buildContractPdf(...)` accepte un paramètre `signatures` optionnel :
  `{ school: { imagePath, signedAt, name }, applicant: { imagePath, signedAt, name } | null, proposedHash | null }`.
- Nouvelle page finale « Signatures » : deux cadres (école / candidat) avec image PNG
  (pdfkit `image()`), nom, date-heure ; pied de page avec l'empreinte SHA-256 du PDF
  proposé quand elle existe. PDF proposé = cadre école rempli, cadre candidat
  « En attente de signature ». PDF final = les deux cadres remplis + empreinte.
- Empreintes : `crypto.createHash('sha256')` sur le buffer PDF, hex, stockées et
  affichées en `xxxx xxxx …` groupé pour lisibilité.

### Flux contrôleurs

- `contractController.accept` : exige `signatureData` valide (sinon erreur de
  formulaire) → écrit le PNG école → génère le PDF proposé avec cadre école →
  `proposedPdfHash` → upsert. Invalidation en ré-édition : supprime ancien PNG
  candidat, ancien PDF signé, remet les colonnes candidat/signed* à null.
- `contractController.sendContract` → renommé côté texte « envoyer pour signature » :
  `mailer.sendSignatureInvitation(email, nom, titre, token)` (lien `/suivi/:token`),
  `markSent` conservé.
- Nouveau `src/controllers/signatureController.js` (public, monté dans
  `trackingRoutes`) :
  - `GET /suivi/:token/contrat` : stream du PDF (final si signé, sinon proposé si
    envoyé ; 404 sinon) ;
  - `GET /suivi/:token/signer` : 404 si pas de contrat envoyé ou déjà signé ;
  - `POST /suivi/:token/signer` : case `accept` cochée obligatoire + `signatureData`
    valide → PNG candidat → PDF final + hash → update → emails aux deux parties
    (`mailer.sendSignedContract`, pièce jointe, best-effort) → redirection suivi avec
    flash succès. Déjà signé → 409 rendu comme message « déjà signé ». Rate-limit
    dédié (10/15 min/IP).
- Suppressions : `findFilePathsForListing`/`findAnyFilePathsForListing` incluent
  `schoolSignaturePath`, `applicantSignaturePath`, `signedPdfPath` ; idem au refus.

### Vues

- `dashboard/contract_form.twig` : section « Signature de l'école » (canvas + effacer
  + champ caché + erreur éventuelle).
- `dashboard/applications.twig` : badge « ✍️ Contrat signé » / « En attente de
  signature » + lien de téléchargement du PDF signé.
- `tracking/show.twig` : bloc contrat selon l'état (lien lecture, bouton signer,
  téléchargement final + empreinte).
- Nouveau `tracking/sign.twig` : récapitulatif (annonce, école, type de contrat,
  salaire), lien « lire le contrat (PDF) », empreinte SHA-256, case « J'ai lu et
  j'accepte le contrat », pad, bouton « Signer le contrat ».

### Emails (`mailer.js`)

- `sendSignatureInvitation(applicantEmail, applicantName, listingTitle, token)` :
  remplace l'envoi avec pièce jointe (l'ancienne `sendContractToApplicant` disparaît
  au profit de celle-ci).
- `sendSignedContract(to, name, listingTitle, pdfPath)` : PDF final joint, envoyé au
  candidat ET à l'école (deux appels, best-effort, `Promise.all`).

### Gestion d'erreurs

- `signatureData` absent/invalide (école ou candidat) → re-rendu du formulaire avec
  message, aucun fichier écrit.
- Jeton inconnu → 404 (pattern `notFound` existant). Déjà signé → message dédié.
- Échec d'email après signature : la signature reste valide (le PDF est en base/disque),
  flash d'avertissement.

## Tests (`test/lot-g.cjs`, port 4063, ajouté à `npm test`)

Fixture : data URL d'un vrai petit PNG (buffer en dur dans le test).

Unitaires :
- `signatureImage` : PNG valide accepté ; préfixe non-PNG refusé ; base64 corrompu
  refusé ; contenu JPEG déguisé refusé (magic bytes) ; > 200 Ko refusé.

HTTP (flux complet, mailer monkeypatché comme dans smoke) :
- accepter SANS signature → 400, formulaire ré-affiché, pas de contrat créé ;
- accepter AVEC signature → contrat avec `schoolSignaturePath` (fichier existant),
  `schoolSignedAt`, `proposedPdfHash` = SHA-256 recalculé du PDF proposé ;
- envoi pour signature → email d'invitation (lien contenant le token), pas de pièce
  jointe ;
- suivi : bloc « à signer » présent après envoi ; `GET /suivi/:token/contrat` → 200
  `application/pdf` ; mauvais token → 404 ;
- `POST signer` sans case cochée → 400 ; avec PNG invalide → 400 ;
- `POST signer` valide → `applicantSignedAt` renseigné, PDF final existant,
  `signedPdfHash` = SHA-256 recalculé, emails « contrat signé » partis aux DEUX
  adresses, suivi affiche « signé » + empreinte ;
- re-signer → refus « déjà signé » ;
- ré-édition du contrat par l'école → signature candidat + PDF signé invalidés
  (colonnes null, fichiers disparus du disque) ;
- refus de la candidature → PNG signatures + PDF signé supprimés du disque ;
- liste des candidatures école : badge « Contrat signé » + téléchargement du PDF final.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `prisma/schema.prisma` + migration | 7 colonnes Contract |
| `src/config/storage.js` | sous-dossier `signatures` |
| `src/services/signatureImage.js` | nouveau (validation + écriture PNG) |
| `src/services/contractPdf.js` | page « Signatures » + paramètre `signatures` |
| `src/services/contractService.js` | invalidation / champs signés |
| `src/controllers/contractController.js` | signature école, invalidation, envoi invitation |
| `src/controllers/signatureController.js` | nouveau (lecture PDF, page + POST signer) |
| `src/routes/trackingRoutes.js` | 3 routes + rate-limit |
| `src/services/mailer.js` | `sendSignatureInvitation`, `sendSignedContract` |
| `views/dashboard/contract_form.twig`, `views/dashboard/applications.twig` | pad école, badges |
| `views/tracking/show.twig`, `views/tracking/sign.twig` (nouveau) | bloc contrat, page de signature |
| `public/js/signature-pad.js` (nouveau), `public/css/style.css` | pad, styles |
| `src/services/listingService.js` | chemins de fichiers à nettoyer |
| `test/lot-g.cjs` + `package.json` + `AGENTS.md` | tests + intégration |
