// Workflow d'acceptation/refus d'une candidature et génération du contrat (PDF).
// Toutes les actions sont scopées à l'école propriétaire (isolation via applicationService).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const applicationService = require('../services/applicationService');
const contractService = require('../services/contractService');
const { validateContract } = require('../validators/contractValidator');
const { buildContractPdf } = require('../services/contractPdf');
const mailer = require('../services/mailer');
const { STORAGE_DIR, SUBDIRS, resolveStored } = require('../config/storage');
const { parseId, notFound } = require('../utils/http');

// Charge la candidature possédée par l'école courante, ou répond 404.
async function loadOwnedApplication(req, res) {
  const appId = parseId(req.params.appId);
  if (!appId) {
    notFound(res);
    return null;
  }
  const application = await applicationService.findOwnedById(req.school.id, appId);
  if (!application) {
    notFound(res);
    return null;
  }
  return application;
}

function candidaturesUrl(application) {
  return `/mes-annonces/${application.listingId}/candidatures`;
}

// POST .../:appId/refuser
async function reject(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;

    // Si un contrat avait été généré (candidature acceptée puis refusée), on le supprime
    // avec son PDF — sinon il resterait téléchargeable/expédiable pour un candidat refusé.
    if (application.contract) {
      const abs = resolveStored(application.contract.pdfPath);
      if (abs) fs.unlink(abs, () => {});
      await contractService.deleteForApplication(application.id);
    }

    await applicationService.updateStatus(application.id, 'rejected');
    // Best-effort : informe le candidat du refus (lien de suivi rappelé).
    await mailer.sendApplicationRejected(application.applicantEmail, application.applicantName, application.listing.title, application.trackingToken);
    req.flash('success', 'Candidature refusée.');
    res.redirect(candidaturesUrl(application));
  } catch (err) {
    next(err);
  }
}

// Valeurs pré-remplies du mini-formulaire (contrat existant sinon annonce + dernier contrat).
async function buildPrefill(schoolId, application) {
  const { listing, contract } = application;
  if (contract) {
    const toInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    return {
      type: contract.type,
      startDate: toInput(contract.startDate),
      endDate: toInput(contract.endDate),
      motif: contract.motif || '',
      grossSalary: contract.grossSalary,
      weeklyHours: contract.weeklyHours || '',
      trialPeriodWeeks: contract.trialPeriodWeeks || '',
      workplace: contract.workplace,
      providerSiret: contract.providerSiret || '',
      schoolAddress: contract.schoolAddress || '',
      applicantAddress: contract.applicantAddress || '',
      extraClauses: contract.extraClauses || '',
      birthDate: toInput(contract.birthDate),
      birthPlace: contract.birthPlace || '',
      nationality: contract.nationality || '',
      teachingAuthNumber: contract.teachingAuthNumber || '',
      teachingAuthValidUntil: toInput(contract.teachingAuthValidUntil),
      licenseNumber: contract.licenseNumber || '',
      licenseCategories: contract.licenseCategories || '',
    };
  }
  const last = await contractService.findLatestBySchool(schoolId);
  return {
    type: listing.contractType || 'generic',
    startDate: '',
    endDate: '',
    motif: '',
    grossSalary: listing.compensation || '',
    weeklyHours: listing.hoursPerWeek || '',
    trialPeriodWeeks: '',
    workplace: listing.city || '',
    providerSiret: '',
    schoolAddress: last ? last.schoolAddress || '' : '',
    applicantAddress: '',
    extraClauses: '',
    birthDate: '',
    birthPlace: '',
    nationality: '',
    teachingAuthNumber: '',
    teachingAuthValidUntil: '',
    licenseNumber: '',
    licenseCategories: '',
  };
}

// GET .../:appId/accepter  (mini-formulaire — sert aussi à ré-éditer)
async function acceptForm(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;
    const values = await buildPrefill(req.school.id, application);
    res.render('dashboard/contract_form', {
      title: 'Établir le contrat',
      application,
      listing: application.listing,
      errors: {},
      values,
    });
  } catch (err) {
    next(err);
  }
}

// POST .../:appId/accepter  (valide les termes -> génère le PDF -> statut accepté)
async function accept(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;

    const { isValid, errors, value } = validateContract(req.body);
    if (!isValid) {
      return res.status(400).render('dashboard/contract_form', {
        title: 'Établir le contrat',
        application,
        listing: application.listing,
        errors,
        values: req.body,
      });
    }

    // Génère le PDF puis l'écrit dans le stockage privé.
    const pdf = await buildContractPdf({
      type: value.type,
      school: application.listing.school,
      applicant: application,
      listing: application.listing,
      terms: value,
    });
    const filename = `${crypto.randomBytes(16).toString('hex')}.pdf`;
    const relPath = `${SUBDIRS.contracts}/${filename}`;
    fs.writeFileSync(path.join(STORAGE_DIR, SUBDIRS.contracts, filename), pdf);

    // Supprime l'ancien PDF en cas de ré-édition.
    if (application.contract && application.contract.pdfPath && application.contract.pdfPath !== relPath) {
      const old = resolveStored(application.contract.pdfPath);
      if (old) fs.unlink(old, () => {});
    }

    await contractService.upsertForApplication(application.id, { ...value, pdfPath: relPath });
    await applicationService.updateStatus(application.id, 'accepted');
    // Best-effort : informe le candidat de l'acceptation (lien de suivi rappelé).
    await mailer.sendApplicationAccepted(application.applicantEmail, application.applicantName, application.listing.title, application.trackingToken);

    req.flash('success', 'Candidature acceptée et contrat généré.');
    res.redirect(candidaturesUrl(application));
  } catch (err) {
    next(err);
  }
}

// GET .../:appId/contrat/telecharger  (PDF, école)
async function downloadContract(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;
    if (!application.contract) return notFound(res);
    const abs = resolveStored(application.contract.pdfPath);
    if (!abs || !fs.existsSync(abs)) return notFound(res);
    return res.download(abs, `contrat-${application.id}.pdf`);
  } catch (err) {
    next(err);
  }
}

// POST .../:appId/contrat/envoyer  (email du PDF au candidat)
async function sendContract(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;
    if (!application.contract) return notFound(res);
    const abs = resolveStored(application.contract.pdfPath);
    if (!abs || !fs.existsSync(abs)) return notFound(res);

    const ok = await mailer.sendContractToApplicant(
      application.applicantEmail,
      application.applicantName,
      application.listing.title,
      abs
    );

    if (ok) {
      await contractService.markSent(application.contract.id);
      req.flash('success', 'Contrat envoyé au candidat.');
    } else {
      req.flash('error', "L'envoi du contrat au candidat a échoué. Réessayez plus tard.");
    }
    res.redirect(candidaturesUrl(application));
  } catch (err) {
    next(err);
  }
}

module.exports = { reject, acceptForm, accept, downloadContract, sendContract };
