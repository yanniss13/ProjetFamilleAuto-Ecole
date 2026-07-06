// Accès aux données de l'entité Application via Prisma.
const prisma = require('../config/prisma');
const { paginate } = require('../utils/pagination');

// Dépose une candidature sur une annonce.
function createForListing(listingId, data) {
  return prisma.application.create({ data: { ...data, listingId } });
}

// Candidatures d'une annonce, en garantissant que l'annonce appartient à l'école.
async function findForOwnedListing(schoolId, listingId, page = 1) {
  const where = { listingId, listing: { schoolId } };
  const total = await prisma.application.count({ where });
  const { skip, take } = paginate(page, total);
  const items = await prisma.application.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { contract: true },
    skip,
    take,
  });
  return { items, total };
}

// Une candidature précise, scopée à l'école propriétaire (isolation). Inclut l'annonce
// (+ son école) et le contrat éventuel pour les contrôleurs de gestion/contrat.
function findOwnedById(schoolId, applicationId) {
  return prisma.application.findFirst({
    where: { id: applicationId, listing: { schoolId } },
    include: { listing: { include: { school: true } }, contract: true },
  });
}

function updateStatus(applicationId, status) {
  return prisma.application.update({ where: { id: applicationId }, data: { status } });
}

// Candidature retrouvée par son jeton de suivi public (page /suivi). Inclut annonce + école
// (pour l'affichage) et le contrat (pour savoir s'il a été envoyé).
function findByTrackingToken(token) {
  return prisma.application.findUnique({
    where: { trackingToken: token },
    include: { listing: { include: { school: true } }, contract: true },
  });
}

// Total des candidatures, toutes écoles confondues (dashboard admin).
function countAllGlobal() {
  return prisma.application.count();
}

module.exports = {
  createForListing,
  findForOwnedListing,
  findOwnedById,
  updateStatus,
  findByTrackingToken,
  countAllGlobal,
};
