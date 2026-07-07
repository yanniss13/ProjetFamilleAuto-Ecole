// Expose la session aux vues pour la barre de navigation, sans mélanger les espaces :
// l'école peut garder son raccourci back-office sur les pages publiques. L'admin, lui,
// reste une vraie "vue admin" uniquement sous /admin, mais les pages publiques savent
// quand même afficher la déconnexion au lieu de proposer une nouvelle connexion.
// AFFICHAGE UNIQUEMENT : les routes protégées gardent leurs gardes
// (requireAuth/requireAdmin + loadSchool/loadAdmin), seules sources de vérité pour
// req.school / req.admin — ce middleware ne pose jamais ces propriétés-là.
const schoolService = require('../services/schoolService');
const adminService = require('../services/adminService');

function isAdminPath(path) {
  return path === '/admin' || path.startsWith('/admin/');
}

module.exports = async function sessionLocals(req, res, next) {
  try {
    const adminPath = isAdminPath(req.path);
    // Même prédicat que les gardes de route (session brute) : une école suspendue
    // reste une session back-office, l'affichage doit refuser ce que la route refuse.
    res.locals.backOfficeSession = Boolean(req.session && (req.session.schoolId || req.session.adminId));
    if (req.session && req.session.schoolId && !adminPath) {
      const school = await schoolService.findById(req.session.schoolId);
      if (school && !school.suspended) res.locals.currentSchool = school;
    } else if (req.session && req.session.adminId) {
      const admin = await adminService.findById(req.session.adminId);
      if (admin) {
        res.locals.adminSessionActive = true;
        if (adminPath) res.locals.currentAdmin = admin;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};
