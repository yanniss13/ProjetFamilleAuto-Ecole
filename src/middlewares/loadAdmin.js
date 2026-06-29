// Charge l'admin courant depuis la session ; détruit la session si l'admin n'existe plus.
const adminService = require('../services/adminService');

module.exports = async function loadAdmin(req, res, next) {
  try {
    const admin = await adminService.findById(req.session.adminId);
    if (!admin) {
      return req.session.destroy(() => res.redirect('/admin/connexion'));
    }
    req.admin = admin;
    res.locals.currentAdmin = admin;
    next();
  } catch (err) {
    next(err);
  }
};
