// Pages publiques générales.
const listingService = require('../services/listingService');

const LATEST_ON_HOME = 3;

// Accueil : recherche directe, nombre d'annonces ouvertes et dernières publiées.
async function home(req, res, next) {
  try {
    const { items, total } = await listingService.findPublic({ page: 1 });
    res.render('index', { title: 'Accueil', latest: items.slice(0, LATEST_ON_HOME), openCount: total });
  } catch (err) {
    next(err);
  }
}

module.exports = { home };
