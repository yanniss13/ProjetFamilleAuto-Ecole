// Tableau de bord de l'auto-école (protégé par requireAuth + loadSchool).
const statsService = require('../services/statsService');

// GET /tableau-de-bord
async function index(req, res, next) {
  try {
    const stats = await statsService.forSchool(req.school.id);
    res.render('dashboard/index', {
      title: 'Tableau de bord',
      stats,
      // Bloc <script type="application/json"> : « < » échappé pour qu'aucune donnée ne
      // puisse fermer le bloc. Rendu avec |raw — voir le commentaire autoescape de app.js.
      // Les titres d'annonces (topListings) ne transitent PAS par le JSON : ils sont
      // rendus par le tableau Twig (autoescape). Seuls chiffres et libellés de
      // graphiques passent ici.
      statsJson: JSON.stringify({ tiles: stats.tiles, weekly: stats.weekly, funnel: stats.funnel }).replace(/</g, '\\u003c'),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
