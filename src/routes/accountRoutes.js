// Profil auto-école (monté sous /mon-compte, derrière requireAuth + loadSchool).
const express = require('express');
const accountController = require('../controllers/accountController');

const router = express.Router();

router.get('/', accountController.show);
router.post('/', accountController.update);

module.exports = router;
