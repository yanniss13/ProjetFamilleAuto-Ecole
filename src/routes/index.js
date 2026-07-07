// Agrège les routeurs et applique la protection de session sur l'espace auto-école.
const express = require('express');
const rateLimit = require('express-rate-limit');

const pageController = require('../controllers/pageController');
const siretController = require('../controllers/siretController');
const adresseController = require('../controllers/adresseController');
const authRoutes = require('./authRoutes');
const listingRoutes = require('./listingRoutes');
const alertRoutes = require('./alertRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const manageRoutes = require('./manageRoutes');
const accountRoutes = require('./accountRoutes');
const trackingRoutes = require('./trackingRoutes');
const adminRoutes = require('./adminRoutes');
const requireAuth = require('../middlewares/requireAuth');
const loadSchool = require('../middlewares/loadSchool');

const router = express.Router();

// Accueil public.
router.get('/', pageController.home);

// Verification SIRET en direct (formulaire d'inscription). Rate-limite : l'endpoint
// relaie une API publique, on borne l'usage par IP.
const siretLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ status: 'rate_limited', name: null, address: null }),
});
router.get('/api/siret/:siret', siretLimiter, siretController.check);

const adresseLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ erreur: 'rate_limited' }),
});
router.get('/api/adresse', adresseLimiter, adresseController.search);

// Public : auth (inscription/connexion/...) et annonces.
router.use(authRoutes);
router.use('/annonces', listingRoutes);
router.use('/alertes', alertRoutes);
router.use('/suivi', trackingRoutes);
router.use('/admin', adminRoutes);

// Espace auto-école : session obligatoire + école courante chargée. Montés sous des
// préfixes distincts pour que les gardes ne s'appliquent QU'à ces routes.
router.use('/tableau-de-bord', requireAuth, loadSchool, dashboardRoutes);
router.use('/mes-annonces', requireAuth, loadSchool, manageRoutes);
router.use('/mon-compte', requireAuth, loadSchool, accountRoutes);

module.exports = router;
