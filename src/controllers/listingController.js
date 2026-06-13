// Annonces : consultation publique + gestion par l'auto-école propriétaire.
const listingService = require('../services/listingService');
const { parseId, notFound } = require('../utils/http');

// ----------------------------- Public -----------------------------

// GET /annonces  (?departement=, ?q=)
async function browse(req, res, next) {
  try {
    const { departement, q } = req.query;
    const listings = await listingService.findPublic({ department: departement, q });
    res.render('listings/index', {
      title: 'Annonces',
      listings,
      filters: { departement: departement || '', q: q || '' },
    });
  } catch (err) {
    next(err);
  }
}

// GET /annonces/:id
async function show(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const listing = await listingService.findPublicById(id);
    if (!listing) return notFound(res);
    res.render('listings/show', { title: listing.title, listing, errors: {}, values: {} });
  } catch (err) {
    next(err);
  }
}

// ----------------------- Gestion (auto-école) ----------------------
// Protégées en amont par requireAuth + loadSchool : req.school est défini.

// GET /mes-annonces
async function mine(req, res, next) {
  try {
    const listings = await listingService.findAllBySchool(req.school.id);
    res.render('dashboard/listings', { title: 'Mes annonces', listings });
  } catch (err) {
    next(err);
  }
}

// GET /mes-annonces/nouvelle
function newForm(req, res) {
  res.render('dashboard/listing_form', { title: 'Nouvelle annonce', errors: {}, values: {}, isEdit: false });
}

// POST /mes-annonces
function create(req, res) {
  // TODO: validateListing -> listingService.createForSchool(req.school.id, value).
  req.flash('error', "Création d'annonce : à implémenter (voir docs/DESIGN.md).");
  res.redirect('/mes-annonces');
}

// GET /mes-annonces/:id/modifier
async function editForm(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const listing = await listingService.findOwnedById(req.school.id, id);
    if (!listing) return notFound(res);
    res.render('dashboard/listing_form', {
      title: 'Modifier une annonce',
      errors: {},
      values: listing,
      listing,
      isEdit: true,
    });
  } catch (err) {
    next(err);
  }
}

// POST /mes-annonces/:id/modifier
function update(req, res) {
  // TODO: parseId + findOwnedById -> validateListing -> updateOwned.
  req.flash('error', 'Modification : à implémenter (voir docs/DESIGN.md).');
  res.redirect('/mes-annonces');
}

// POST /mes-annonces/:id/supprimer
function destroy(req, res) {
  // TODO: parseId + deleteOwned (supprime aussi les candidatures en cascade).
  req.flash('error', 'Suppression : à implémenter (voir docs/DESIGN.md).');
  res.redirect('/mes-annonces');
}

// POST /mes-annonces/:id/cloturer
function close(req, res) {
  // TODO: updateOwned(..., { status: 'closed' }).
  req.flash('error', 'Clôture : à implémenter (voir docs/DESIGN.md).');
  res.redirect('/mes-annonces');
}

module.exports = { browse, show, mine, newForm, create, editForm, update, destroy, close };
