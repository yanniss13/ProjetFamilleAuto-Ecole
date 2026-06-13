// Gestion des annonces de l'auto-école (montée sous /mes-annonces, derrière
// requireAuth + loadSchool). Chemins relatifs au préfixe.
const express = require('express');
const listingController = require('../controllers/listingController');
const applicationController = require('../controllers/applicationController');

const router = express.Router();

router.get('/', listingController.mine);
router.get('/nouvelle', listingController.newForm);
router.post('/', listingController.create);
router.get('/:id/modifier', listingController.editForm);
router.post('/:id/modifier', listingController.update);
router.post('/:id/supprimer', listingController.destroy);
router.post('/:id/cloturer', listingController.close);
router.get('/:id/candidatures', applicationController.forListing);

module.exports = router;
