/**
 * Tests du Lot M — suivi des candidatures en temps réel par SSE.
 * Spec : docs/superpowers/specs/2026-07-16-lot-m-temps-reel-design.md
 */
'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'lotm-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';
process.env.ADRESSE_LOOKUP_DISABLED = '1';
process.env.REALTIME_HEARTBEAT_MS = '30';
process.env.REALTIME_MAX_CONNECTION_MS = '30000';

const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const realtimeService = require('../src/services/realtimeService');
const passwordUtil = require('../src/utils/password');
const mailer = require('../src/services/mailer');
const { resolveStored } = require('../src/config/storage');

const PORT = 4072;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
const createdSchoolIds = [];
const openSseRequests = new Set();

function ok(condition, label) {
  if (!condition) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function eventually(fn, tries = 50, delayMs = 10) {
  for (let i = 0; i < tries; i += 1) {
    if (await fn()) return true;
    await wait(delayMs);
  }
  return false;
}

async function main() {
  let server;
  try {
    realtimeService._resetForTests();
    server = app.listen(PORT);
    await new Promise((resolve) => server.once('listening', resolve));

    // --- 1. Registre mémoire isolé et best-effort ---
    const listingChannel = realtimeService.listingChannel(12);
    const applicationChannel = realtimeService.applicationChannel(34);
    ok(listingChannel === 'listing:12' && applicationChannel === 'application:34',
      'service : noms de canaux stables et distincts');

    const received = [];
    const unsubscribe = realtimeService.subscribe(listingChannel, (event) => received.push(event));
    realtimeService.subscribe(listingChannel, () => { throw new Error('abonne en panne'); });
    realtimeService.publish(listingChannel, { type: 'application-created', applicationId: 34 });
    ok(received.length === 1 && received[0].applicationId === 34,
      'service : un abonne en erreur ne bloque pas les autres');
    ok(realtimeService.subscriberCount(listingChannel) === 2,
      'service : compteur diagnostic des abonnes');

    unsubscribe();
    unsubscribe();
    realtimeService.publish(listingChannel, { type: 'application-created', applicationId: 35 });
    ok(received.length === 1, 'service : desabonnement idempotent et definitif');

    const byListing = [];
    const byApplication = [];
    const stopListing = realtimeService.subscribe(realtimeService.listingChannel(12), (e) => byListing.push(e));
    const stopApplication = realtimeService.subscribe(realtimeService.applicationChannel(34), (e) => byApplication.push(e));
    realtimeService.publishApplicationUpdate(
      { id: 34, listingId: 12 },
      realtimeService.EVENT_TYPES.APPLICATION_ACCEPTED
    );
    ok(byListing.length === 1 && byApplication.length === 1,
      'service : une transition met a jour les deux publics');
    ok(byListing[0].type === 'application-accepted' && byListing[0].applicationId === 34,
      'service : charge utile minimale sans donnee personnelle');

    stopListing();
    stopApplication();
    realtimeService._resetForTests();
    ok(realtimeService.subscriberCount(applicationChannel) === 0,
      'service : reset de test vide tous les canaux');

    console.log(`\n✅ Lot M tests reussis - ${passed} assertions.`);
  } finally {
    realtimeService._resetForTests();
    for (const request of openSseRequests) request.destroy();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (createdSchoolIds.length) {
      const storedApplications = await prisma.application.findMany({
        where: { listing: { schoolId: { in: createdSchoolIds } } },
        include: { contract: true },
      });
      for (const application of storedApplications) {
        const paths = [application.cvPath, application.idCardPath,
          application.licensePath, application.teachingCardPath];
        if (application.contract) {
          paths.push(application.contract.pdfPath, application.contract.signedPdfPath,
            application.contract.schoolSignaturePath, application.contract.applicantSignaturePath);
        }
        for (const relativePath of paths.filter(Boolean)) {
          const absolutePath = resolveStored(relativePath);
          if (absolutePath && fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
        }
      }
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
