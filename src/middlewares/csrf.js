// Protection CSRF par jeton de session (synchronizer token).
// - génère un jeton unique par session, exposé aux vues via res.locals.csrfToken
//   (champ caché _csrf des formulaires + balise meta) ;
// - sur les requêtes modifiantes, vérifie le jeton reçu, sinon 403.
//
// Cas particulier des formulaires multipart (upload de pièces) : le corps n'est pas
// encore parsé quand ce middleware s'exécute (multer intervient au niveau de la route).
// Pour ces routes — listées explicitement dans DEFERRED_MULTIPART — la vérification est
// différée à verifyAfterUpload, monté APRÈS multer. Tout autre POST multipart est refusé
// ici : sans cette liste blanche, un formulaire multipart contournerait le contrôle sur
// les routes qui ne lisent pas le corps (déconnexion, actions admin...).
const fs = require('fs');
const crypto = require('crypto');

const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Routes multipart dont la vérification CSRF est différée après multer.
const DEFERRED_MULTIPART = [/^\/annonces\/\d+\/postuler\/?$/];

function isMultipart(req) {
  return (req.headers['content-type'] || '').startsWith('multipart/form-data');
}

// Comparaison en temps constant (pas d'oracle temporel sur le jeton).
function tokensMatch(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function deny(res) {
  return res.status(403).render('errors/500', { title: 'Erreur' });
}

function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (MUTATING.includes(req.method)) {
    if (isMultipart(req) && DEFERRED_MULTIPART.some((rx) => rx.test(req.path))) {
      return next(); // vérifié par verifyAfterUpload, une fois le corps parsé
    }
    const received = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
    if (!tokensMatch(received, req.session.csrfToken)) {
      return deny(res);
    }
  }
  next();
}

// Vérification différée pour les routes multipart : monté APRÈS multer, qui a parsé les
// champs texte (req.body._csrf) et déjà écrit les fichiers sur disque — en cas d'échec,
// on les supprime pour ne pas laisser de fichiers orphelins.
function verifyAfterUpload(req, res, next) {
  const received = req.body && req.body._csrf;
  if (!tokensMatch(received, req.session.csrfToken)) {
    for (const files of Object.values(req.files || {})) {
      for (const f of files) {
        if (f && f.path) fs.unlink(f.path, () => {});
      }
    }
    return deny(res);
  }
  next();
}

module.exports = csrf;
module.exports.verifyAfterUpload = verifyAfterUpload;
