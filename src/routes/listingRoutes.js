// Routes publiques des annonces (montées sous /annonces).
const express = require('express');
const rateLimit = require('express-rate-limit');
const listingController = require('../controllers/listingController');
const applicationController = require('../controllers/applicationController');
const { handleApplicationUpload } = require('../middlewares/upload');

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

// Candidature : multipart (CV + pièce d'identité). handleApplicationUpload (multer) parse
// les fichiers ; le jeton CSRF transite en query (?_csrf=...) car le corps multipart n'est
// pas parsé au middleware csrf.
router.post('/:id/postuler', applyLimiter, handleApplicationUpload, applicationController.apply);

module.exports = router;
