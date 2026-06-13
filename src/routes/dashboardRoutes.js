// Tableau de bord (monté sous /tableau-de-bord, derrière requireAuth + loadSchool).
const express = require('express');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

router.get('/', dashboardController.index);

module.exports = router;
