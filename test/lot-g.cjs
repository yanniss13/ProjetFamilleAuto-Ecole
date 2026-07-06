/**
 * Tests du Lot G — signature électronique du contrat.
 * Spec : docs/superpowers/specs/2026-07-06-lot-g-signature-electronique-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotg-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const path = require('path');
const fs = require('fs');
const prisma = require('../src/config/prisma');
const app = require('../src/app');
const mailer = require('../src/services/mailer');
const passwordUtil = require('../src/utils/password');
const { STORAGE_DIR } = require('../src/config/storage');

const PORT = 4063;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

// Fixture : vrai PNG 1×1 (~85 octets) au format data URL, comme un export de canvas.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SIGNATURE_PNG = `data:image/png;base64,${PNG_B64}`;

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ÉCHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
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
function absStored(rel) { return path.join(STORAGE_DIR, rel); }

const createdSchoolIds = [];

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

    // Interception du mailer (même objet exports que les contrôleurs).
    const mailCalls = [];
    mailer.sendApplicationAccepted = (...a) => { mailCalls.push(['accepted', ...a]); return true; };
    mailer.sendApplicationRejected = (...a) => { mailCalls.push(['rejected', ...a]); return true; };
    mailer.sendSignatureInvitation = (...a) => { mailCalls.push(['invitation', ...a]); return true; };
    mailer.sendSignedContract = (...a) => { mailCalls.push(['signed', ...a]); return true; };

    // Données de base : école connectée + annonce + candidature acceptable.
    const school = await prisma.school.create({
      data: {
        email: `g.school.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'G École', siret: `7${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(school.id);
    const listing = await prisma.listing.create({
      data: {
        title: `LotG annonce ${STAMP}`, description: 'd', city: 'Pau', department: '64',
        schoolId: school.id, titleLower: `lotg annonce ${STAMP}`, descriptionLower: 'd', cityLower: 'pau',
      },
    });
    const application = await prisma.application.create({
      data: {
        listingId: listing.id, applicantName: 'G Candidat', applicantEmail: `g.cand.${STAMP}@example.test`,
        message: 'm', trackingToken: `g${STAMP}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.slice(0, 64),
      },
    });

    // --- 1. colonnes de signature (nulles par défaut) + sous-dossier storage ---
    const c0 = await prisma.contract.create({
      data: {
        applicationId: application.id, type: 'cdi', startDate: new Date('2026-08-01'),
        grossSalary: '2000€', workplace: 'Pau', pdfPath: 'contracts/lotg-placeholder.pdf',
      },
    });
    ok(c0.schoolSignaturePath === null && c0.schoolSignedAt === null
      && c0.applicantSignaturePath === null && c0.applicantSignedAt === null
      && c0.proposedPdfHash === null && c0.signedPdfPath === null && c0.signedPdfHash === null,
      'schema : 7 colonnes de signature nulles par défaut');
    ok(fs.existsSync(path.join(STORAGE_DIR, 'signatures')), 'storage : sous-dossier signatures créé');
    await prisma.contract.delete({ where: { id: c0.id } });

    // --- 2. hash + validation des signatures ---
    {
      const { sha256Hex, formatHash } = require('../src/utils/hash');
      const signatureImage = require('../src/services/signatureImage');

      ok(sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        'hash : sha256Hex vecteur connu');
      ok(formatHash('aabbccdd11223344').startsWith('aabbccdd 11223344'), 'hash : formatHash groupe par 8');

      const buf = signatureImage.decodeSignature(SIGNATURE_PNG);
      ok(Buffer.isBuffer(buf) && buf.length > 50, 'signature : data URL PNG valide décodée');
      ok(signatureImage.decodeSignature(`data:image/jpeg;base64,${PNG_B64}`) === null,
        'signature : préfixe non-PNG refusé');
      ok(signatureImage.decodeSignature('data:image/png;base64,@@@@') === null,
        'signature : base64 corrompu refusé');
      const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
      ok(signatureImage.decodeSignature(`data:image/png;base64,${fakeJpeg.toString('base64')}`) === null,
        'signature : contenu JPEG déguisé en PNG refusé (magic bytes)');
      const huge = Buffer.concat([buf, Buffer.alloc(201 * 1024)]);
      ok(signatureImage.decodeSignature(`data:image/png;base64,${huge.toString('base64')}`) === null,
        'signature : plus de 200 Ko refusé');

      const rel = await signatureImage.saveSignature(buf);
      ok(rel.startsWith('signatures/') && fs.existsSync(absStored(rel)), 'signature : PNG écrit dans storage/signatures/');
      fs.unlinkSync(absStored(rel));
    }

    // --- 3. page « Signatures » du PDF ---
    {
      const { buildContractPdf } = require('../src/services/contractPdf');
      const signatureImage = require('../src/services/signatureImage');
      const relSig = await signatureImage.saveSignature(signatureImage.decodeSignature(SIGNATURE_PNG));

      const fakeSchool = { businessName: 'PDF École', siret: '12345678901234', email: 'e@x.fr', phone: null };
      const fakeApplicant = { applicantName: 'PDF Candidat', applicantEmail: 'c@x.fr', applicantPhone: null };
      const fakeListing = { title: 'Annonce PDF', city: 'Pau', department: '64' };
      const terms = { startDate: new Date('2026-08-01'), grossSalary: '2000€ brut/mois', workplace: 'Pau' };

      const base = await buildContractPdf({ type: 'cdi', school: fakeSchool, applicant: fakeApplicant, listing: fakeListing, terms });
      ok(base.subarray(0, 4).toString() === '%PDF', 'pdf : sans signatures, PDF valide (compat)');

      const signed = await buildContractPdf({
        type: 'cdi', school: fakeSchool, applicant: fakeApplicant, listing: fakeListing, terms,
        signatures: {
          school: { imagePath: absStored(relSig), signedAt: new Date(), name: 'PDF École' },
          applicant: { imagePath: absStored(relSig), signedAt: new Date(), name: 'PDF Candidat' },
          proposedHash: 'a'.repeat(64),
        },
      });
      ok(signed.subarray(0, 4).toString() === '%PDF' && signed.length > base.length,
        'pdf : avec signatures, page supplémentaire générée');

      fs.unlinkSync(absStored(relSig));
    }

    console.log(`\n✅ Lot G tests réussis — ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    // Nettoyage : fichiers privés rattachés aux écoles de test, puis cascade en base.
    if (createdSchoolIds.length) {
      const apps = await prisma.application.findMany({
        where: { listing: { schoolId: { in: createdSchoolIds } } }, include: { contract: true },
      });
      for (const a of apps) {
        const rels = [a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath];
        if (a.contract) rels.push(a.contract.pdfPath, a.contract.signedPdfPath, a.contract.schoolSignaturePath, a.contract.applicantSignaturePath);
        for (const rel of rels) {
          if (rel) { try { if (fs.existsSync(absStored(rel))) fs.unlinkSync(absStored(rel)); } catch {} }
        }
      }
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
