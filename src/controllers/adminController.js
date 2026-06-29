// Espace d'administration : supervision et modération (protégé par requireAdmin + loadAdmin).
const listingService = require('../services/listingService');
const schoolService = require('../services/schoolService');
const applicationService = require('../services/applicationService');
const { deleteStored } = require('../config/storage');
const { parseId, notFound } = require('../utils/http');

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
    } catch {
      return notFound(res); // annonce inexistante
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
    } catch {
      return notFound(res);
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
    } catch {
      return notFound(res);
    }
    req.flash('success', 'Auto-école réactivée.');
    res.redirect('/admin/ecoles');
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard, schools, listings, removeListing, suspendSchool, reactivateSchool };
