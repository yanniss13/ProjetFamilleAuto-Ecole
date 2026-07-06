// Purge RGPD (Lot J) : supprime les données personnelles qui n'ont plus de raison
// d'être conservées. Trois catégories, chacune bornée par un délai :
//  - alertes email jamais confirmées ;
//  - candidatures refusées (lignes ET fichiers téléversés) ;
//  - jetons de vérification/réinitialisation expirés (mis à null, comptes intacts).
// Les candidatures acceptées et les contrats ne sont JAMAIS purgés (valeur légale).
const prisma = require('../config/prisma');
const { deleteStored } = require('../config/storage');

const DAY_MS = 24 * 60 * 60 * 1000;

// Délais lus à l'exécution (surchargables par variable d'environnement).
function alertDays() {
  const n = parseInt(process.env.PURGE_ALERTES_JOURS, 10);
  return Number.isInteger(n) && n > 0 ? n : 7;
}
function rejectedDays() {
  const n = parseInt(process.env.PURGE_CANDIDATURES_REFUSEES_JOURS, 10);
  return Number.isInteger(n) && n > 0 ? n : 180;
}

// Exécute une purge complète et la journalise dans PurgeRun. Peut lever :
// l'appelant (CLI, route admin, boucle planifiée) décide quoi faire de l'erreur.
async function runPurge() {
  const now = Date.now();

  // 1. Alertes jamais confirmées.
  const alertCutoff = new Date(now - alertDays() * DAY_MS);
  const { count: unconfirmedAlerts } = await prisma.alert.deleteMany({
    where: { confirmedAt: null, createdAt: { lt: alertCutoff } },
  });

  // 2. Candidatures refusées : fichiers d'abord (leurs chemins disparaissent avec
  // les lignes), puis suppression en base. rejectedAt null = refus antérieur au
  // Lot J, repli sur createdAt.
  const rejectedCutoff = new Date(now - rejectedDays() * DAY_MS);
  const rejected = await prisma.application.findMany({
    where: {
      status: 'rejected',
      OR: [
        { rejectedAt: { lt: rejectedCutoff } },
        { rejectedAt: null, createdAt: { lt: rejectedCutoff } },
      ],
    },
    include: { contract: true }, // par sécurité — un refus nettoie déjà son contrat
  });
  for (const a of rejected) {
    for (const rel of [a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath]) deleteStored(rel);
    if (a.contract) {
      for (const rel of [a.contract.pdfPath, a.contract.schoolSignaturePath, a.contract.applicantSignaturePath, a.contract.signedPdfPath]) {
        deleteStored(rel);
      }
    }
  }
  const { count: rejectedApplications } = await prisma.application.deleteMany({
    where: { id: { in: rejected.map((a) => a.id) } },
  });

  // 3. Jetons expirés : minimisation — on nettoie les jetons, jamais les comptes.
  const nowDate = new Date(now);
  const { count: expiredVerify } = await prisma.school.updateMany({
    where: { verifyTokenExpiry: { lt: nowDate } },
    data: { verifyTokenHash: null, verifyTokenExpiry: null },
  });
  const { count: expiredReset } = await prisma.school.updateMany({
    where: { resetTokenExpiry: { lt: nowDate } },
    data: { resetTokenHash: null, resetTokenExpiry: null },
  });
  const expiredTokens = expiredVerify + expiredReset;

  const counts = { unconfirmedAlerts, rejectedApplications, expiredTokens };
  await prisma.purgeRun.create({ data: counts });
  return counts;
}

// Dernière purge (affichée sur le dashboard admin).
function findLatestRun() {
  return prisma.purgeRun.findFirst({ orderBy: { id: 'desc' } });
}

module.exports = { runPurge, findLatestRun };
