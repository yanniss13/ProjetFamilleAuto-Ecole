// Route publique de suivi de candidature (montée sous /suivi).
const express = require('express');
const trackingController = require('../controllers/trackingController');

const router = express.Router();

router.get('/:token', trackingController.show);

module.exports = router;
