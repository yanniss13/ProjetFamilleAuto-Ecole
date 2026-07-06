/**
 * Tests du Lot J — purge RGPD automatique.
 * Spec : docs/superpowers/specs/2026-07-07-lot-j-purge-rgpd-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotj-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const passwordUtil = require('../src/utils/password');
const { STORAGE_DIR } = require('../src/config/storage');

const PORT = 4066;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
function daysAgo(n) { return new Date(Date.now() - n * 24 * 60 * 60 * 1000); }
function makeJar() { return { cookie: '' }; }
function storeCookies(jar, res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of sc) jar.cookie = c.split(';')[0];
}
async function req(jar, method, urlPath, { body, headers = {} } = {}) {
  const res = await fetch(BASE + urlPath, {
    method, redirect: 'manual',
    headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...headers }, body,
  });
  storeCookies(jar, res);
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), text };
}
function csrfFrom(html) {
  const m = html.match(/name="csrf-token" content="([^"]+)"/);
  if (!m) throw new Error('Jeton CSRF introuvable.');
  return m[1];
}
function form(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) p.append(k, v);
  return { body: p.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } };
}

const createdSchoolIds = [];
const createdAdminIds = [];
const createdPurgeRunIds = [];

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

    // --- 1. rejectedAt + modeles ---
    const schoolJ = await prisma.school.create({
      data: {
        email: `j.ecole.${STAMP}@example.test`, passwordHash: 'x',
        businessName: `Ecole Lot J ${STAMP}`, siret: `9${String(STAMP).slice(-13).padStart(13, '0')}`,
      },
    });
    createdSchoolIds.push(schoolJ.id);
    const listJ = await prisma.listing.create({
      data: {
        title: `Lot J annonce ${STAMP}`, description: 'd', city: 'Nantes', department: '44',
        schoolId: schoolJ.id, titleLower: `lot j annonce ${STAMP}`, descriptionLower: 'd', cityLower: 'nantes',
      },
    });

    const appService = require('../src/services/applicationService');
    const aPend = await prisma.application.create({
      data: { applicantName: 'M', applicantEmail: `j.cand.${STAMP}@example.test`, message: 'm', listingId: listJ.id },
    });
    await appService.updateStatus(aPend.id, 'rejected');
    let row = await prisma.application.findUnique({ where: { id: aPend.id } });
    ok(row.status === 'rejected' && row.rejectedAt instanceof Date, 'updateStatus : refus -> rejectedAt pose');
    await appService.updateStatus(aPend.id, 'accepted');
    row = await prisma.application.findUnique({ where: { id: aPend.id } });
    ok(row.status === 'accepted' && row.rejectedAt === null, 'updateStatus : autre statut -> rejectedAt efface');

    const run0 = await prisma.purgeRun.create({ data: { unconfirmedAlerts: 0, rejectedApplications: 0, expiredTokens: 0 } });
    createdPurgeRunIds.push(run0.id);
    ok(run0.ranAt instanceof Date, 'schema : PurgeRun avec date automatique');

    console.log(`\n✅ Lot J tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (prisma.alert) await prisma.alert.deleteMany({ where: { email: { contains: String(STAMP) } } });
    if (prisma.purgeRun && createdPurgeRunIds.length) await prisma.purgeRun.deleteMany({ where: { id: { in: createdPurgeRunIds } } });
    // Les suppressions d'ecoles cascadent (annonces -> candidatures -> contrats).
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    if (createdAdminIds.length) await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
