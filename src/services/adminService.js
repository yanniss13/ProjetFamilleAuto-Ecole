// Accès aux données de l'entité Admin via Prisma.
const prisma = require('../config/prisma');

function findById(id) {
  return prisma.admin.findUnique({ where: { id } });
}
function findByEmail(email) {
  return prisma.admin.findUnique({ where: { email } });
}
function create(data) {
  return prisma.admin.create({ data });
}

module.exports = { findById, findByEmail, create };
