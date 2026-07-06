// Candidatures : dépôt public (CV + pièce d'identité) + consultation et téléchargement
// des pièces par l'auto-école propriétaire (fichiers servis depuis le stockage privé).
const fs = require('fs');
const listingService = require('../services/listingService');
const applicationService = require('../services/applicationService');
const { validateApplication } = require('../validators/applicationValidator');
const mailer = require('../services/mailer');
const { relPathOf } = require('../middlewares/upload');
const { resolveStored } = require('../config/storage');
const { generateOpaqueToken } = require('../services/tokens');
const { parseId, notFound } = require('../utils/http');
const { parsePage, paginate, pageUrl } = require('../utils/pagination');

// Récupère le 1er fichier d'un champ multer (.fields => req.files[name] = [file]).
function fileOf(req, field) {
  return req.files && req.files[field] && req.files[field][0];
}

// Champs fichiers attendus sur la candidature.
const FILE_FIELDS = ['cv', 'idCard', 'license', 'teachingCard'];

// Supprime du disque les fichiers déjà téléversés (candidature finalement rejetée).
function discardUploads(req) {
  for (const field of FILE_FIELDS) {
    const f = fileOf(req, field);
    if (f && f.path) fs.unlink(f.path, () => {});
  }
}

// POST /annonces/:id/postuler
// En amont : applyLimiter + handleApplicationUpload (CV + CNI dans req.files,
// erreurs multer dans req.uploadError).
async function apply(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      discardUploads(req);
      return notFound(res);
    }

    const listing = await listingService.findPublicById(id);
    if (!listing) {
      discardUploads(req);
      return notFound(res);
    }

    const { isValid, errors, value } = validateApplication(req.body);
    const cvFile = fileOf(req, 'cv');
    const idFile = fileOf(req, 'idCard');
    const licenseFile = fileOf(req, 'license');
    const teachingFile = fileOf(req, 'teachingCard');

    if (req.uploadError) errors.files = req.uploadError;
    if (!cvFile) errors.cv = 'Un CV au format PDF est obligatoire.';
    if (!idFile) errors.idCard = "Une pièce d'identité (PDF, JPG ou PNG) est obligatoire.";
    if (!licenseFile) errors.license = 'Le permis de conduire (PDF, JPG ou PNG) est obligatoire.';
    if (!teachingFile) errors.teachingCard = "La carte d'enseignant (PDF, JPG ou PNG) est obligatoire.";

    if (!isValid || Object.keys(errors).length > 0) {
      discardUploads(req); // pas de fichiers orphelins
      return res.status(400).render('listings/show', {
        title: listing.title,
        listing,
        errors,
        values: req.body,
      });
    }

    const trackingToken = generateOpaqueToken();
    await applicationService.createForListing(id, {
      ...value,
      cvPath: relPathOf(cvFile),
      idCardPath: relPathOf(idFile),
      licensePath: relPathOf(licenseFile),
      teachingCardPath: relPathOf(teachingFile),
      trackingToken,
    });

    // Best-effort, en parallèle (mailer.send ne lève jamais) : notification à l'école
    // + confirmation au candidat avec son lien de suivi.
    await Promise.all([
      mailer.sendApplicationNotification(listing.school.email, listing.title, value.applicantName),
      mailer.sendApplicationConfirmation(value.applicantEmail, value.applicantName, listing.title, trackingToken),
    ]);

    req.flash('success', 'Votre candidature a bien été envoyée.');
    res.redirect(`/annonces/${id}`);
  } catch (err) {
    discardUploads(req);
    next(err);
  }
}

// GET /mes-annonces/:id/candidatures  (?page=)  (auto-école propriétaire)
async function forListing(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);

    const listing = await listingService.findOwnedById(req.school.id, id);
    if (!listing) return notFound(res);

    const page = parsePage(req.query.page);
    const { items, total } = await applicationService.findForOwnedListing(req.school.id, id, page);
    const { page: current, pageCount } = paginate(page, total);
    res.render('dashboard/applications', {
      title: 'Candidatures',
      applications: items,
      listing,
      pagination: {
        page: current,
        pageCount,
        prevUrl: current > 1 ? pageUrl(`/mes-annonces/${id}/candidatures`, {}, current - 1) : null,
        nextUrl: current < pageCount ? pageUrl(`/mes-annonces/${id}/candidatures`, {}, current + 1) : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Stream protégé d'une pièce d'une candidature. Scopé à l'école propriétaire.
// `pathField` est la colonne du chemin (cvPath / idCardPath / licensePath / teachingCardPath).
function streamPiece(pathField, prefix) {
  return async (req, res, next) => {
    try {
      const appId = parseId(req.params.appId);
      if (!appId) return notFound(res);
      const application = await applicationService.findOwnedById(req.school.id, appId);
      if (!application) return notFound(res);

      const rel = application[pathField];
      if (!rel) return notFound(res);
      const abs = resolveStored(rel);
      if (!abs || !fs.existsSync(abs)) return notFound(res);

      const ext = rel.slice(rel.lastIndexOf('.'));
      return res.download(abs, `${prefix}-${appId}${ext}`);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  apply,
  forListing,
  downloadCv: streamPiece('cvPath', 'cv'),
  downloadIdCard: streamPiece('idCardPath', 'piece-identite'),
  downloadLicense: streamPiece('licensePath', 'permis'),
  downloadTeachingCard: streamPiece('teachingCardPath', 'carte-enseignant'),
};
