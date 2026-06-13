// Authentification auto-école (email + mot de passe, vérification email, reset).
// SQUELETTE : les GET rendent les vues ; les POST sont des stubs à implémenter
// selon docs/DESIGN.md (validation, bcrypt, jetons hachés, régénération de session,
// envoi d'emails, réponses génériques anti-énumération).
//
// Briques déjà disponibles : validators/schoolValidator, utils/password,
// services/schoolService, services/tokens, services/mailer.

function showRegister(req, res) {
  res.render('auth/register', { title: 'Inscription', errors: {}, values: {} });
}

function register(req, res) {
  // TODO: validateRegister -> unicité email/SIRET -> hash mdp -> create ->
  //       générer jeton de vérif (tokens) -> mailer.sendVerification.
  req.flash('error', "Inscription : à implémenter (voir docs/DESIGN.md).");
  res.redirect('/inscription');
}

function verifyEmail(req, res) {
  // TODO: hashToken(req.params.token) -> rechercher l'école, vérifier expiry ->
  //       emailVerified=true, effacer le jeton.
  res.render('auth/verify-notice', { title: 'Vérification de l’email' });
}

function showLogin(req, res) {
  res.render('auth/login', { title: 'Connexion', errors: {}, values: {} });
}

function login(req, res) {
  // TODO: validateLogin -> findByEmail -> password.compare -> exiger emailVerified
  //       -> req.session.regenerate -> req.session.schoolId = school.id.
  req.flash('error', 'Connexion : à implémenter (voir docs/DESIGN.md).');
  res.redirect('/connexion');
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/connexion'));
}

function showForgot(req, res) {
  res.render('auth/forgot', { title: 'Mot de passe oublié', errors: {} });
}

function forgot(req, res) {
  // TODO: si l'email existe, générer un jeton reset + mailer.sendReset.
  //       Réponse TOUJOURS générique (anti-énumération).
  req.flash('success', 'Si un compte existe pour cet email, un lien a été envoyé.');
  res.redirect('/connexion');
}

function showReset(req, res) {
  res.render('auth/reset', { title: 'Nouveau mot de passe', errors: {} });
}

function reset(req, res) {
  // TODO: hashToken(req.params.token) -> rechercher école + vérifier expiry ->
  //       valider mdp -> hash -> update -> invalider le jeton.
  req.flash('error', 'Réinitialisation : à implémenter (voir docs/DESIGN.md).');
  res.redirect('/connexion');
}

module.exports = {
  showRegister,
  register,
  verifyEmail,
  showLogin,
  login,
  logout,
  showForgot,
  forgot,
  showReset,
  reset,
};
