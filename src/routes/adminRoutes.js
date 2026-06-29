// Espace administration (monté sous /admin). Le login est public ; tout le reste est
// protégé par requireAdmin + loadAdmin.
const express = require('express');
const rateLimit = require('express-rate-limit');
const adminAuthController = require('../controllers/adminAuthController');
const adminController = require('../controllers/adminController');
const requireAdmin = require('../middlewares/requireAdmin');
const loadAdmin = require('../middlewares/loadAdmin');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('admin/login', {
      title: 'Connexion admin', errors: { global: 'Trop de tentatives. Réessayez plus tard.' }, values: {},
    }),
});

// Public.
router.get('/connexion', adminAuthController.showLogin);
router.post('/connexion', loginLimiter, adminAuthController.login);
router.post('/deconnexion', adminAuthController.logout);

// Protégé (tout ce qui suit).
router.use(requireAdmin, loadAdmin);
router.get('/', adminController.dashboard);

module.exports = router;
