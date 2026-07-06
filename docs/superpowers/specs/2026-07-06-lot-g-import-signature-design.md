# Lot G+ — Import de signature dans le pad canvas (design)

Date : 2026-07-06
Statut : validé verbalement, prêt pour plan d'implémentation.

## Contexte

Le Lot G livré permet à l'école puis au candidat de signer le contrat en dessinant dans
un pad canvas. Le flux est sécurisé et simple côté serveur : le formulaire poste
`signatureData` au format `data:image/png;base64,...`, puis `signatureImage.decodeSignature`
valide le préfixe, le base64, les magic bytes PNG et la taille avant stockage privé.

Problème d'usage : signer à la souris est pénible. Les écoles ont souvent déjà une
signature scannée, et les candidats peuvent préférer importer une image préparée.

## Décision validée

Ajouter l'import d'image **sur les deux pads existants** :

- formulaire école `views/dashboard/contract_form.twig` ;
- page candidat `views/tracking/sign.twig`.

Le dessin manuel reste disponible. L'import n'enregistre pas une signature réutilisable
dans le profil : il remplit seulement le canvas de la signature en cours.

## Périmètre

Dans le périmètre :

- bouton ou libellé d'action « Importer une signature » près de « Effacer » ;
- champ fichier masqué ou discret, accepté en `image/png,image/jpeg` ;
- JS statique dans `public/js/signature-pad.js` (CSP respectée) ;
- lecture via `FileReader`, chargement via `Image`, redimensionnement centré dans le
  canvas sur fond blanc ;
- `dirty = true` après import réussi, puis submit inchangé (`canvas.toDataURL('image/png')`) ;
- bouton « Effacer » vide aussi une image importée ;
- message d'erreur clair si le fichier est illisible, non image, ou trop volumineux ;
- tests Lot G étendus pour vérifier la présence de l'import côté école et candidat,
  et la compatibilité du flux serveur existant.

Hors périmètre :

- signature enregistrée/réutilisable dans le profil école ;
- upload direct multipart côté serveur ;
- recadrage manuel, rotation, détourage, suppression automatique du fond ;
- stockage du fichier importé original.

## Architecture

### Vue

Les deux vues gardent le même canvas et le même champ `signatureData`. Dans
`.signature-actions`, ajouter :

- un bouton `type="button"` avec `data-signature-import-trigger` ;
- un input fichier `type="file"` avec `data-signature-import`, `accept="image/png,image/jpeg"`.

Le texte utilisateur reste orienté action : « Importer une signature ».

### JavaScript

`public/js/signature-pad.js` devient le point unique pour les deux modes :

1. dessin au pointeur, comportement actuel inchangé ;
2. import d'image :
   - refuser côté client les fichiers de plus de 200 Ko (même ordre que le serveur) ;
   - lire l'image en data URL ;
   - dessiner un fond blanc puis l'image ajustée dans le canvas sans déformation ;
   - marquer le pad comme rempli ;
   - au submit, exporter en PNG exactement comme pour une signature dessinée.

Le serveur continue donc de recevoir un PNG de canvas, pas le fichier original. Cette
approche réutilise toute la validation existante (`decodeSignature`) et limite le
risque de régression.

### Erreurs

Les erreurs client utilisent le même élément `[data-signature-error]` :

- pad vide : « Veuillez dessiner ou importer votre signature avant de valider. »
- fichier trop volumineux : « Image trop volumineuse — choisissez un fichier de moins de 200 Ko. »
- image illisible : « Image illisible — importez un PNG ou un JPEG. »

La validation serveur reste l'autorité finale. Si un client contourne le JS, les erreurs
existantes de Lot G continuent de s'appliquer.

## Tests

Étendre `test/lot-g.cjs` :

- formulaire école : le HTML contient `data-signature-import` et le texte
  « Importer une signature » ;
- page candidat : même vérification ;
- validation serveur inchangée : le test existant continue de poster `SIGNATURE_PNG`
  dans `signatureData`, ce qui représente aussi le résultat d'un import converti par
  le canvas ;
- vérifier que `npm test` reste vert.

Un test navigateur réel du `FileReader` n'est pas ajouté : la suite actuelle est HTTP
sans Playwright. Le comportement JS reste isolé dans un fichier statique simple et le
contrat serveur est couvert par les assertions existantes.

## Critères d'acceptation

- L'école peut dessiner ou importer une signature avant d'accepter une candidature.
- Le candidat peut dessiner ou importer une signature avant de contresigner.
- L'import produit le même type de preuve qu'un dessin : PNG stocké en privé,
  horodatage, PDF signé et empreinte SHA-256.
- Aucun nouveau stockage public ni nouveau flux multipart n'est introduit.
- `test/lot-g.cjs` et `npm test` passent.
