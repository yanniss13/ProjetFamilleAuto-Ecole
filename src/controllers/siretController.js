// Relais interne de la verification SIRET : la CSP (connect-src 'self') interdit au
// navigateur d'appeler l'API externe, il passe donc par cette route meme-origine.
// Surface volontairement minimale : { status, name, address }, jamais la reponse brute.
const siretService = require('../services/siret');
const { normalizeSiret } = require('../validators/schoolValidator');

// GET /api/siret/:siret
async function check(req, res, next) {
  try {
    const siret = normalizeSiret(req.params.siret);
    if (siret.length !== 14) {
      return res.status(400).json({ status: 'invalid', name: null, address: null });
    }
    const { status, name, address } = await siretService.lookupSiret(siret);
    res.json({ status, name, address });
  } catch (err) {
    next(err);
  }
}

module.exports = { check };
