// Protection CSRF par jeton de session (synchronizer token).
// - génère un jeton unique par session, exposé aux vues via res.locals.csrfToken
//   (champ caché _csrf des formulaires + balise meta) ;
// - sur les requêtes modifiantes, vérifie le jeton reçu, sinon 403.
//
// NB : pour les formulaires multipart (upload CV), le corps n'est pas encore parsé
// quand ce middleware s'exécute → passer le jeton en query (action=".../postuler?_csrf=...").
const crypto = require('crypto');

module.exports = function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (mutating.includes(req.method)) {
    const received =
      (req.body && req.body._csrf) || req.query._csrf || req.headers['x-csrf-token'];
    if (received !== req.session.csrfToken) {
      return res.status(403).render('errors/500', { title: 'Erreur' });
    }
  }
  next();
};
