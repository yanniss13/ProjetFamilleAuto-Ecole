/**
 * Tests du Lot E - carte des annonces & recherche par rayon.
 * Spec : docs/superpowers/specs/2026-07-06-lot-e-carte-annonces-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lote-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';

const { haversineKm, bboxAround } = require('../src/utils/geo');
const prisma = require('../src/config/prisma');
const listingService = require('../src/services/listingService');

const STAMP = Date.now();
const createdSchoolIds = [];
const KW = `lote${STAMP}`;

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

// Une ecole + une annonce portant le mot-cle du lot (isolation des donnees de test).
async function seedSchool(name, siretPrefix, latitude, longitude) {
  const school = await prisma.school.create({
    data: {
      email: `${name.toLowerCase().replace(/\s/g, '')}.${STAMP}@example.test`, passwordHash: 'x',
      businessName: name, siret: `${siretPrefix}${String(STAMP).slice(-13).padStart(13, '0')}`,
      emailVerified: true, latitude, longitude,
    },
  });
  createdSchoolIds.push(school.id);
  return school;
}
async function seedListing(school, title) {
  return prisma.listing.create({
    data: {
      title, description: 'desc', city: 'Ville', department: '13', schoolId: school.id,
      titleLower: title.toLowerCase(), descriptionLower: 'desc', cityLower: 'ville',
    },
  });
}

async function main() {
  try {
  // --- 1. utils/geo ---
  const dMA = haversineKm(43.2965, 5.3698, 43.5297, 5.4474); // Marseille -> Aix
  ok(dMA > 22 && dMA < 30, 'geo : Marseille-Aix environ 26 km');
  ok(haversineKm(43.3, 5.37, 43.3, 5.37) === 0, 'geo : distance nulle a soi-meme');

  const box = bboxAround(43.3, 5.37, 50);
  ok(box.minLat < 43.3 - 0.4 && box.maxLat > 43.3 + 0.4, 'geo : point a ~44 km contenu dans la boite de 50 km');
  ok(box.maxLat < 43.3 + 0.6, 'geo : point a ~67 km hors de la boite de 50 km');
  ok(box.minLng < 5.37 && box.maxLng > 5.37, 'geo : la boite encadre la longitude du centre');

  // --- 2. cache de geocodage ---
  {
    const geocoder = require('../src/services/geocoder');
    const origFetch = global.fetch;
    const origDisabled = process.env.GEOCODING_DISABLED;
    const origNow = Date.now;
    let calls = 0;
    try {
      process.env.GEOCODING_DISABLED = '0';
      global.fetch = async () => { calls += 1; return { ok: true, json: async () => [{ lat: '43.3', lon: '5.37' }] }; };

      const c1 = await geocoder.geocodeCached(`Marseille-${STAMP}`);
      const c2 = await geocoder.geocodeCached(`  MARSEILLE-${STAMP} `);
      ok(c1 && c1.lat === 43.3 && calls === 1, 'cache : 1er appel geocode via le reseau');
      ok(c2 && c2.lat === 43.3 && calls === 1, 'cache : 2e appel (casse/espaces) servi par le cache');

      Date.now = () => origNow() + 25 * 60 * 60 * 1000; // +25 h : entree expiree
      await geocoder.geocodeCached(`Marseille-${STAMP}`);
      ok(calls === 2, 'cache : entree expiree re-geocodee');
      Date.now = origNow;

      global.fetch = async () => { calls += 1; return { ok: false }; };
      ok((await geocoder.geocodeCached(`Nulleville-${STAMP}`)) === null, 'cache : ville introuvable -> null');
      await geocoder.geocodeCached(`Nulleville-${STAMP}`);
      ok(calls === 3, 'cache : un echec est aussi mis en cache (pas de 2e appel reseau)');
    } finally {
      global.fetch = origFetch;
      process.env.GEOCODING_DISABLED = origDisabled;
      Date.now = origNow;
    }
  }

    // --- 3. listingService : rayon + donnees carte ---
    const MRS = { lat: 43.2965, lng: 5.3698 }; // Marseille
    const schoolNear = await seedSchool('LotE Near', '2', 43.2965, 5.3698); // Marseille
    const schoolFar = await seedSchool('LotE Far', '3', 50.6329, 3.0573); // Lille (~834 km)
    const schoolNoGeo = await seedSchool('LotE NoGeo', '4', null, null);
    const lNear1 = await seedListing(schoolNear, `${KW} proche un`);
    const lNear2 = await seedListing(schoolNear, `${KW} proche deux`);
    const lFar = await seedListing(schoolFar, `${KW} lointaine`);
    await seedListing(schoolNoGeo, `${KW} sans geo`);

    let res = await listingService.findPublic({ q: KW, center: MRS, radiusKm: 50 });
    ok(res.total === 2 && res.items.every((l) => l.schoolId === schoolNear.id),
      'service : rayon 50 km garde Marseille, exclut Lille et la non-localisee');
    ok(res.items[0].distanceKm === 1, 'service : distanceKm entier avec plancher 1 km');

    res = await listingService.findPublic({ q: KW, center: MRS, radiusKm: 1000 });
    ok(res.total === 3, 'service : rayon 1000 km inclut Lille (pas la non-localisee)');
    const far = res.items.find((l) => l.id === lFar.id);
    ok(res.items[res.items.length - 1].id === lFar.id && far.distanceKm > 700 && far.distanceKm < 1000,
      'service : tri par distance croissante, Lille en dernier (~834 km)');

    res = await listingService.findPublic({ q: KW });
    ok(res.total === 4 && res.items.every((l) => l.distanceKm === undefined),
      'service : sans rayon, comportement inchange (4 annonces, pas de distanceKm)');

    let m = await listingService.findPublicForMap({ q: KW });
    ok(m.schools.length === 2, 'service : carte = 2 ecoles geolocalisees');
    const near = m.schools.find((s) => s.schoolName === 'LotE Near');
    ok(near && near.listings.length === 2 && near.listings.some((l) => l.id === lNear1.id) && near.listings.some((l) => l.id === lNear2.id),
      'service : annonces groupees par ecole');
    ok(m.unlocatedCount === 1, 'service : 1 annonce sans localisation comptee');

    m = await listingService.findPublicForMap({ q: KW, center: MRS, radiusKm: 50 });
    ok(m.schools.length === 1 && m.schools[0].schoolName === 'LotE Near', 'service : carte filtree par rayon');

  console.log(`\n✅ Lot E tests reussis - ${passed} assertions.`);
  } finally {
    if (createdSchoolIds.length) {
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
