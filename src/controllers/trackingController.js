// Page de suivi publique d'une candidature, accessible via un jeton opaque (sans compte).
// Lecture seule, n'expose que des informations non sensibles (voir la vue).
const applicationService = require('../services/applicationService');
const { notFound } = require('../utils/http');

// GET /suivi/:token
async function show(req, res, next) {
  try {
    const token = req.params.token;
    if (!token) return notFound(res);
    const application = await applicationService.findByTrackingToken(token);
    if (!application) return notFound(res);
    res.render('tracking/show', { title: 'Suivi de candidature', application });
  } catch (err) {
    next(err);
  }
}

module.exports = { show };
