// Protège l'espace auto-école : redirige vers /connexion sans session valide.
// (La vérification de l'email est appliquée à la connexion : on ne crée la session
//  que si emailVerified est vrai — voir authController.)
const realtimeAuthResponse = require('./realtimeAuthResponse');

module.exports = function requireAuth(req, res, next) {
  if (!req.session || !req.session.schoolId) {
    if (realtimeAuthResponse.respond(req, res)) return;
    req.flash('error', 'Veuillez vous connecter pour accéder à cette page.');
    return res.redirect('/connexion');
  }
  next();
};
