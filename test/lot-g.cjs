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

    // --- 4. signature école à l'acceptation ---
    const { sha256Hex } = require('../src/utils/hash');
    const jarE = makeJar();
    let r = await req(jarE, 'GET', '/connexion');
    r = await req(jarE, 'POST', '/connexion', form({ _csrf: csrfFrom(r.text), email: school.email, password: 'motdepasse123' }));
    ok(r.status === 302, 'école : connexion OK');
    const apBase = `/mes-annonces/${listing.id}/candidatures/${application.id}`;

    r = await req(jarE, 'GET', `${apBase}/accepter`);
    const csrfE = csrfFrom(r.text);
    ok(r.text.includes('data-signature-pad') && r.text.includes('/js/signature-pad.js')
      && r.text.includes('data-signature-import') && r.text.includes('Importer une signature'),
      'école : pad de signature présent avec import d’image');

    const termsForm = {
      _csrf: csrfE, type: 'cdi', startDate: '2026-08-01', grossSalary: '2200€ brut/mois',
      workplace: 'Pau', schoolAddress: '1 rue G', applicantAddress: '2 rue G',
    };
    r = await req(jarE, 'POST', `${apBase}/accepter`, form(termsForm)); // sans signature
    ok(r.status === 400 && /signature/i.test(r.text), 'école : acceptation sans signature refusée (400)');
    ok(!(await prisma.contract.findUnique({ where: { applicationId: application.id } })),
      'école : aucun contrat créé sans signature');

    r = await req(jarE, 'POST', `${apBase}/accepter`, form({ ...termsForm, signatureData: SIGNATURE_PNG }));
    ok(r.status === 302, 'école : acceptation avec signature OK');
    let contract = await prisma.contract.findUnique({ where: { applicationId: application.id } });
    ok(contract.schoolSignaturePath && fs.existsSync(absStored(contract.schoolSignaturePath))
      && contract.schoolSignedAt instanceof Date,
      'école : PNG de signature stocké + horodatage');
    ok(contract.proposedPdfHash === sha256Hex(fs.readFileSync(absStored(contract.pdfPath))),
      'école : empreinte du PDF proposé exacte (recalculée)');

    // Ré-édition : les champs candidat/signés (posés artificiellement) sont invalidés
    // et les fichiers correspondants supprimés.
    const fakeApplicantSig = 'signatures/lotg-fake-sig.png';
    const fakeSignedPdf = 'contracts/lotg-fake-signed.pdf';
    fs.writeFileSync(absStored(fakeApplicantSig), 'x');
    fs.writeFileSync(absStored(fakeSignedPdf), 'x');
    await prisma.contract.update({
      where: { id: contract.id },
      data: { applicantSignaturePath: fakeApplicantSig, applicantSignedAt: new Date(), signedPdfPath: fakeSignedPdf, signedPdfHash: 'h' },
    });
    r = await req(jarE, 'GET', `${apBase}/accepter`);
    r = await req(jarE, 'POST', `${apBase}/accepter`, form({ ...termsForm, _csrf: csrfFrom(r.text), signatureData: SIGNATURE_PNG }));
    ok(r.status === 302, 'école : ré-édition du contrat OK');
    contract = await prisma.contract.findUnique({ where: { applicationId: application.id } });
    ok(contract.applicantSignaturePath === null && contract.applicantSignedAt === null
      && contract.signedPdfPath === null && contract.signedPdfHash === null,
      'école : ré-édition -> signature candidat et PDF signé invalidés');
    ok(!fs.existsSync(absStored(fakeApplicantSig)) && !fs.existsSync(absStored(fakeSignedPdf)),
      'école : ré-édition -> anciens fichiers supprimés du disque');

    // --- 5. invitation à signer ---
    r = await req(jarE, 'GET', `${apBase}/accepter`);
    r = await req(jarE, 'POST', `${apBase}/contrat/envoyer`, form({ _csrf: csrfFrom(r.text) }));
    ok(r.status === 302, 'invitation : envoi -> redirection');
    const invit = mailCalls.find((c) => c[0] === 'invitation');
    ok(invit && invit[1] === application.applicantEmail && invit[4] === application.trackingToken,
      'invitation : email au candidat avec le jeton de suivi');
    contract = await prisma.contract.findUnique({ where: { applicationId: application.id } });
    ok(contract.sentToApplicantAt instanceof Date, 'invitation : date d’envoi enregistrée');
    r = await req(jarE, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(r.text.includes('Envoyer pour signature') && /en attente de signature/i.test(r.text),
      'invitation : états visibles côté école');

    // --- 6. contreseing du candidat ---
    const pub = makeJar();
    const suivi = `/suivi/${application.trackingToken}`;
    r = await req(pub, 'GET', `${suivi}/contrat`);
    ok(r.status === 200 && r.text.startsWith('%PDF'), 'candidat : lecture du PDF proposé via le jeton');
    r = await req(makeJar(), 'GET', `/suivi/${'0'.repeat(64)}/contrat`);
    ok(r.status === 404, 'candidat : mauvais jeton -> 404');

    r = await req(pub, 'GET', suivi);
    ok(r.text.includes(`${suivi}/signer`) && /signer le contrat/i.test(r.text),
      'candidat : bloc « à signer » sur la page de suivi');
    r = await req(pub, 'GET', `${suivi}/signer`);
    const csrfP = csrfFrom(r.text);
    ok(r.status === 200 && r.text.includes('data-signature-pad') && r.text.includes('data-signature-import')
      && r.text.includes('Importer une signature') && /J'ai lu et j'accepte/i.test(r.text),
      'candidat : page de signature (pad + import + case d’acceptation)');

    r = await req(pub, 'POST', `${suivi}/signer`, form({ _csrf: csrfP, signatureData: SIGNATURE_PNG }));
    ok(r.status === 400, 'candidat : case « j’ai lu et j’accepte » obligatoire');
    r = await req(pub, 'POST', `${suivi}/signer`, form({ _csrf: csrfP, accept: '1', signatureData: 'data:image/png;base64,@@' }));
    ok(r.status === 400, 'candidat : signature invalide refusée');

    r = await req(pub, 'POST', `${suivi}/signer`, form({ _csrf: csrfP, accept: '1', signatureData: SIGNATURE_PNG }));
    ok(r.status === 302 && r.location === suivi, 'candidat : signature acceptée -> retour suivi');
    contract = await prisma.contract.findUnique({ where: { applicationId: application.id } });
    ok(contract.applicantSignedAt instanceof Date && contract.applicantSignaturePath
      && fs.existsSync(absStored(contract.applicantSignaturePath)),
      'candidat : signature stockée + horodatage');
    ok(contract.signedPdfPath && fs.existsSync(absStored(contract.signedPdfPath))
      && contract.signedPdfHash === sha256Hex(fs.readFileSync(absStored(contract.signedPdfPath))),
      'candidat : PDF final généré, empreinte exacte');
    const signedMails = mailCalls.filter((c) => c[0] === 'signed').map((c) => c[1]);
    ok(signedMails.includes(application.applicantEmail) && signedMails.includes(school.email),
      'candidat : PDF signé envoyé aux DEUX parties');

    r = await req(pub, 'GET', suivi);
    ok(/Contrat signé/.test(r.text) && r.text.includes(`${suivi}/contrat`),
      'candidat : suivi affiche « signé » + téléchargement');
    r = await req(pub, 'GET', `${suivi}/contrat`);
    ok(r.status === 200 && r.text.startsWith('%PDF'), 'candidat : télécharge le PDF final');
    r = await req(pub, 'GET', `${suivi}/signer`);
    ok(r.status === 302, 'candidat : page de signature refusée une fois signé (redirection)');

    r = await req(jarE, 'GET', `${apBase}/contrat/telecharger-signe`);
    ok(r.status === 200 && r.text.startsWith('%PDF'), 'école : télécharge le PDF signé');
    r = await req(jarE, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(/Contrat signé/.test(r.text), 'école : badge « contrat signé » sur la liste');

    // --- 7. nettoyage disque ---
    // Refus d'une candidature signée : contrat + signatures + PDF final supprimés.
    const relsAvantRefus = [contract.pdfPath, contract.schoolSignaturePath, contract.applicantSignaturePath, contract.signedPdfPath];
    ok(relsAvantRefus.every((rel) => rel && fs.existsSync(absStored(rel))), 'nettoyage : fichiers présents avant refus');
    r = await req(jarE, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    r = await req(jarE, 'POST', `${apBase}/refuser`, form({ _csrf: csrfFrom(r.text) }));
    ok(r.status === 302, 'nettoyage : refus -> redirection');
    ok(relsAvantRefus.every((rel) => !fs.existsSync(absStored(rel))), 'nettoyage : refus -> tous les fichiers du contrat supprimés');
    ok(!(await prisma.contract.findUnique({ where: { applicationId: application.id } })), 'nettoyage : contrat supprimé en base');

    // Suppression d'annonce : les chemins de signature sont collectés aussi.
    const listingService = require('../src/services/listingService');
    const app2 = await prisma.application.create({
      data: { listingId: listing.id, applicantName: 'G2', applicantEmail: `g2.${STAMP}@example.test`, message: 'm' },
    });
    const relSig2 = 'signatures/lotg-collect.png';
    fs.writeFileSync(absStored(relSig2), 'x');
    await prisma.contract.create({
      data: {
        applicationId: app2.id, type: 'cdi', startDate: new Date(), grossSalary: 'x', workplace: 'x',
        pdfPath: 'contracts/lotg-collect.pdf', schoolSignaturePath: relSig2, signedPdfPath: 'contracts/lotg-collect-signe.pdf',
      },
    });
    const collected = await listingService.findFilePathsForListing(school.id, listing.id);
    ok(collected.includes(relSig2) && collected.includes('contracts/lotg-collect-signe.pdf'),
      'nettoyage : chemins de signatures et PDF signé collectés pour la suppression');
    fs.unlinkSync(absStored(relSig2));

    // --- G+. import image dans le pad ---
    const padJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'signature-pad.js'), 'utf8');
    ok(padJs.includes('FileReader') && padJs.includes('drawImage') && padJs.includes('MAX_IMPORT_BYTES'),
      'signature : JS du pad sait importer une image dans le canvas');

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
