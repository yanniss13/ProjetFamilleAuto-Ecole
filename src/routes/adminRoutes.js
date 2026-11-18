// Espace administration (monté sous /admin). Le login est public ; tout le reste est
// protégé par requireAdmin + loadAdmin.
const express = require('express');
const rateLimit = require('express-rate-limit');
const adminAuthController = require('../controllers/adminAuthController');
const adminController = require('../controllers/adminController');
const requireAdmin = require('../middlewares/requireAdmin');
const loadAdmin = require('../middlewares/loadAdmin');

const { isDemoMode } = require('../config/demo');

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
// Démo publique : les accès admin sont affichés à tous les visiteurs, donc
// l'administration y est en lecture seule (aucune suspension, suppression ni
// purge) pour qu'un visiteur ne casse pas la démonstration des suivants.
router.use((req, res, next) => {
  if (req.method !== 'POST' || !isDemoMode()) return next();
  req.flash('error', 'Démonstration : l’administration est en lecture seule.');
  return res.redirect('/admin');
});
router.get('/', adminController.dashboard);
router.post('/purge', adminController.purge);
router.get('/ecoles', adminController.schools);
router.get('/annonces', adminController.listings);
router.post('/annonces/:id/supprimer', adminController.removeListing);
router.post('/ecoles/:id/suspendre', adminController.suspendSchool);
router.post('/ecoles/:id/reactiver', adminController.reactivateSchool);

module.exports = router;
