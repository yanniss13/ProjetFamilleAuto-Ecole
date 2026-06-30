// Charge l'auto-école courante depuis la session et l'expose aux contrôleurs/vues.
// Si la session référence une école inexistante, on détruit la session.
const schoolService = require('../services/schoolService');

module.exports = async function loadSchool(req, res, next) {
  try {
    const school = await schoolService.findById(req.session.schoolId);
    if (!school) {
      return req.session.destroy(() => res.redirect('/connexion'));
    }
    if (school.suspended) {
      return req.session.destroy(() => {
        // Pas de flash ici (session détruite) : la page de connexion suffit.
        res.redirect('/connexion');
      });
    }
    req.school = school;
    res.locals.currentSchool = school;
    next();
  } catch (err) {
    next(err);
  }
};
