// Protège l'espace admin : redirige vers /admin/connexion sans session admin.
module.exports = function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    req.flash('error', 'Veuillez vous connecter en tant qu’administrateur.');
    return res.redirect('/admin/connexion');
  }
  next();
};
