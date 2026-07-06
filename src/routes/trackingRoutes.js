// Routes publiques de suivi de candidature (montées sous /suivi) : page de suivi,
// lecture du contrat et signature en ligne — le jeton opaque fait office d'auth.
const express = require('express');
const rateLimit = require('express-rate-limit');
const trackingController = require('../controllers/trackingController');
const signatureController = require('../controllers/signatureController');

const router = express.Router();

// Anti-abus sur la signature (écriture disque + génération PDF).
const signLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Trop de tentatives. Veuillez réessayer plus tard.');
    res.status(429).redirect(`/suivi/${req.params.token}`);
  },
});

router.get('/:token', trackingController.show);
router.get('/:token/contrat', signatureController.downloadContract);
router.get('/:token/signer', signatureController.showSign);
router.post('/:token/signer', signLimiter, signatureController.sign);

module.exports = router;
