/**
 * Tests ciblés du Lot A (pagination). Crée ses propres données et les nettoie.
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lota-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const listingService = require('../src/services/listingService');
const applicationService = require('../src/services/applicationService');
const { PAGE_SIZE } = require('../src/utils/pagination');

const PORT = 4056;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ÉCHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));
  const tag = `PG${STAMP}`;
  const school = await prisma.school.create({
    data: {
      email: `pg.${STAMP}@example.test`, passwordHash: 'x',
      businessName: 'Pagination', siret: `9${String(STAMP).slice(-13).padStart(13, '0')}`,
    },
  });
  try {
    for (let i = 0; i < PAGE_SIZE + 1; i++) {
      await listingService.createForSchool(school.id, {
        title: `${tag} Annonce ${i}`, description: 'Poste', city: 'Lyon', department: '69',
      });
    }

    // A2 — les colonnes normalisées *Lower sont peuplées par createForSchool (withLower).
    // Échoue sur le code pré-Task-4 (colonnes absentes / null).
    const l = await prisma.listing.findFirst({ where: { schoolId: school.id } });
    ok(
      l.titleLower === l.title.toLowerCase()
        && l.descriptionLower === l.description.toLowerCase()
        && l.cityLower === l.city.toLowerCase(),
      'A2 : colonnes *Lower peuplées à la création',
    );

    // A3 — pagination publique au niveau service
    const p1 = await listingService.findPublic({ q: tag, page: 1 });
    ok(p1.items.length === PAGE_SIZE && p1.total === PAGE_SIZE + 1, 'A3 findPublic page 1 = 20 / total 21');
    const p2 = await listingService.findPublic({ q: tag, page: 2 });
    ok(p2.items.length === 1, 'A3 findPublic page 2 = 1');

    // A3 — rendu du partial sur la page publique (route publique, sans auth)
    const res = await fetch(`${BASE}/annonces?q=${tag}&page=1`, { redirect: 'manual' });
    const html = await res.text();
    ok(/page\s*1\s*\/\s*2/.test(html), 'A3 partial affiche « page 1 / 2 »');
    ok(html.includes(`/annonces?q=${tag}&amp;page=2`), 'A3 lien « Suivant » conserve le filtre q');

    // A3 — pagination "mes annonces" (école)
    const m1 = await listingService.findAllBySchool(school.id, 1);
    ok(m1.items.length === PAGE_SIZE && m1.total === PAGE_SIZE + 1, 'A3 findAllBySchool page 1 = 20 / total 21');
    const m2 = await listingService.findAllBySchool(school.id, 2);
    ok(m2.items.length === 1, 'A3 findAllBySchool page 2 = 1');

    // A3 — pagination des candidatures d'une annonce
    const target = m1.items[0];
    for (let i = 0; i < PAGE_SIZE + 1; i++) {
      await prisma.application.create({
        data: {
          listingId: target.id, applicantName: `Cand ${i}`,
          applicantEmail: `cand${i}.${STAMP}@example.test`, message: 'Bonjour',
        },
      });
    }
    const a1 = await applicationService.findForOwnedListing(school.id, target.id, 1);
    ok(a1.items.length === PAGE_SIZE && a1.total === PAGE_SIZE + 1, 'A3 findForOwnedListing page 1 = 20 / total 21');
    const a2 = await applicationService.findForOwnedListing(school.id, target.id, 2);
    ok(a2.items.length === 1, 'A3 findForOwnedListing page 2 = 1');

    console.log(`\n✅ Lot A tests réussis — ${passed} assertions.`);
  } finally {
    await prisma.listing.deleteMany({ where: { schoolId: school.id } });
    await prisma.school.delete({ where: { id: school.id } });
    await prisma.$disconnect();
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
