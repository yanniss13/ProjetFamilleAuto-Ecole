// Annonces : consultation publique + gestion par l'auto-école propriétaire.
const listingService = require('../services/listingService');
const { validateListing } = require('../validators/listingValidator');
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
async function create(req, res, next) {
  try {
    const { isValid, errors, value } = validateListing(req.body);
    if (!isValid) {
      return res.status(400).render('dashboard/listing_form', {
        title: 'Nouvelle annonce',
        errors,
        values: req.body,
        isEdit: false,
      });
    }
    await listingService.createForSchool(req.school.id, value);
    req.flash('success', 'Annonce publiée.');
    res.redirect('/mes-annonces');
  } catch (err) {
    next(err);
  }
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
async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const listing = await listingService.findOwnedById(req.school.id, id);
    if (!listing) return notFound(res);

    const { isValid, errors, value } = validateListing(req.body);
    if (!isValid) {
      return res.status(400).render('dashboard/listing_form', {
        title: 'Modifier une annonce',
        errors,
        values: req.body,
        listing,
        isEdit: true,
      });
    }
    await listingService.updateOwned(req.school.id, id, value);
    req.flash('success', 'Annonce mise à jour.');
    res.redirect('/mes-annonces');
  } catch (err) {
    next(err);
  }
}

// POST /mes-annonces/:id/supprimer
async function destroy(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    // deleteOwned est scopé par schoolId : count 0 => annonce inexistante ou non possédée.
    const { count } = await listingService.deleteOwned(req.school.id, id);
    if (count === 0) return notFound(res);
    req.flash('success', 'Annonce supprimée (ainsi que ses candidatures).');
    res.redirect('/mes-annonces');
  } catch (err) {
    next(err);
  }
}

// POST /mes-annonces/:id/cloturer
async function close(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const { count } = await listingService.updateOwned(req.school.id, id, { status: 'closed' });
    if (count === 0) return notFound(res);
    req.flash('success', 'Annonce clôturée.');
    res.redirect('/mes-annonces');
  } catch (err) {
    next(err);
  }
}

module.exports = { browse, show, mine, newForm, create, editForm, update, destroy, close };
