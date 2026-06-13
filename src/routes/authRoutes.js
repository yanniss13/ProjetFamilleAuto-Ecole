// Routes d'authentification (publiques).
const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const redirectIfAuth = require('../middlewares/redirectIfAuth');

const router = express.Router();

// Rate-limiters (anti brute-force / abus). TODO: ajouter un handler qui re-rend la
// vue avec un message 429 plutôt que la réponse texte par défaut.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.get('/inscription', redirectIfAuth, authController.showRegister);
router.post('/inscription', registerLimiter, redirectIfAuth, authController.register);
router.get('/verifier-email/:token', authController.verifyEmail);

router.get('/connexion', redirectIfAuth, authController.showLogin);
router.post('/connexion', loginLimiter, redirectIfAuth, authController.login);
router.post('/deconnexion', authController.logout);

router.get('/mot-de-passe-oublie', redirectIfAuth, authController.showForgot);
router.post('/mot-de-passe-oublie', forgotLimiter, redirectIfAuth, authController.forgot);
router.get('/reinitialiser/:token', redirectIfAuth, authController.showReset);
router.post('/reinitialiser/:token', redirectIfAuth, authController.reset);

module.exports = router;
