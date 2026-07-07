// Accès aux données de l'entité Listing via Prisma.
// Les méthodes de gestion sont scopées par schoolId (isolation entre auto-écoles).
const prisma = require('../config/prisma');
const { paginate } = require('../utils/pagination');
const { haversineKm, bboxAround } = require('../utils/geo');

// Ajoute les copies minuscules des champs recherchables présents dans `data`.
// Recherche INSENSIBLE À LA CASSE uniquement (pas insensible aux accents) : on replie
// la casse via JS `toLowerCase()` (Unicode), tandis que le backfill de la migration
// utilise le `lower()` SQL (ASCII-only sous SQLite, dépendant de la locale sous
// PostgreSQL). Conséquence : un libellé accentué (« Nîmes ») rétro-rempli sous SQLite
// peut ne pas matcher un terme replié côté JS. Les lignes créées/éditées ensuite
// passent par ce helper et sont cohérentes. À traiter (normalisation des accents) si
// une vraie recherche tolérante aux accents devient nécessaire.
function withLower(data) {
  const out = { ...data };
  if (typeof data.title === 'string') out.titleLower = data.title.toLowerCase();
  if (typeof data.description === 'string') out.descriptionLower = data.description.toLowerCase();
  if (typeof data.city === 'string') out.cityLower = data.city.toLowerCase();
  return out;
}

// --- Public ---

// Annonces ouvertes, filtrables par département, recherche texte et rayon autour d'un
// point, paginées. Recherche insensible à la casse via les colonnes `*Lower`.
// Rayon : pré-filtre SQL par boîte englobante (portable SQLite/PostgreSQL), affinage
// haversine en JS, tri par distance croissante, pagination en mémoire (volume borné
// par la boîte). Chaque item reçoit alors `distanceKm` (entier, plancher 1 km).
async function findPublic({ department, q, page = 1, center = null, radiusKm = null } = {}) {
  const where = { status: 'open', school: { suspended: false } };
  if (department) where.department = department;
  if (q) {
    const term = q.toLowerCase();
    where.OR = [
      { titleLower: { contains: term } },
      { descriptionLower: { contains: term } },
      { cityLower: { contains: term } },
    ];
  }

  if (center && radiusKm) {
    const box = bboxAround(center.lat, center.lng, radiusKm);
    where.school = {
      ...where.school,
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
    };
    const rows = await prisma.listing.findMany({ where, include: { school: true } });
    const items = rows
      .map((l) => ({ l, d: haversineKm(center.lat, center.lng, l.school.latitude, l.school.longitude) }))
      .filter(({ d }) => d <= radiusKm)
      .sort((a, b) => a.d - b.d || b.l.createdAt - a.l.createdAt)
      .map(({ l, d }) => ({ ...l, distanceKm: Math.max(1, Math.round(d)) }));
    const total = items.length;
    const { skip, take } = paginate(page, total);
    return { items: items.slice(skip, skip + take), total };
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
    where: { id, status: 'open', school: { suspended: false } },
    include: { school: true },
  });
}

// Incrément du compteur de vues (Lot H). Fire-and-forget : l'appelant n'attend pas,
// et toute erreur est avalée — un compteur ne doit jamais casser l'affichage public.
function incrementViews(id) {
  return prisma.listing.updateMany({ where: { id }, data: { viewsCount: { increment: 1 } } }).catch(() => {});
}

// Données de la vue carte : annonces ouvertes filtrées, SANS pagination, groupées par
// école géolocalisée (un marqueur par école). Renvoie aussi le nombre d'annonces dont
// l'école n'a pas de coordonnées (mention « sans localisation » dans la vue).
async function findPublicForMap({ department, q, center = null, radiusKm = null } = {}) {
  const where = { status: 'open', school: { suspended: false } };
  if (department) where.department = department;
  if (q) {
    const term = q.toLowerCase();
    where.OR = [
      { titleLower: { contains: term } },
      { descriptionLower: { contains: term } },
      { cityLower: { contains: term } },
    ];
  }
  const rows = await prisma.listing.findMany({ where, orderBy: { createdAt: 'desc' }, include: { school: true } });

  const located = rows.filter((l) => l.school.latitude != null && l.school.longitude != null);
  const kept = center && radiusKm
    ? located.filter((l) => haversineKm(center.lat, center.lng, l.school.latitude, l.school.longitude) <= radiusKm)
    : located;

  const bySchool = new Map();
  for (const l of kept) {
    let group = bySchool.get(l.schoolId);
    if (!group) {
      group = { schoolName: l.school.businessName, latitude: l.school.latitude, longitude: l.school.longitude, listings: [] };
      bySchool.set(l.schoolId, group);
    }
    group.listings.push({ id: l.id, title: l.title, city: l.city });
  }
  return { schools: [...bySchool.values()], unlocatedCount: rows.length - located.length };
}

// --- Gestion (scopée par école) ---

async function findAllBySchool(schoolId, page = 1) {
  const where = { schoolId };
  const total = await prisma.listing.count({ where });
  const { skip, take } = paginate(page, total);
  const items = await prisma.listing.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take });
  return { items, total };
}
function findOwnedById(schoolId, id) {
  return prisma.listing.findFirst({ where: { id, schoolId } });
}
function createForSchool(schoolId, data) {
  return prisma.listing.create({ data: { ...withLower(data), schoolId } });
}
function updateOwned(schoolId, id, data) {
  return prisma.listing.updateMany({ where: { id, schoolId }, data: withLower(data) });
}
function deleteOwned(schoolId, id) {
  return prisma.listing.deleteMany({ where: { id, schoolId } });
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
    if (a.contract) paths.push(a.contract.pdfPath, a.contract.schoolSignaturePath, a.contract.applicantSignaturePath, a.contract.signedPdfPath);
  }
  return paths.filter(Boolean);
}

// --- Admin (non scopé par école) ---

// Mêmes champs de fichiers que findFilePathsForListing, mais SANS filtre schoolId.
async function findAnyFilePathsForListing(id) {
  const apps = await prisma.application.findMany({ where: { listingId: id }, include: { contract: true } });
  const paths = [];
  for (const a of apps) {
    paths.push(a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath);
    if (a.contract) paths.push(a.contract.pdfPath, a.contract.schoolSignaturePath, a.contract.applicantSignaturePath, a.contract.signedPdfPath);
  }
  return paths.filter(Boolean);
}
function deleteAny(id) {
  return prisma.listing.delete({ where: { id } });
}
function findAllWithSchool({ skip, take } = {}) {
  return prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    include: { school: true, _count: { select: { applications: true } } },
    skip,
    take,
  });
}
function countAll() {
  return prisma.listing.count();
}

module.exports = { findPublic, findPublicById, incrementViews, findPublicForMap, findAllBySchool, findOwnedById, createForSchool, updateOwned, deleteOwned, findFilePathsForListing, findAnyFilePathsForListing, deleteAny, findAllWithSchool, countAll };
