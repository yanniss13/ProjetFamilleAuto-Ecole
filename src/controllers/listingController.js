// Annonces : consultation publique + gestion par l'auto-école propriétaire.
const listingService = require('../services/listingService');
const alertService = require('../services/alertService');
const { validateListing } = require('../validators/listingValidator');
const { parseId, notFound } = require('../utils/http');
const { deleteStored } = require('../config/storage');
const { parsePage, paginate, pageUrl } = require('../utils/pagination');
const geocoder = require('../services/geocoder');

// Rayons de recherche proposés (km). Défaut : 25.
const RAYONS = [10, 25, 50, 100];

// ----------------------------- Public -----------------------------

// GET /annonces  (?departement=, ?q=, ?ville=, ?rayon=, ?vue=, ?page=)
async function browse(req, res, next) {
  try {
    const { departement, q } = req.query;
    const ville = (typeof req.query.ville === 'string' ? req.query.ville : '').trim();
    const rayonParsed = parseInt(req.query.rayon, 10);
    const rayon = RAYONS.includes(rayonParsed) ? rayonParsed : 25;
    const vue = req.query.vue === 'carte' ? 'carte' : 'liste';
    const page = parsePage(req.query.page);

    // Rayon actif seulement si la ville saisie est localisable (cache Nominatim).
    let center = null;
    let villeIntrouvable = false;
    if (ville) {
      center = await geocoder.geocodeCached(ville);
      if (!center) villeIntrouvable = true;
    }

    const query = { departement: departement || '', q: q || '', ville, rayon: ville ? String(rayon) : '' };
    // Lien « créer une alerte » pré-rempli avec la recherche courante (URL encodée
    // côté serveur, échappée par Twig à l'affichage).
    const alertParams = new URLSearchParams();
    if (query.departement) alertParams.set('departement', query.departement);
    if (query.q) alertParams.set('q', query.q);
    const alerteUrl = alertParams.toString() ? `/alertes?${alertParams.toString()}` : '/alertes';
    const common = {
      title: 'Annonces',
      filters: { departement: query.departement, q: query.q, ville, rayon },
      rayons: RAYONS,
      vue,
      villeIntrouvable,
      alerteUrl,
      listeUrl: pageUrl('/annonces', query, 1),
      carteUrl: pageUrl('/annonces', { ...query, vue: 'carte' }, 1),
    };

    if (vue === 'carte') {
      const { schools, unlocatedCount } = await listingService.findPublicForMap({
        department: departement, q, center, radiusKm: center ? rayon : null,
      });
      const mapData = { schools, center: center ? { lat: center.lat, lng: center.lng, radiusKm: rayon, label: ville } : null };
      return res.render('listings/index', {
        ...common,
        listings: [],
        unlocatedCount,
        // Bloc <script type="application/json"> : "<" échappé pour qu'aucune donnée
        // (titre d'annonce...) ne puisse fermer le bloc. Rendu avec |raw : voir le
        // commentaire autoescape de app.js (unique exception, JSON jamais HTML).
        mapJson: JSON.stringify(mapData).replace(/</g, '\\u003c'),
      });
    }

    const { items, total } = await listingService.findPublic({
      department: departement, q, page, center, radiusKm: center ? rayon : null,
    });
    const { page: current, pageCount } = paginate(page, total);
    res.render('listings/index', {
      ...common,
      listings: items,
      pagination: {
        page: current,
        pageCount,
        prevUrl: current > 1 ? pageUrl('/annonces', query, current - 1) : null,
        nextUrl: current < pageCount ? pageUrl('/annonces', query, current + 1) : null,
      },
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
    listingService.incrementViews(id); // fire-and-forget : le rendu n'attend pas le compteur
    res.render('listings/show', { title: listing.title, listing, errors: {}, values: {} });
  } catch (err) {
    next(err);
  }
}

// ----------------------- Gestion (auto-école) ----------------------
// Protégées en amont par requireAuth + loadSchool : req.school est défini.

// GET /mes-annonces  (?page=)
async function mine(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const { items, total } = await listingService.findAllBySchool(req.school.id, page);
    const { page: current, pageCount } = paginate(page, total);
    res.render('dashboard/listings', {
      title: 'Mes annonces',
      listings: items,
      pagination: {
        page: current,
        pageCount,
        prevUrl: current > 1 ? pageUrl('/mes-annonces', {}, current - 1) : null,
        nextUrl: current < pageCount ? pageUrl('/mes-annonces', {}, current + 1) : null,
      },
    });
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
    const listing = await listingService.createForSchool(req.school.id, value);
    alertService.notifyNewListing(listing); // fire-and-forget : la publication n'attend pas les emails
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
    // On collecte les chemins AVANT la suppression (la cascade DB efface les candidatures).
    const filePaths = await listingService.findFilePathsForListing(req.school.id, id);
    // deleteOwned est scopé par schoolId : count 0 => annonce inexistante ou non possédée.
    const { count } = await listingService.deleteOwned(req.school.id, id);
    if (count === 0) return notFound(res);
    for (const rel of filePaths) deleteStored(rel); // best-effort, ne bloque jamais
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
