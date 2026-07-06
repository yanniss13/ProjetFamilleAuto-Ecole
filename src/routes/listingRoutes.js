// Routes publiques des annonces (montées sous /annonces).
const express = require('express');
const rateLimit = require('express-rate-limit');
const listingController = require('../controllers/listingController');
const applicationController = require('../controllers/applicationController');
const { handleApplicationUpload } = require('../middlewares/upload');
const { verifyAfterUpload } = require('../middlewares/csrf');

const router = express.Router();

// Anti-spam sur le dépôt de candidature. Au dépassement : message + retour à l'annonce.
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Trop de candidatures envoyées. Veuillez réessayer plus tard.');
    res.status(429).redirect(`/annonces/${req.params.id}`);
  },
});

router.get('/', listingController.browse);
router.get('/:id', listingController.show);

// Candidature : multipart (CV + pièces). handleApplicationUpload (multer) parse le corps,
// puis verifyAfterUpload contrôle le jeton CSRF (champ _csrf) — la vérification globale
// est différée pour cette route (voir middlewares/csrf.js).
router.post('/:id/postuler', applyLimiter, handleApplicationUpload, verifyAfterUpload, applicationController.apply);

module.exports = router;
