'use strict';

// Anti-spam de la messagerie (lot N) : 30 messages / 15 min par IP et par côté
// (moniteur via son lien de suivi, école connectée). `backUrl(req)` donne la page
// où revenir avec le message d'erreur.
const rateLimit = require('express-rate-limit');

function createMessageLimiter(backUrl) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => {
      req.flash('error', 'Trop de messages envoyés. Veuillez réessayer plus tard.');
      res.status(429).redirect(backUrl(req));
    },
  });
}

module.exports = { createMessageLimiter };
