// Instance unique du client Prisma, partagée dans toute l'application
// (évite d'ouvrir plusieurs connexions à la base).
// Prisma 7 : le client généré (src/generated/prisma, non versionné) reçoit la
// connexion via un adaptateur de driver ; il ne lit plus ni le schéma ni le
// .env lui-même — on charge donc dotenv ici, pour que tous les points
// d'entrée (serveur, scripts, tests) aient DATABASE_URL sans y penser.
require('dotenv').config({ quiet: true });
const path = require('path');
const { PrismaClient } = require('../generated/prisma/client.ts');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

// DATABASE_URL est relative à la racine du dépôt (convention partagée avec
// prisma.config.ts) ; le driver, lui, résout depuis le cwd — on absolutise
// pour que scripts et tests fonctionnent quel que soit leur dossier de lancement.
let url = process.env.DATABASE_URL || '';
if (url.startsWith('file:') && !path.isAbsolute(url.slice(5))) {
  url = `file:${path.resolve(__dirname, '..', '..', url.slice(5))}`;
}

const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
