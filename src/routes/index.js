// Agrège les routeurs et applique la protection de session sur l'espace auto-école.
const express = require('express');

const pageController = require('../controllers/pageController');
const authRoutes = require('./authRoutes');
const listingRoutes = require('./listingRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const manageRoutes = require('./manageRoutes');
const accountRoutes = require('./accountRoutes');
const requireAuth = require('../middlewares/requireAuth');
const loadSchool = require('../middlewares/loadSchool');

const router = express.Router();

// Accueil public.
router.get('/', pageController.home);

// Public : auth (inscription/connexion/...) et annonces.
router.use(authRoutes);
router.use('/annonces', listingRoutes);

// Espace auto-école : session obligatoire + école courante chargée. Montés sous des
// préfixes distincts pour que les gardes ne s'appliquent QU'à ces routes.
router.use('/tableau-de-bord', requireAuth, loadSchool, dashboardRoutes);
router.use('/mes-annonces', requireAuth, loadSchool, manageRoutes);
router.use('/mon-compte', requireAuth, loadSchool, accountRoutes);

module.exports = router;
