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
const app = require('../src/app');
const geocoder2 = require('../src/services/geocoder');

const STAMP = Date.now();
const createdSchoolIds = [];
const KW = `lote${STAMP}`;
const PORT = 4061;
const BASE = `http://127.0.0.1:${PORT}`;

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
async function get(urlPath) {
  const res = await fetch(BASE + urlPath, { redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}
function mapDataFrom(html) {
  const m = html.match(/<script type="application\/json" id="map-data">(.*?)<\/script>/s);
  if (!m) return null;
  return JSON.parse(m[1]);
}

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

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

    // --- 4. HTTP : liste avec rayon, bascule, vue carte ---
    const origGeocodeCached = geocoder2.geocodeCached;
    try {
      // Geocodeur simule : "Marseille" connu, tout le reste introuvable. Pas de reseau.
      geocoder2.geocodeCached = async (v) => (String(v).toLowerCase().includes('marseille') ? { lat: 43.2965, lng: 5.3698 } : null);

      let r = await get(`/annonces?q=${KW}&ville=Marseille&rayon=50`);
      ok(r.status === 200 && r.text.includes(`${KW} proche un`) && !r.text.includes(`${KW} lointaine`),
        'HTTP : rayon 50 km filtre la liste (Marseille gardee, Lille exclue)');
      ok(/a \d+ km/.test(r.text) || /à \d+ km/.test(r.text), 'HTTP : badge "a X km" affiche avec rayon actif');

      r = await get(`/annonces?q=${KW}&ville=Marseille&rayon=100`);
      ok(!r.text.includes(`${KW} sans geo`), 'HTTP : annonce sans localisation exclue de la liste avec rayon');

      r = await get(`/annonces?q=${KW}&ville=Nulleville&rayon=50`);
      ok(r.text.includes('Ville introuvable') && r.text.includes(`${KW} lointaine`),
        'HTTP : ville introuvable -> message + rayon ignore (liste complete)');

      r = await get(`/annonces?q=${KW}`);
      ok(r.text.includes('vue=carte'), 'HTTP : lien de bascule vers la vue carte present');

      r = await get(`/annonces?q=${KW}&vue=carte`);
      const data = mapDataFrom(r.text);
      ok(Boolean(data), 'HTTP : bloc JSON #map-data present en vue carte');
      ok(data.schools.length === 2 && data.schools.some((s) => s.schoolName === 'LotE Near') && data.schools.some((s) => s.schoolName === 'LotE Far'),
        'HTTP : les 2 ecoles geolocalisees sont sur la carte');
      ok(data.center === null, 'HTTP : pas de centre sans recherche de ville');
      ok(r.text.includes('1 annonce(s) sans localisation'), 'HTTP : mention des annonces non localisees');
      ok(r.text.includes('id="listings-map"') && r.text.includes('/js/listings-map.js'),
        'HTTP : conteneur carte + script statique references');

      r = await get(`/annonces?q=${KW}&vue=carte&ville=Marseille&rayon=50`);
      const data50 = mapDataFrom(r.text);
      ok(data50.schools.length === 1 && data50.schools[0].schoolName === 'LotE Near',
        'HTTP : carte filtree par rayon');
      ok(data50.center && data50.center.radiusKm === 50, 'HTTP : centre + rayon transmis a la carte');

      // Departement invalide tolere (chaine libre) mais filtre applique en vue carte.
      r = await get(`/annonces?q=${KW}&vue=carte&departement=99`);
      ok(mapDataFrom(r.text).schools.length === 0, 'HTTP : filtre departement actif en vue carte');

      // Ecole suspendue : disparait de la carte.
      await prisma.school.update({ where: { id: schoolFar.id }, data: { suspended: true } });
      r = await get(`/annonces?q=${KW}&vue=carte`);
      ok(mapDataFrom(r.text).schools.every((s) => s.schoolName !== 'LotE Far'),
        'HTTP : ecole suspendue absente de la carte');
      await prisma.school.update({ where: { id: schoolFar.id }, data: { suspended: false } });
    } finally {
      geocoder2.geocodeCached = origGeocodeCached;
    }

  console.log(`\n✅ Lot E tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (createdSchoolIds.length) {
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
