// Workflow d'acceptation/refus d'une candidature et génération du contrat (PDF).
// Toutes les actions sont scopées à l'école propriétaire (isolation via applicationService).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const applicationService = require('../services/applicationService');
const contractService = require('../services/contractService');
const realtimeService = require('../services/realtimeService');
const { validateContract } = require('../validators/contractValidator');
const { buildContractPdf } = require('../services/contractPdf');
const signatureImage = require('../services/signatureImage');
const { sha256Hex } = require('../utils/hash');
const mailer = require('../services/mailer');
const { STORAGE_DIR, SUBDIRS, resolveStored, deleteStored } = require('../config/storage');
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

// Un contrat contresigné par le candidat engage les deux parties : l'école ne
// peut plus ni le ré-éditer ni refuser la candidature (ce qui le supprimerait).
// Renvoie true si la requête a été traitée (redirection avec message).
function refuseIfFullySigned(req, res, application) {
  if (!application.contract || !application.contract.applicantSignedAt) return false;
  req.flash('error', 'Ce contrat est signé par les deux parties : il ne peut plus être modifié ni annulé.');
  res.redirect(candidaturesUrl(application));
  return true;
}

// Supprime des fichiers stockés (best-effort, chemins relatifs à storage/).
function removeStored(rels) {
  for (const rel of rels) if (rel) deleteStored(rel);
}

// POST .../:appId/refuser
async function reject(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;
    if (refuseIfFullySigned(req, res, application)) return;

    // Si un contrat avait été généré (candidature acceptée puis refusée), on supprime
    // PDF et signatures — sinon ils resteraient téléchargeables pour un candidat refusé.
    if (application.contract) {
      const c = application.contract;
      for (const rel of [c.pdfPath, c.schoolSignaturePath, c.applicantSignaturePath, c.signedPdfPath]) {
        deleteStored(rel);
      }
      await contractService.deleteForApplication(application.id);
    }

    await applicationService.updateStatus(application.id, 'rejected');
    realtimeService.publishApplicationUpdate(
      application,
      realtimeService.EVENT_TYPES.APPLICATION_REJECTED
    );
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
    if (refuseIfFullySigned(req, res, application)) return;
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

// POST .../:appId/accepter  (valide les termes + signature école -> PDF proposé -> accepté)
async function accept(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;
    if (refuseIfFullySigned(req, res, application)) return;

    const { isValid, errors, value } = validateContract(req.body);
    // Signature de l'école obligatoire (dessinée dans le formulaire).
    const sigBuf = signatureImage.decodeSignature(req.body.signatureData);
    if (!sigBuf) errors.signatureData = 'La signature de l’auto-école est obligatoire — dessinez-la dans le cadre.';
    if (!isValid || !sigBuf) {
      return res.status(400).render('dashboard/contract_form', {
        title: 'Établir le contrat',
        application,
        listing: application.listing,
        errors,
        values: req.body,
      });
    }

    // Nouveaux fichiers d'abord ; les anciens ne sont supprimés qu'une fois la base
    // à jour, sinon une panne laisserait le contrat pointer vers des fichiers effacés.
    const created = [];
    try {
      const schoolSignaturePath = await signatureImage.saveSignature(sigBuf);
      created.push(schoolSignaturePath);
      const schoolSignedAt = new Date();

      // PDF « proposé » : contrat + page de signatures avec le cadre école rempli.
      const pdf = await buildContractPdf({
        type: value.type,
        school: application.listing.school,
        applicant: application,
        listing: application.listing,
        terms: value,
        signatures: {
          school: { imagePath: resolveStored(schoolSignaturePath), signedAt: schoolSignedAt, name: application.listing.school.businessName },
          applicant: null,
          proposedHash: null,
        },
      });
      const proposedPdfHash = sha256Hex(pdf);
      const filename = `${crypto.randomBytes(16).toString('hex')}.pdf`;
      const relPath = `${SUBDIRS.contracts}/${filename}`;
      await fs.promises.writeFile(path.join(STORAGE_DIR, SUBDIRS.contracts, filename), pdf);
      created.push(relPath);

      await contractService.upsertForApplication(application.id, {
        ...value,
        pdfPath: relPath,
        schoolSignaturePath,
        schoolSignedAt,
        proposedPdfHash,
        applicantSignaturePath: null,
        applicantSignedAt: null,
        signedPdfPath: null,
        signedPdfHash: null,
      });
    } catch (err) {
      removeStored(created);
      throw err;
    }

    // Ré-édition : l'ancien PDF et l'ancienne signature école sont supprimés (le
    // candidat n'avait pas encore signé : refuseIfFullySigned l'a vérifié).
    if (application.contract) {
      const old = application.contract;
      removeStored([old.pdfPath, old.schoolSignaturePath, old.applicantSignaturePath, old.signedPdfPath]);
    }

    await applicationService.updateStatus(application.id, 'accepted');
    realtimeService.publishApplicationUpdate(
      application,
      realtimeService.EVENT_TYPES.APPLICATION_ACCEPTED
    );
    // Best-effort : informe le candidat de l'acceptation (lien de suivi rappelé).
    await mailer.sendApplicationAccepted(application.applicantEmail, application.applicantName, application.listing.title, application.trackingToken);

    req.flash('success', 'Candidature acceptée et contrat signé côté école.');
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

// GET .../:appId/contrat/telecharger-signe  (PDF final signé, école)
async function downloadSignedContract(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;
    if (!application.contract || !application.contract.signedPdfPath) return notFound(res);
    const abs = resolveStored(application.contract.signedPdfPath);
    if (!abs || !fs.existsSync(abs)) return notFound(res);
    return res.download(abs, `contrat-signe-${application.id}.pdf`);
  } catch (err) {
    next(err);
  }
}

// POST .../:appId/contrat/envoyer  (invitation à signer en ligne — plus de PDF joint :
// le candidat lit et signe depuis sa page de suivi, le PDF final signé partira ensuite)
async function sendContract(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;
    if (!application.contract) return notFound(res);

    const trackingToken = await applicationService.ensureTrackingToken(
      application.id,
      application.trackingToken
    );

    const ok = await mailer.sendSignatureInvitation(
      application.applicantEmail,
      application.applicantName,
      application.listing.title,
      trackingToken
    );

    if (ok) {
      await contractService.markSent(application.contract.id);
      realtimeService.publishApplicationUpdate(
        application,
        realtimeService.EVENT_TYPES.CONTRACT_SENT
      );
      req.flash('success', 'Invitation à signer envoyée au candidat.');
    } else {
      req.flash('error', "L'envoi de l'invitation a échoué. Réessayez plus tard.");
    }
    res.redirect(candidaturesUrl(application));
  } catch (err) {
    next(err);
  }
}

module.exports = { reject, acceptForm, accept, downloadContract, downloadSignedContract, sendContract };
