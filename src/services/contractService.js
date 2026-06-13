// Accès aux données de l'entité Contract via Prisma.
const prisma = require('../config/prisma');

function findByApplicationId(applicationId) {
  return prisma.contract.findUnique({ where: { applicationId } });
}

// Crée ou met à jour le contrat d'une candidature (relation 1‑1). Permet la ré-édition
// des termes : on régénère le PDF et on réinitialise l'envoi au candidat.
function upsertForApplication(applicationId, data) {
  return prisma.contract.upsert({
    where: { applicationId },
    create: { ...data, applicationId },
    update: { ...data, sentToApplicantAt: null },
  });
}

function markSent(id) {
  return prisma.contract.update({ where: { id }, data: { sentToApplicantAt: new Date() } });
}

function deleteForApplication(applicationId) {
  return prisma.contract.delete({ where: { applicationId } });
}

// Dernier contrat saisi par une école : sert à pré-remplir les champs « côté école »
// (adresse) sans ressaisie. Scopé via la chaîne application -> listing -> schoolId.
function findLatestBySchool(schoolId) {
  return prisma.contract.findFirst({
    where: { application: { listing: { schoolId } } },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = { findByApplicationId, upsertForApplication, markSent, deleteForApplication, findLatestBySchool };
