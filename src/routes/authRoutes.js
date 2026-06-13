// Routes d'authentification (publiques).
const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const redirectIfAuth = require('../middlewares/redirectIfAuth');

const router = express.Router();

// Rate-limiters (anti brute-force / abus). Au dépassement, on re-rend la vue avec un
// message 429 clair plutôt que la réponse texte brute par défaut.
const TOO_MANY = 'Trop de tentatives. Veuillez réessayer dans quelques minutes.';
function renderLimited(view, title) {
  return (req, res) =>
    res.status(429).render(view, { title, errors: { global: TOO_MANY }, values: {} });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: renderLimited('auth/login', 'Connexion'),
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  handler: renderLimited('auth/register', 'Inscription'),
});
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: renderLimited('auth/forgot', 'Mot de passe oublié'),
});

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
