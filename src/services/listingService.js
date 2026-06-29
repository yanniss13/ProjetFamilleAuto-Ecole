// Accès aux données de l'entité Listing via Prisma.
// Les méthodes de gestion sont scopées par schoolId (isolation entre auto-écoles).
const prisma = require('../config/prisma');
const { paginate } = require('../utils/pagination');

// --- Public ---

// Annonces ouvertes, filtrables par département et recherche texte, paginées.
// NB : sous SQLite, `contains` est sensible à la casse — à affiner à l'implémentation
// (ex. stocker/normaliser en minuscules) si besoin.
async function findPublic({ department, q, page = 1 } = {}) {
  const where = { status: 'open' };
  if (department) where.department = department;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { city: { contains: q } },
    ];
  }
  const total = await prisma.listing.count({ where });
  const { skip, take } = paginate(page, total);
  const items = await prisma.listing.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { school: true },
    skip,
    take,
  });
  return { items, total };
}

function findPublicById(id) {
  return prisma.listing.findFirst({
    where: { id, status: 'open' },
    include: { school: true },
  });
}

// --- Gestion (scopée par école) ---

function findAllBySchool(schoolId) {
  return prisma.listing.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' } });
}
function findOwnedById(schoolId, id) {
  return prisma.listing.findFirst({ where: { id, schoolId } });
}
function createForSchool(schoolId, data) {
  return prisma.listing.create({ data: { ...data, schoolId } });
}
function updateOwned(schoolId, id, data) {
  return prisma.listing.updateMany({ where: { id, schoolId }, data });
}
function deleteOwned(schoolId, id) {
  return prisma.listing.deleteMany({ where: { id, schoolId } });
}
function countBySchool(schoolId) {
  return prisma.listing.count({ where: { schoolId } });
}

// Tous les chemins de fichiers privés rattachés à une annonce possédée par l'école :
// pièces des candidatures + PDF de contrat. Sert au nettoyage disque avant suppression.
async function findFilePathsForListing(schoolId, id) {
  const apps = await prisma.application.findMany({
    where: { listingId: id, listing: { schoolId } },
    include: { contract: true },
  });
  const paths = [];
  for (const a of apps) {
    paths.push(a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath);
    if (a.contract) paths.push(a.contract.pdfPath);
  }
  return paths.filter(Boolean);
}

module.exports = { findPublic, findPublicById, findAllBySchool, findOwnedById, createForSchool, updateOwned, deleteOwned, countBySchool, findFilePathsForListing };
