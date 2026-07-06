// Contreseing du contrat par le candidat, authentifié par son jeton de suivi (aucun
// compte). Lecture du PDF, page de signature, puis génération du PDF final (deux
// signatures + horodatages + empreinte) envoyé aux deux parties.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const applicationService = require('../services/applicationService');
const contractService = require('../services/contractService');
const signatureImage = require('../services/signatureImage');
const { buildContractPdf } = require('../services/contractPdf');
const { sha256Hex, formatHash } = require('../utils/hash');
const mailer = require('../services/mailer');
const { STORAGE_DIR, SUBDIRS, resolveStored } = require('../config/storage');
const { notFound } = require('../utils/http');

// Candidature dont le contrat a été transmis pour signature, ou null (404 chez l'appelant).
async function loadSignable(req) {
  const application = await applicationService.findByTrackingToken(req.params.token);
  if (!application || !application.contract || !application.contract.sentToApplicantAt) return null;
  return application;
}

// GET /suivi/:token/contrat — PDF final si signé, sinon PDF proposé.
async function downloadContract(req, res, next) {
  try {
    const application = await loadSignable(req);
    if (!application) return notFound(res);
    const signed = Boolean(application.contract.signedPdfPath);
    const abs = resolveStored(signed ? application.contract.signedPdfPath : application.contract.pdfPath);
    if (!abs || !fs.existsSync(abs)) return notFound(res);
    return res.download(abs, signed ? 'contrat-signe.pdf' : 'contrat.pdf');
  } catch (err) {
    next(err);
  }
}

// GET /suivi/:token/signer — page de signature (contrat transmis, pas encore signé).
async function showSign(req, res, next) {
  try {
    const application = await loadSignable(req);
    if (!application) return notFound(res);
    if (application.contract.applicantSignedAt) {
      req.flash('success', 'Ce contrat est déjà signé.');
      return res.redirect(`/suivi/${req.params.token}`);
    }
    res.render('tracking/sign', {
      title: 'Signer le contrat',
      application,
      contract: application.contract,
      proposedHash: formatHash(application.contract.proposedPdfHash),
      errors: {},
    });
  } catch (err) {
    next(err);
  }
}

// POST /suivi/:token/signer
async function sign(req, res, next) {
  try {
    const application = await loadSignable(req);
    if (!application) return notFound(res);
    const contract = application.contract;
    if (contract.applicantSignedAt) {
      req.flash('error', 'Ce contrat est déjà signé.');
      return res.redirect(`/suivi/${req.params.token}`);
    }

    const errors = {};
    if (req.body.accept !== '1') errors.accept = 'Vous devez déclarer avoir lu et accepté le contrat.';
    const sigBuf = signatureImage.decodeSignature(req.body.signatureData);
    if (!sigBuf) errors.signatureData = 'La signature est obligatoire — dessinez-la dans le cadre.';
    if (Object.keys(errors).length > 0) {
      return res.status(400).render('tracking/sign', {
        title: 'Signer le contrat',
        application,
        contract,
        proposedHash: formatHash(contract.proposedPdfHash),
        errors,
      });
    }

    const applicantSignaturePath = await signatureImage.saveSignature(sigBuf);
    const applicantSignedAt = new Date();

    // PDF final : contrat + page de signatures complète + empreinte du PDF proposé.
    const school = application.listing.school;
    const pdf = await buildContractPdf({
      type: contract.type,
      school,
      applicant: application,
      listing: application.listing,
      terms: contract,
      signatures: {
        school: contract.schoolSignaturePath
          ? { imagePath: resolveStored(contract.schoolSignaturePath), signedAt: contract.schoolSignedAt, name: school.businessName }
          : null,
        applicant: { imagePath: resolveStored(applicantSignaturePath), signedAt: applicantSignedAt, name: application.applicantName },
        proposedHash: contract.proposedPdfHash,
      },
    });
    const filename = `${crypto.randomBytes(16).toString('hex')}.pdf`;
    const abs = path.join(STORAGE_DIR, SUBDIRS.contracts, filename);
    await fs.promises.writeFile(abs, pdf);

    await contractService.signByApplicant(contract.id, {
      applicantSignaturePath,
      applicantSignedAt,
      signedPdfPath: `${SUBDIRS.contracts}/${filename}`,
      signedPdfHash: sha256Hex(pdf),
    });

    // Best-effort : le PDF final part aux deux parties ; un échec d'email n'annule
    // pas la signature (le document reste téléchargeable des deux côtés).
    await Promise.all([
      mailer.sendSignedContract(application.applicantEmail, application.applicantName, application.listing.title, abs),
      mailer.sendSignedContract(school.email, school.businessName, application.listing.title, abs),
    ]);

    req.flash('success', 'Contrat signé. Le document final vous a été envoyé par email.');
    res.redirect(`/suivi/${req.params.token}`);
  } catch (err) {
    next(err);
  }
}

module.exports = { downloadContract, showSign, sign };
