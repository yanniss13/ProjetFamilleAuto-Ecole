// Routes publiques des alertes email moniteurs (montées sous /alertes).
const express = require('express');
const rateLimit = require('express-rate-limit');
const alertController = require('../controllers/alertController');

const router = express.Router();

// Anti-abus : chaque POST peut déclencher un email de confirmation.
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Trop de demandes. Veuillez réessayer plus tard.');
    res.status(429).redirect('/alertes');
  },
});

router.get('/', alertController.newForm);
router.post('/', subscribeLimiter, alertController.create);
router.get('/confirmer/:token', alertController.confirm);
router.get('/desabonner/:token', alertController.unsubscribeForm);
router.post('/desabonner/:token', alertController.unsubscribe);

module.exports = router;
