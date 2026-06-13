// Instance unique du client Prisma, partagée dans toute l'application
// (évite d'ouvrir plusieurs connexions à la base).
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
