// Statistiques des tableaux de bord (Lot H) : agrégats et séries hebdomadaires.
// Le bucketing par semaine se fait en JS (portable SQLite/PostgreSQL — pas de
// fonctions de date SQL), et toutes les requêtes de séries sont bornées à 84 jours.
const prisma = require('../config/prisma');

const WEEKS = 12; // fenêtre des séries hebdomadaires
const SERIES_DAYS = WEEKS * 7; // 84 jours — borne toutes les requêtes de séries

// Lundi 00:00 (heure locale) de la semaine contenant `d`.
function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // getDay() : 0 = dimanche
  return x;
}

// Regroupe des dates par semaine (lundi comme début). Renvoie exactement `weeks`
// entrées ordonnées de la plus ancienne à la semaine courante, semaines vides à 0,
// label = lundi de la semaine au format JJ/MM. Dates hors fenêtre : ignorées.
function weeklyBuckets(dates, weeks) {
  const currentMonday = mondayOf(new Date());
  const buckets = [];
  const indexByMonday = new Map();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const monday = new Date(currentMonday);
    monday.setDate(monday.getDate() - i * 7);
    const label = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`;
    indexByMonday.set(monday.getTime(), buckets.length);
    buckets.push({ label, count: 0 });
  }
  for (const date of dates) {
    const idx = indexByMonday.get(mondayOf(date).getTime());
    if (idx !== undefined) buckets[idx].count += 1;
  }
  return buckets;
}

// Pourcentage entier arrondi, 0 si le total est nul (jamais NaN — compte tout neuf).
function rate(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

// Statistiques du tableau de bord d'une école : tuiles, série hebdo des candidatures,
// entonnoir de recrutement et top annonces. Toutes les requêtes sont scopées schoolId.
async function forSchool(schoolId) {
  const since = new Date(Date.now() - SERIES_DAYS * 24 * 60 * 60 * 1000);
  const [openListings, viewsAgg, applications, accepted, signedContracts, recentApplications, listings] = await Promise.all([
    prisma.listing.count({ where: { schoolId, status: 'open' } }),
    prisma.listing.aggregate({ where: { schoolId }, _sum: { viewsCount: true } }),
    prisma.application.count({ where: { listing: { schoolId } } }),
    prisma.application.count({ where: { listing: { schoolId }, status: 'accepted' } }),
    prisma.contract.count({ where: { applicantSignedAt: { not: null }, application: { listing: { schoolId } } } }),
    prisma.application.findMany({ where: { listing: { schoolId }, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.listing.findMany({
      where: { schoolId },
      select: { id: true, title: true, viewsCount: true, _count: { select: { applications: true } } },
    }),
  ]);

  const totalViews = viewsAgg._sum.viewsCount || 0;
  const topListings = listings
    .map((l) => ({
      id: l.id,
      title: l.title,
      views: l.viewsCount,
      applications: l._count.applications,
      conversionRate: rate(l._count.applications, l.viewsCount),
    }))
    .sort((a, b) => b.applications - a.applications || b.views - a.views)
    .slice(0, 5);

  return {
    tiles: { openListings, totalViews, applications, acceptRate: rate(accepted, applications), signedContracts },
    weekly: weeklyBuckets(recentApplications.map((a) => a.createdAt), WEEKS),
    funnel: [
      { label: 'Vues', count: totalViews, rateFromPrevious: null },
      { label: 'Candidatures', count: applications, rateFromPrevious: rate(applications, totalViews) },
      { label: 'Acceptées', count: accepted, rateFromPrevious: rate(accepted, applications) },
      { label: 'Contrats signés', count: signedContracts, rateFromPrevious: rate(signedContracts, accepted) },
    ],
    topListings,
  };
}

// Statistiques plateforme (dashboard admin) : totaux globaux + inscriptions d'écoles
// et candidatures par semaine.
async function forPlatform() {
  const since = new Date(Date.now() - SERIES_DAYS * 24 * 60 * 60 * 1000);
  const [schools, listings, applications, signedContracts, recentSchools, recentApplications] = await Promise.all([
    prisma.school.count(),
    prisma.listing.count(),
    prisma.application.count(),
    prisma.contract.count({ where: { applicantSignedAt: { not: null } } }),
    prisma.school.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.application.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  return {
    tiles: { schools, listings, applications, signedContracts },
    schoolsWeekly: weeklyBuckets(recentSchools.map((s) => s.createdAt), WEEKS),
    applicationsWeekly: weeklyBuckets(recentApplications.map((a) => a.createdAt), WEEKS),
  };
}

module.exports = { weeklyBuckets, rate, forSchool, forPlatform };
