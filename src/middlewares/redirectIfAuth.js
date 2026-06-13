// Empêche une auto-école déjà connectée d'accéder à /connexion ou /inscription.
module.exports = function redirectIfAuth(req, res, next) {
  if (req.session && req.session.schoolId) {
    return res.redirect('/tableau-de-bord');
  }
  next();
};
