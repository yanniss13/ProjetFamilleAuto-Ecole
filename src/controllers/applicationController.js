// Candidatures : dépôt public (avec CV) + consultation par l'auto-école.
const { parseId, notFound } = require('../utils/http');

// POST /annonces/:id/postuler
// En amont : applyLimiter (rate-limit) + uploadCv (multer, CV en req.file).
function apply(req, res) {
  // TODO:
  //   1. parseId + listingService.findPublicById -> 404 si introuvable/fermée.
  //   2. validateApplication(req.body).
  //   3. Vérifier le CV : req.file présent et PDF (sinon erreur de validation).
  //   4. applicationService.createForListing(id, { ...value, cvPath: '/uploads/'+req.file.filename }).
  //   5. mailer.sendApplicationNotification(listing.school.email, listing.title, value.applicantName).
  //   6. En cas d'échec de validation APRÈS upload, supprimer le fichier (fs.unlink).
  req.flash('error', 'Candidature : à implémenter (voir docs/DESIGN.md).');
  res.redirect(`/annonces/${req.params.id}`);
}

// GET /mes-annonces/:id/candidatures  (auto-école propriétaire)
async function forListing(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    // TODO: vérifier que l'annonce appartient à req.school, charger les candidatures
    //       (applicationService.findForOwnedListing) et les passer à la vue.
    res.render('dashboard/applications', { title: 'Candidatures', applications: [], listing: null });
  } catch (err) {
    next(err);
  }
}

module.exports = { apply, forListing };
