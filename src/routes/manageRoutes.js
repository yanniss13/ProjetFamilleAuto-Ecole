// Gestion des annonces de l'auto-école (montée sous /mes-annonces, derrière
// requireAuth + loadSchool). Chemins relatifs au préfixe.
const express = require('express');
const listingController = require('../controllers/listingController');
const applicationController = require('../controllers/applicationController');
const contractController = require('../controllers/contractController');
const realtimeController = require('../controllers/realtimeController');

const router = express.Router();

router.get('/', listingController.mine);
router.get('/nouvelle', listingController.newForm);
router.post('/', listingController.create);
router.get('/:id/modifier', listingController.editForm);
router.post('/:id/modifier', listingController.update);
router.post('/:id/supprimer', listingController.destroy);
router.post('/:id/cloturer', listingController.close);

// Candidatures d'une annonce + téléchargement protégé des pièces (CV / pièce d'identité).
router.get('/:id/candidatures', applicationController.forListing);
router.get('/:id/candidatures/temps-reel', realtimeController.schoolStream);
router.get('/:id/candidatures/:applicationId/carte', realtimeController.schoolCard);
router.get('/:id/candidatures/:appId/cv', applicationController.downloadCv);
router.get('/:id/candidatures/:appId/piece-identite', applicationController.downloadIdCard);
router.get('/:id/candidatures/:appId/permis', applicationController.downloadLicense);
router.get('/:id/candidatures/:appId/carte-enseignant', applicationController.downloadTeachingCard);

// Acceptation / refus + contrat (génération, téléchargement, envoi au candidat).
router.post('/:id/candidatures/:appId/refuser', contractController.reject);
router.get('/:id/candidatures/:appId/accepter', contractController.acceptForm);
router.post('/:id/candidatures/:appId/accepter', contractController.accept);
router.get('/:id/candidatures/:appId/contrat/telecharger', contractController.downloadContract);
router.get('/:id/candidatures/:appId/contrat/telecharger-signe', contractController.downloadSignedContract);
router.post('/:id/candidatures/:appId/contrat/envoyer', contractController.sendContract);

module.exports = router;
