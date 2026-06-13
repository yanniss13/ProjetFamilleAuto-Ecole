// Tableau de bord de l'auto-école (protégé par requireAuth + loadSchool).
const listingService = require('../services/listingService');
const applicationService = require('../services/applicationService');

// GET /tableau-de-bord
async function index(req, res, next) {
  try {
    const [listings, applications] = await Promise.all([
      listingService.countBySchool(req.school.id),
      applicationService.countBySchool(req.school.id),
    ]);
    res.render('dashboard/index', { title: 'Tableau de bord', stats: { listings, applications } });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
