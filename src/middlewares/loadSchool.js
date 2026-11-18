// Charge l'auto-école courante depuis la session et l'expose aux contrôleurs/vues.
// Si la session référence une école inexistante, on détruit la session.
const schoolService = require('../services/schoolService');
const realtimeAuthResponse = require('./realtimeAuthResponse');

function destroyInvalidSchoolSession(req, res) {
  return req.session.destroy(() => {
    if (!realtimeAuthResponse.respond(req, res)) res.redirect('/connexion');
  });
}

module.exports = async function loadSchool(req, res, next) {
  try {
    const school = await schoolService.findById(req.session.schoolId);
    if (!school || school.suspended) return destroyInvalidSchoolSession(req, res);
    req.school = school;
    res.locals.currentSchool = school;
    next();
  } catch (err) {
    next(err);
  }
};
