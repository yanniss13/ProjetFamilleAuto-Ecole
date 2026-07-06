// Espace d'administration : supervision et modération (protégé par requireAdmin + loadAdmin).
const listingService = require('../services/listingService');
const schoolService = require('../services/schoolService');
const applicationService = require('../services/applicationService');
const { deleteStored } = require('../config/storage');
const { parseId, notFound } = require('../utils/http');

// P2025 = « enregistrement introuvable » (Prisma). Seul ce cas vaut 404 : toute autre
// erreur (base indisponible...) doit suivre le circuit d'erreur normal, pas être maquillée.
function isRecordNotFound(err) {
  return Boolean(err) && err.code === 'P2025';
}

// GET /admin
async function dashboard(req, res, next) {
  try {
    const [schools, listings, applications] = await Promise.all([
      schoolService.countAll(),
      listingService.countAll(),
      applicationService.countAllGlobal(),
    ]);
    res.render('admin/dashboard', { title: 'Administration', stats: { schools, listings, applications } });
  } catch (err) {
    next(err);
  }
}

// GET /admin/ecoles
async function schools(req, res, next) {
  try {
    const all = await schoolService.findAllWithCounts();
    res.render('admin/schools', { title: 'Auto-écoles', schools: all });
  } catch (err) {
    next(err);
  }
}

// GET /admin/annonces
async function listings(req, res, next) {
  try {
    const all = await listingService.findAllWithSchool();
    res.render('admin/listings', { title: 'Annonces', listings: all });
  } catch (err) {
    next(err);
  }
}

// POST /admin/annonces/:id/supprimer
async function removeListing(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const filePaths = await listingService.findAnyFilePathsForListing(id);
    try {
      await listingService.deleteAny(id);
    } catch (err) {
      if (isRecordNotFound(err)) return notFound(res); // annonce inexistante
      throw err;
    }
    for (const rel of filePaths) deleteStored(rel);
    req.flash('success', 'Annonce retirée.');
    res.redirect('/admin/annonces');
  } catch (err) {
    next(err);
  }
}

// POST /admin/ecoles/:id/suspendre
async function suspendSchool(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    try {
      await schoolService.setSuspended(id, true);
    } catch (err) {
      if (isRecordNotFound(err)) return notFound(res);
      throw err;
    }
    req.flash('success', 'Auto-école suspendue.');
    res.redirect('/admin/ecoles');
  } catch (err) {
    next(err);
  }
}

// POST /admin/ecoles/:id/reactiver
async function reactivateSchool(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    try {
      await schoolService.setSuspended(id, false);
    } catch (err) {
      if (isRecordNotFound(err)) return notFound(res);
      throw err;
    }
    req.flash('success', 'Auto-école réactivée.');
    res.redirect('/admin/ecoles');
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard, schools, listings, removeListing, suspendSchool, reactivateSchool };
