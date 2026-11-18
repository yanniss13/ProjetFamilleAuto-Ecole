/**
 * Tests des correctifs de la revue de code du 18/11/2026 :
 *  1. un contrat signé par les deux parties ne peut plus être ré-édité ni refusé ;
 *  2. la signature candidat est conditionnelle (pas de double signature ni de
 *     signature d'une version périmée) et ne laisse aucun fichier en cas d'échec ;
 *  3. la ré-édition ne supprime les anciens fichiers qu'après l'écriture en base ;
 *  4. le nombre de flux temps réel ouverts par session est plafonné ;
 *  5. un lien de suivi invalide ne déconnecte pas l'école ;
 *  6. la purge ne supprime pas une candidature qui n'est plus refusée.
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'revue-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';
process.env.ADRESSE_LOOKUP_DISABLED = '1';

const path = require('path');
const fs = require('fs');
const http = require('http');
const prisma = require('../src/config/prisma');
const app = require('../src/app');
const mailer = require('../src/services/mailer');
const contractService = require('../src/services/contractService');
const purgeService = require('../src/services/purgeService');
const passwordUtil = require('../src/utils/password');
const { STORAGE_DIR, SUBDIRS } = require('../src/config/storage');

const PORT = 4074;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SIGNATURE_PNG = `data:image/png;base64,${PNG_B64}`;

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
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
function abs(rel) { return path.join(STORAGE_DIR, rel); }
function listDir(sub) { return new Set(fs.readdirSync(path.join(STORAGE_DIR, sub))); }
function token(prefix) { return `${prefix}${STAMP}`.padEnd(64, 'a').slice(0, 64); }

// Ouvre un flux SSE brut (fetch attendrait la fin du corps) et renvoie son statut.
function openSse(jar, urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.get(BASE + urlPath, { headers: { cookie: jar.cookie, accept: 'text/event-stream' } }, (res) => {
      resolve({ status: res.statusCode, close: () => { res.destroy(); r.destroy(); } });
    });
    r.on('error', reject);
  });
}

const createdSchoolIds = [];

async function main() {
  let server;
  const streams = [];
  try {
    server = await new Promise((resolve) => { const s = app.listen(PORT, () => resolve(s)); });
    for (const k of Object.keys(mailer)) if (k.startsWith('send')) mailer[k] = async () => true;

    const school = await prisma.school.create({
      data: {
        email: `revue.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'Revue École', siret: `6${String(STAMP).slice(-13).padStart(13, '0')}`, emailVerified: true,
      },
    });
    createdSchoolIds.push(school.id);
    const listing = await prisma.listing.create({
      data: {
        title: `Revue ${STAMP}`, description: 'd', city: 'Pau', department: '64', schoolId: school.id,
        titleLower: `revue ${STAMP}`, descriptionLower: 'd', cityLower: 'pau',
      },
    });
    async function newApplication(suffix, data = {}) {
      return prisma.application.create({
        data: {
          listingId: listing.id, applicantName: `Revue ${suffix}`, applicantEmail: `revue.${suffix}.${STAMP}@example.test`,
          message: 'm', trackingToken: token(`r${suffix}`), ...data,
        },
      });
    }

    const jar = makeJar();
    let r = await req(jar, 'GET', '/connexion');
    r = await req(jar, 'POST', '/connexion', form({ _csrf: csrfFrom(r.text), email: school.email, password: 'motdepasse123' }));
    ok(r.status === 302, 'mise en place : connexion ecole');
    r = await req(jar, 'GET', '/tableau-de-bord');
    const csrf = csrfFrom(r.text);
    const terms = {
      _csrf: csrf, type: 'cdi', startDate: '2026-08-01', grossSalary: '2200€ brut/mois',
      workplace: 'Pau', schoolAddress: '1 rue R', applicantAddress: '2 rue R', signatureData: SIGNATURE_PNG,
    };

    // --- 1. Contrat signé par les deux parties : verrouillé ---
    {
      const a = await newApplication('signe', { status: 'accepted' });
      const files = ['contracts/revue-p.pdf', 'signatures/revue-e.png', 'signatures/revue-c.png', 'contracts/revue-s.pdf'];
      for (const f of files) fs.writeFileSync(abs(f), 'x');
      await prisma.contract.create({
        data: {
          applicationId: a.id, type: 'cdi', startDate: new Date('2026-08-01'), grossSalary: 'x', workplace: 'x',
          pdfPath: files[0], schoolSignaturePath: files[1], schoolSignedAt: new Date(), proposedPdfHash: 'p',
          sentToApplicantAt: new Date(), applicantSignaturePath: files[2], applicantSignedAt: new Date(),
          signedPdfPath: files[3], signedPdfHash: 's',
        },
      });
      const base = `/mes-annonces/${listing.id}/candidatures/${a.id}`;

      r = await req(jar, 'GET', `${base}/accepter`);
      ok(r.status === 302, 'contrat signe : le formulaire de re-edition redirige');
      r = await req(jar, 'POST', `${base}/accepter`, form(terms));
      ok(r.status === 302, 'contrat signe : re-edition refusee par redirection');
      let c = await prisma.contract.findUnique({ where: { applicationId: a.id } });
      ok(c.signedPdfPath === files[3] && c.applicantSignedAt instanceof Date && c.pdfPath === files[0],
        'contrat signe : la re-edition ne touche pas au contrat en base');
      ok(files.every((f) => fs.existsSync(abs(f))), 'contrat signe : la re-edition ne supprime aucun fichier');

      r = await req(jar, 'POST', `${base}/refuser`, form({ _csrf: csrf }));
      ok(r.status === 302, 'contrat signe : refus refuse par redirection');
      c = await prisma.contract.findUnique({ where: { applicationId: a.id } });
      const a2 = await prisma.application.findUnique({ where: { id: a.id } });
      ok(c && c.signedPdfPath === files[3] && a2.status === 'accepted',
        'contrat signe : le refus laisse contrat et statut intacts');
      ok(files.every((f) => fs.existsSync(abs(f))), 'contrat signe : le refus ne supprime aucun fichier');
      for (const f of files) fs.unlinkSync(abs(f));
    }

    // --- 3. Ré-édition : anciens fichiers supprimés seulement après la base ---
    {
      const a = await newApplication('reedit');
      const base = `/mes-annonces/${listing.id}/candidatures/${a.id}`;
      r = await req(jar, 'POST', `${base}/accepter`, form(terms));
      ok(r.status === 302, 're-edition : premiere acceptation OK');
      const avant = await prisma.contract.findUnique({ where: { applicationId: a.id } });
      const contratsAvant = listDir(SUBDIRS.contracts);
      const signaturesAvant = listDir(SUBDIRS.signatures);

      const original = contractService.upsertForApplication;
      contractService.upsertForApplication = async () => { throw new Error('panne simulee'); };
      try {
        r = await req(jar, 'POST', `${base}/accepter`, form(terms));
      } finally {
        contractService.upsertForApplication = original;
      }
      ok(r.status === 500, 're-edition : la panne en base remonte en erreur');
      ok(fs.existsSync(abs(avant.pdfPath)) && fs.existsSync(abs(avant.schoolSignaturePath)),
        're-edition : les fichiers du contrat en base survivent a la panne');
      const contratsApres = listDir(SUBDIRS.contracts);
      const signaturesApres = listDir(SUBDIRS.signatures);
      ok([...contratsApres].every((f) => contratsAvant.has(f)) && [...signaturesApres].every((f) => signaturesAvant.has(f)),
        're-edition : aucun nouveau fichier orphelin apres la panne');
    }

    // --- 2. Signature candidat conditionnelle ---
    {
      const a = await newApplication('signature');
      const base = `/mes-annonces/${listing.id}/candidatures/${a.id}`;
      r = await req(jar, 'POST', `${base}/accepter`, form(terms));
      r = await req(jar, 'POST', `${base}/contrat/envoyer`, form({ _csrf: csrf }));
      const v1 = await prisma.contract.findUnique({ where: { applicationId: a.id } });
      ok(v1.sentToApplicantAt instanceof Date, 'signature : contrat transmis au candidat');

      // Service : la signature n'aboutit que sur la version lue et non encore signée.
      const data = { applicantSignaturePath: 'signatures/x.png', applicantSignedAt: new Date(), signedPdfPath: 'contracts/x.pdf', signedPdfHash: 'h' };
      ok(await contractService.signByApplicant(v1.id, 'autre-version', data) === null,
        'signature : version perimee (empreinte differente) refusee par le service');
      ok((await prisma.contract.findUnique({ where: { id: v1.id } })).applicantSignedAt === null,
        'signature : rien n est ecrit pour une version perimee');

      const pub = makeJar();
      const suivi = `/suivi/${a.trackingToken}`;
      r = await req(pub, 'GET', `${suivi}/signer`);
      const csrfP = csrfFrom(r.text);
      const signer = () => req(pub, 'POST', `${suivi}/signer`, form({ _csrf: csrfP, accept: '1', signatureData: SIGNATURE_PNG }));
      const contratsAvant = listDir(SUBDIRS.contracts);
      const [r1, r2] = await Promise.all([signer(), signer()]);
      ok(r1.status === 302 && r2.status === 302, 'signature : deux envois simultanes repondent par redirection');
      const signe = await prisma.contract.findUnique({ where: { id: v1.id } });
      ok(signe.applicantSignedAt instanceof Date && fs.existsSync(abs(signe.signedPdfPath)),
        'signature : le contrat est signe une fois');
      const nouveaux = [...listDir(SUBDIRS.contracts)].filter((f) => !contratsAvant.has(f));
      ok(nouveaux.length === 1 && `${SUBDIRS.contracts}/${nouveaux[0]}` === signe.signedPdfPath,
        'signature : un seul PDF final sur disque, celui enregistre en base');
      ok(await contractService.signByApplicant(v1.id, v1.proposedPdfHash, data) === null,
        'signature : un contrat deja signe ne peut pas etre resigne');
    }

    // --- 2b. Échec de la signature : aucun fichier laissé ---
    {
      const a = await newApplication('echec');
      const base = `/mes-annonces/${listing.id}/candidatures/${a.id}`;
      r = await req(jar, 'POST', `${base}/accepter`, form(terms));
      r = await req(jar, 'POST', `${base}/contrat/envoyer`, form({ _csrf: csrf }));
      const pub = makeJar();
      const suivi = `/suivi/${a.trackingToken}`;
      r = await req(pub, 'GET', `${suivi}/signer`);
      const csrfP = csrfFrom(r.text);
      const contratsAvant = listDir(SUBDIRS.contracts);
      const signaturesAvant = listDir(SUBDIRS.signatures);
      const original = contractService.signByApplicant;
      contractService.signByApplicant = async () => { throw new Error('panne simulee'); };
      try {
        r = await req(pub, 'POST', `${suivi}/signer`, form({ _csrf: csrfP, accept: '1', signatureData: SIGNATURE_PNG }));
      } finally {
        contractService.signByApplicant = original;
      }
      ok(r.status === 500, 'signature en echec : la panne remonte en erreur');
      ok([...listDir(SUBDIRS.contracts)].every((f) => contratsAvant.has(f))
        && [...listDir(SUBDIRS.signatures)].every((f) => signaturesAvant.has(f)),
      'signature en echec : ni PNG ni PDF orphelin');
    }

    // --- 5. Lien de suivi invalide : l'école reste connectée ---
    {
      r = await req(jar, 'GET', `/suivi/${'0'.repeat(64)}`);
      ok(r.status === 404, 'suivi invalide : 404');
      r = await req(jar, 'GET', '/tableau-de-bord');
      ok(r.status === 200, 'suivi invalide : la session ecole est conservee');
    }

    // --- 4. Plafond des flux temps réel par session ---
    {
      const { MAX_STREAMS_PER_SESSION } = require('../src/controllers/realtimeController');
      ok(Number.isInteger(MAX_STREAMS_PER_SESSION) && MAX_STREAMS_PER_SESSION >= 2,
        'temps reel : plafond par session expose');
      const url = `/mes-annonces/${listing.id}/candidatures/temps-reel`;
      for (let i = 0; i < MAX_STREAMS_PER_SESSION; i += 1) streams.push(await openSse(jar, url));
      ok(streams.every((s) => s.status === 200), 'temps reel : les flux sous le plafond sont acceptes');
      const deTrop = await openSse(jar, url);
      streams.push(deTrop);
      ok(deTrop.status === 429, 'temps reel : le flux au-dela du plafond est refuse (429)');
      for (const s of streams.splice(0)) s.close();
      await new Promise((res) => setTimeout(res, 200));
      const apres = await openSse(jar, url);
      streams.push(apres);
      ok(apres.status === 200, 'temps reel : une place liberee est reutilisable');
    }

    // --- 6. Purge : une candidature repêchée entre-temps n'est pas supprimée ---
    {
      const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
      const a = await newApplication('purge', { status: 'accepted', cvPath: 'cv/revue-purge.pdf', createdAt: old });
      fs.writeFileSync(abs('cv/revue-purge.pdf'), 'x');
      const original = prisma.application.findMany;
      let remplace = true;
      try {
        prisma.application.findMany = async (args) => {
          if (args && args.where && args.where.status === 'rejected') {
            return [{ ...a, status: 'rejected', rejectedAt: old, contract: null }];
          }
          return original.call(prisma.application, args);
        };
      } catch {
        remplace = false;
      }
      try {
        if (remplace) await purgeService.runPurge();
      } finally {
        if (remplace) prisma.application.findMany = original;
      }
      if (remplace) {
        ok(await prisma.application.findUnique({ where: { id: a.id } }), 'purge : candidature repechee conservee en base');
        ok(fs.existsSync(abs('cv/revue-purge.pdf')), 'purge : ses pieces restent sur disque');
      }
      fs.rmSync(abs('cv/revue-purge.pdf'), { force: true });
    }

    console.log(`\n✅ Revue tests reussis - ${passed} assertions.`);
  } finally {
    for (const s of streams) s.close();
    if (server) { server.closeAllConnections && server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
