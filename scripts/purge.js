// Purge RGPD à la demande. Usage : npm run purge
// Supprime les alertes jamais confirmées, les candidatures refusées anciennes
// (fichiers compris) et les jetons expirés, puis journalise dans PurgeRun
// (règles et délais : src/services/purgeService.js).
require('dotenv').config({ quiet: true });
const prisma = require('../src/config/prisma');
const purgeService = require('../src/services/purgeService');

async function runCli() {
  try {
    const c = await purgeService.runPurge();
    console.log(`Purge effectuée : ${c.unconfirmedAlerts} alerte(s) non confirmée(s), ${c.rejectedApplications} candidature(s) refusée(s), ${c.expiredTokens} jeton(s) expiré(s).`);
    await prisma.$disconnect();
  } catch (err) {
    console.error(`Échec de la purge : ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) runCli();
