// Routes publiques de suivi de candidature (montées sous /suivi) : page de suivi,
// lecture du contrat et signature en ligne — le jeton opaque fait office d'auth.
const express = require('express');
const rateLimit = require('express-rate-limit');
const trackingController = require('../controllers/trackingController');
const signatureController = require('../controllers/signatureController');
const realtimeController = require('../controllers/realtimeController');
const applicationService = require('../services/applicationService');

const router = express.Router();

// Un lien de suivi est un espace candidat : s'il est ouvert dans un navigateur où
// une école ou un admin est connecté, la page s'affiche sans le contexte
// back-office (nav, liens). Le jeton CSRF et les flashs restent dans la session
// publique du candidat.
function hideBackOfficeLocals(req, res, next) {
  delete res.locals.currentSchool;
  delete res.locals.currentAdmin;
  delete res.locals.adminSessionActive;
  res.locals.backOfficeSession = false;
  next();
}

// L'authentification école/admin n'est détachée de la session que pour un jeton
// valide : sinon n'importe quel site pourrait déconnecter une école par un simple
// <img src="/suivi/x">. Le contrôleur relit la candidature ensuite (404 si absent).
async function detachForValidToken(req, res, next, token) {
  try {
    if (req.session && (req.session.schoolId || req.session.adminId)
      && await applicationService.findByTrackingToken(token)) {
      delete req.session.schoolId;
      delete req.session.adminId;
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Anti-abus sur la signature (écriture disque + génération PDF).
const signLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Trop de tentatives. Veuillez réessayer plus tard.');
    res.status(429).redirect(`/suivi/${req.params.token}`);
  },
});

router.use(hideBackOfficeLocals);
router.param('token', detachForValidToken);

router.get('/temps-reel/:applicationId', realtimeController.candidateStream);
router.get('/fragment/:applicationId', realtimeController.candidateFragment);
router.get('/:token', trackingController.show);
router.get('/:token/contrat', signatureController.downloadContract);
router.get('/:token/signer', signatureController.showSign);
router.post('/:token/signer', signLimiter, signatureController.sign);

module.exports = router;
