// Routes publiques des annonces (montées sous /annonces).
const express = require('express');
const rateLimit = require('express-rate-limit');
const listingController = require('../controllers/listingController');
const applicationController = require('../controllers/applicationController');
const { uploadCv } = require('../middlewares/upload');

const router = express.Router();

// Anti-spam sur le dépôt de candidature.
const applyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.get('/', listingController.browse);
router.get('/:id', listingController.show);

// Candidature : multipart (CV). uploadCv (multer) parse le fichier ; le jeton CSRF
// transite en query (?_csrf=...) car le corps multipart n'est pas parsé au middleware csrf.
router.post('/:id/postuler', applyLimiter, uploadCv, applicationController.apply);

module.exports = router;
