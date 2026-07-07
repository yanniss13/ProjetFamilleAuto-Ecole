// Accès aux données de l'entité School via Prisma.
const prisma = require('../config/prisma');

function findById(id) {
  return prisma.school.findUnique({ where: { id } });
}
function findByEmail(email) {
  return prisma.school.findUnique({ where: { email } });
}
function findBySiret(siret) {
  return prisma.school.findUnique({ where: { siret } });
}
function create(data) {
  return prisma.school.create({ data });
}
function update(id, data) {
  return prisma.school.update({ where: { id }, data });
}

// --- Flux email (jetons hachés) ---
// Les colonnes verifyTokenHash / resetTokenHash sont @unique : findUnique suffit.
function findByVerifyTokenHash(hash) {
  return prisma.school.findUnique({ where: { verifyTokenHash: hash } });
}
function findByResetTokenHash(hash) {
  return prisma.school.findUnique({ where: { resetTokenHash: hash } });
}

// --- Admin ---
function findAllWithCounts({ skip, take } = {}) {
  return prisma.school.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { listings: true } } },
    skip,
    take,
  });
}
function countAll() {
  return prisma.school.count();
}
function setSuspended(id, value) {
  return prisma.school.update({ where: { id }, data: { suspended: value } });
}

module.exports = {
  findById,
  findByEmail,
  findBySiret,
  create,
  update,
  findByVerifyTokenHash,
  findByResetTokenHash,
  findAllWithCounts,
  countAll,
  setSuspended,
};
