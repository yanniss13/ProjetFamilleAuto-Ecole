// Profil de l'auto-école : édition de l'adresse (géocodée pour la carte) et du téléphone.
// Protégé en amont par requireAuth + loadSchool : req.school est défini.
const { validateProfile } = require('../validators/schoolValidator');
const schoolService = require('../services/schoolService');
const geocoder = require('../services/geocoder');

// GET /mon-compte
function show(req, res) {
  res.render('dashboard/account', {
    title: 'Mon compte',
    errors: {},
    values: { address: req.school.address || '', phone: req.school.phone || '' },
  });
}

// POST /mon-compte
async function update(req, res, next) {
  try {
    const { isValid, errors, value } = validateProfile(req.body);
    if (!isValid) {
      return res.status(400).render('dashboard/account', { title: 'Mon compte', errors, values: req.body });
    }

    const data = { phone: value.phone, address: value.address };

    // Re-géocode uniquement si l'adresse a changé. Adresse vidée -> coordonnées nulles.
    const addressChanged = (req.school.address || null) !== value.address;
    if (addressChanged) {
      const { latitude, longitude } = await geocoder.coordsFor(value.address);
      data.latitude = latitude;
      data.longitude = longitude;
    }

    await schoolService.update(req.school.id, data);

    let msg = 'Profil mis à jour.';
    if (addressChanged && value.address && data.latitude == null) {
      msg = "Profil mis à jour. L'adresse n'a pas pu être localisée sur la carte — vérifiez-la.";
    }
    req.flash('success', msg);
    res.redirect('/mon-compte');
  } catch (err) {
    next(err);
  }
}

module.exports = { show, update };
