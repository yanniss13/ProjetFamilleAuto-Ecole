// Middleware "flash" minimal : dépose un message lors d'une requête (avant une
// redirection) et l'expose à la requête suivante via res.locals.flash.
module.exports = function flash(req, res, next) {
  res.locals.flash = req.session.flash || {};
  req.session.flash = {};

  req.flash = (type, message) => {
    if (!req.session.flash) req.session.flash = {};
    req.session.flash[type] = message;
  };

  next();
};
