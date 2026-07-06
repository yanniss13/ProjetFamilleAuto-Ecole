// Expose la session à TOUTES les vues (barre de navigation) : sans cela, une école
// ou un admin connecté qui visite une page publique (/annonces, /alertes…) voit le
// menu « déconnecté » et perd le chemin de son espace.
// AFFICHAGE UNIQUEMENT : les routes protégées gardent leurs gardes
// (requireAuth/requireAdmin + loadSchool/loadAdmin), seules sources de vérité pour
// req.school / req.admin — ce middleware ne pose jamais ces propriétés-là.
const schoolService = require('../services/schoolService');
const adminService = require('../services/adminService');

module.exports = async function sessionLocals(req, res, next) {
  try {
    if (req.session && req.session.schoolId) {
      const school = await schoolService.findById(req.session.schoolId);
      if (school && !school.suspended) res.locals.currentSchool = school;
    } else if (req.session && req.session.adminId) {
      const admin = await adminService.findById(req.session.adminId);
      if (admin) res.locals.currentAdmin = admin;
    }
    next();
  } catch (err) {
    next(err);
  }
};
