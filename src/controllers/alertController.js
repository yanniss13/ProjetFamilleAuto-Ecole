// Alertes email des moniteurs : inscription publique (double opt-in), confirmation
// et désabonnement. Aucune session : tout passe par les jetons des liens email.
const alertService = require('../services/alertService');
const mailer = require('../services/mailer');
const { notFound } = require('../utils/http');
const { validateAlert } = require('../validators/alertValidator');

// GET /alertes (?departement=, ?q= — pré-remplissage depuis la recherche d'annonces)
function newForm(req, res) {
  res.render('alerts/new', {
    title: 'Créer une alerte',
    errors: {},
    values: {
      email: '',
      department: typeof req.query.departement === 'string' ? req.query.departement : '',
      keyword: typeof req.query.q === 'string' ? req.query.q : '',
    },
  });
}

// POST /alertes — message neutre identique dans tous les cas (anti-énumération) :
// la réponse ne révèle jamais si l'email est déjà abonné.
async function create(req, res, next) {
  try {
    const { isValid, errors, value } = validateAlert(req.body);
    if (!isValid) {
      return res.status(400).render('alerts/new', { title: 'Créer une alerte', errors, values: req.body });
    }
    const { rawConfirmToken } = await alertService.subscribe(value.email, value.department, value.keyword);
    // Best-effort : alerte déjà confirmée => rien à envoyer ; échec d'envoi => même message.
    if (rawConfirmToken) {
      await mailer.sendAlertConfirmation(value.email, value.department, value.keyword || null, rawConfirmToken);
    }
    req.flash('success', 'Si votre adresse est valide, un email de confirmation vient de vous être envoyé.');
    res.redirect('/alertes');
  } catch (err) {
    next(err);
  }
}

// GET /alertes/confirmer/:token — idempotent (re-clic = succès).
async function confirm(req, res, next) {
  try {
    const alert = await alertService.confirmByToken(req.params.token);
    if (!alert) return notFound(res);
    res.render('alerts/confirmed', { title: 'Alerte activée', alert });
  } catch (err) {
    next(err);
  }
}

module.exports = { newForm, create, confirm };
