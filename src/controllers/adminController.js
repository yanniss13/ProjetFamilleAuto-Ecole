// Espace d'administration : supervision et modération (protégé par requireAdmin + loadAdmin).
const listingService = require('../services/listingService');
const schoolService = require('../services/schoolService');
const statsService = require('../services/statsService');
const purgeService = require('../services/purgeService');
const { deleteStored } = require('../config/storage');
const { parseId, notFound } = require('../utils/http');
const { parsePage, paginate, pageUrl } = require('../utils/pagination');

// Pagination d'une liste admin : borne la page demandée et construit les URLs.
async function paginateAdminList(req, basePath, countFn, findFn) {
  const total = await countFn();
  const { page, pageCount, skip, take } = paginate(parsePage(req.query.page), total);
  const items = await findFn({ skip, take });
  return {
    items,
    pagination: {
      page,
      pageCount,
      prevUrl: page > 1 ? pageUrl(basePath, {}, page - 1) : null,
      nextUrl: page < pageCount ? pageUrl(basePath, {}, page + 1) : null,
    },
  };
}

// P2025 = « enregistrement introuvable » (Prisma). Seul ce cas vaut 404 : toute autre
// erreur (base indisponible...) doit suivre le circuit d'erreur normal, pas être maquillée.
function isRecordNotFound(err) {
  return Boolean(err) && err.code === 'P2025';
}

function contractLabel(type) {
  return ({ cdi: 'CDI', cdd: 'CDD', freelance: 'Freelance', apprentissage: 'Apprentissage' })[type] || type || '';
}

function pluralLabel(count, singular, plural) {
  return `${count} ${count > 1 ? plural : singular}`;
}

function formatAdminListing(listing) {
  const applicationsCount = listing._count ? listing._count.applications : 0;
  const publicAvailable = listing.status === 'open' && !listing.school.suspended;
  return {
    ...listing,
    applicationsLabel: pluralLabel(applicationsCount, 'candidature', 'candidatures'),
    contractTypeLabel: contractLabel(listing.contractType),
    createdLabel: listing.createdAt.toLocaleDateString('fr-FR'),
    publicAvailable,
    statusLabel: listing.status === 'open' ? 'Ouverte' : 'Clôturée',
    viewsLabel: pluralLabel(listing.viewsCount, 'vue', 'vues'),
  };
}

// GET /admin
async function dashboard(req, res, next) {
  try {
    const [stats, lastPurge] = await Promise.all([statsService.forPlatform(), purgeService.findLatestRun()]);
    res.render('admin/dashboard', {
      title: 'Administration',
      stats,
      lastPurge,
      // Même échappement de « < » que le tableau de bord école (bloc #stats-data + |raw).
      statsJson: JSON.stringify(stats).replace(/</g, '\\u003c'),
    });
  } catch (err) {
    next(err);
  }
}

// GET /admin/ecoles
async function schools(req, res, next) {
  try {
    const { items, pagination } = await paginateAdminList(
      req, '/admin/ecoles', schoolService.countAll, schoolService.findAllWithCounts
    );
    res.render('admin/schools', { title: 'Auto-écoles', schools: items, pagination });
  } catch (err) {
    next(err);
  }
}

// GET /admin/annonces
async function listings(req, res, next) {
  try {
    const { items, pagination } = await paginateAdminList(
      req, '/admin/annonces', listingService.countAll, listingService.findAllWithSchool
    );
    res.render('admin/listings', { title: 'Annonces', listings: items.map(formatAdminListing), pagination });
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

// POST /admin/purge — purge manuelle (démo ou besoin ponctuel), mêmes règles que
// la purge planifiée.
async function purge(req, res, next) {
  try {
    const c = await purgeService.runPurge();
    req.flash('success', `Purge effectuée : ${c.unconfirmedAlerts} alerte(s), ${c.rejectedApplications} candidature(s), ${c.expiredTokens} jeton(s).`);
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard, schools, listings, removeListing, suspendSchool, reactivateSchool, purge };
