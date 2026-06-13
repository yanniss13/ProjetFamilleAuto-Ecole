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

// TODO (flux email) : recherche par verifyTokenHash / resetTokenHash, marquage
// emailVerified, pose/effacement des jetons. À ajouter à l'implémentation.

module.exports = { findById, findByEmail, findBySiret, create, update };
