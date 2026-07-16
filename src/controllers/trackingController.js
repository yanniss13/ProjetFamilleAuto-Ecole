// Page de suivi publique accessible par jeton. Après validation, seul l'identifiant
// est conservé en session pour les lectures temps réel suivantes.
const applicationService = require('../services/applicationService');
const { notFound } = require('../utils/http');

const MAX_REALTIME_APPLICATIONS = 5;

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

async function bindRealtimeApplication(req, applicationId) {
  const previous = Array.isArray(req.session.realtimeApplicationIds)
    ? req.session.realtimeApplicationIds.filter((id) => Number.isInteger(id) && id > 0 && id !== applicationId)
    : [];
  previous.push(applicationId);
  req.session.realtimeApplicationIds = previous.slice(-MAX_REALTIME_APPLICATIONS);
  await saveSession(req);
}

async function show(req, res, next) {
  try {
    const token = req.params.token;
    if (!token) return notFound(res);
    const application = await applicationService.findByTrackingToken(token);
    if (!application) return notFound(res);
    await bindRealtimeApplication(req, application.id);
    res.render('tracking/show', { title: 'Suivi de candidature', application });
  } catch (err) {
    next(err);
  }
}

module.exports = { show, bindRealtimeApplication };
