// Accès aux données de l'entité Application via Prisma.
const prisma = require('../config/prisma');

// Dépose une candidature sur une annonce.
function createForListing(listingId, data) {
  return prisma.application.create({ data: { ...data, listingId } });
}

// Candidatures d'une annonce, en garantissant que l'annonce appartient à l'école.
function findForOwnedListing(schoolId, listingId) {
  return prisma.application.findMany({
    where: { listingId, listing: { schoolId } },
    orderBy: { createdAt: 'desc' },
  });
}

// Total des candidatures reçues par une école (toutes annonces confondues).
function countBySchool(schoolId) {
  return prisma.application.count({ where: { listing: { schoolId } } });
}

module.exports = { createForListing, findForOwnedListing, countBySchool };
