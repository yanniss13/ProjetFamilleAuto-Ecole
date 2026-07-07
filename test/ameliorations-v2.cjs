/**
 * Tests des améliorations restantes de la revue de code du 2026-07-06 :
 *   1. Le jeton de réinitialisation est validé dès le GET (pas après saisie).
 *   2. La réinitialisation du mot de passe invalide les sessions ouvertes.
 *   3. Déconnexions école/admin séparées (ne détruire que la clé concernée).
 *   4. Page dédiée en échec CSRF (formulaire expiré ≠ erreur serveur).
 *   5. Pagination des listes admin (/admin/annonces, /admin/ecoles).
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'amelv2-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const tokens = require('../src/services/tokens');
const passwordUtil = require('../src/utils/password');
const adminService = require('../src/services/adminService');

const PORT = 4068;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

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

const createdSchoolIds = [];
const createdAdminIds = [];

async function createSchool(prefix, extra = {}) {
  const school = await prisma.school.create({
    data: {
      email: `${prefix}.${STAMP}@example.test`,
      passwordHash: await passwordUtil.hash('motdepasse123'),
      businessName: `AmelV2 ${prefix}`,
      siret: `${String(Math.floor(Math.random() * 9) + 1)}${String(STAMP + createdSchoolIds.length).slice(-13).padStart(13, '0')}`,
      emailVerified: true,
      ...extra,
    },
  });
  createdSchoolIds.push(school.id);
  return school;
}

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));
  try {
    // ------- 1. Jeton de réinitialisation validé dès le GET -------
    {
      const school = await createSchool('v2.reset');
      const { raw, hash } = tokens.generateToken();
      await prisma.school.update({
        where: { id: school.id },
        data: { resetTokenHash: hash, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
      });

      const jar = makeJar();
      let r = await req(jar, 'GET', `/reinitialiser/${raw}`);
      ok(r.status === 200 && r.text.includes('name="password"'), 'reset GET : jeton valide -> formulaire affiché');

      r = await req(jar, 'GET', `/reinitialiser/jetonbidon${STAMP}`);
      ok(r.status === 302 && r.location === '/mot-de-passe-oublie',
        'reset GET : jeton inconnu -> renvoi vers mot-de-passe-oublie');

      await prisma.school.update({
        where: { id: school.id },
        data: { resetTokenExpiry: new Date(Date.now() - 1000) },
      });
      r = await req(jar, 'GET', `/reinitialiser/${raw}`);
      ok(r.status === 302 && r.location === '/mot-de-passe-oublie',
        'reset GET : jeton expiré -> renvoi vers mot-de-passe-oublie');
    }

    // ------- 2. La réinitialisation invalide les sessions ouvertes -------
    {
      const school = await createSchool('v2.invalidate');
      const { raw, hash } = tokens.generateToken();
      await prisma.school.update({
        where: { id: school.id },
        data: { resetTokenHash: hash, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
      });

      // Session « volée » : l'école est connectée dans un autre navigateur.
      const stolen = makeJar();
      let r = await req(stolen, 'GET', '/connexion');
      r = await req(stolen, 'POST', '/connexion', form({ _csrf: csrfFrom(r.text), email: school.email, password: 'motdepasse123' }));
      ok(r.status === 302 && r.location === '/tableau-de-bord', 'invalidation : précondition, école connectée ailleurs');

      // Le propriétaire réinitialise son mot de passe depuis un navigateur propre.
      const owner = makeJar();
      r = await req(owner, 'GET', `/reinitialiser/${raw}`);
      r = await req(owner, 'POST', `/reinitialiser/${raw}`,
        form({ _csrf: csrfFrom(r.text), password: 'nouveaumdp123', passwordConfirm: 'nouveaumdp123' }));
      ok(r.status === 302 && r.location === '/connexion', 'invalidation : réinitialisation acceptée');

      // La session ouverte ailleurs ne doit plus donner accès à l'espace école.
      r = await req(stolen, 'GET', '/tableau-de-bord');
      ok(r.status === 302 && r.location === '/connexion',
        'invalidation : la session ouverte ailleurs est déconnectée après le reset');
    }

    // ------- 3. Cloisonnement des déconnexions école/admin -------
    // Les deux connexions régénèrent la session (anti-fixation) : une session mixte
    // école+admin est impossible par construction. On documente ici que se connecter
    // à un espace ferme l'autre, et que chaque déconnexion ne touche que sa session.
    {
      const school = await createSchool('v2.logout');
      const admin = await adminService.create({
        email: `v2.admin.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('adminpass123'),
      });
      createdAdminIds.push(admin.id);

      const jar = makeJar();
      let r = await req(jar, 'GET', '/connexion');
      r = await req(jar, 'POST', '/connexion', form({ _csrf: csrfFrom(r.text), email: school.email, password: 'motdepasse123' }));
      ok(r.status === 302 && r.location === '/tableau-de-bord', 'cloisonnement : connexion école');

      r = await req(jar, 'GET', '/admin/connexion');
      r = await req(jar, 'POST', '/admin/connexion', form({ _csrf: csrfFrom(r.text), email: admin.email, password: 'adminpass123' }));
      ok(r.status === 302 && r.location === '/admin', 'cloisonnement : connexion admin dans le même navigateur');
      r = await req(jar, 'GET', '/tableau-de-bord');
      ok(r.status === 302 && r.location === '/connexion',
        'cloisonnement : la connexion admin régénère la session, l’espace école est fermé');

      r = await req(jar, 'GET', '/admin');
      const csrfAdm = csrfFrom(r.text);
      r = await req(jar, 'POST', '/admin/deconnexion', form({ _csrf: csrfAdm }));
      ok(r.status === 302 && r.location === '/admin/connexion', 'cloisonnement : déconnexion admin -> login admin');
      r = await req(jar, 'GET', '/admin');
      ok(r.status === 302 && r.location === '/admin/connexion', 'cloisonnement : session admin bien fermée');
    }

    // ------- 4. Échec CSRF : page dédiée, pas une erreur serveur générique -------
    {
      const jar = makeJar();
      await req(jar, 'GET', '/connexion'); // pose une session + un jeton
      const r = await req(jar, 'POST', '/connexion',
        form({ _csrf: 'jeton-perime', email: 'x@exemple.test', password: 'motdepasse123' }));
      ok(r.status === 403, 'csrf : jeton invalide -> 403');
      ok(/expiré/i.test(r.text) && /réessay/i.test(r.text),
        'csrf : la page explique que le formulaire a expiré et comment réessayer');
      ok(!r.text.includes('Une erreur est survenue'),
        'csrf : plus le message d’erreur serveur générique');
    }

    // ------- 5. Pagination des listes admin -------
    // ⚠️ Les données de démo persistent en base : on n'affirme jamais de comptes
    // exacts globaux, seulement la position de NOS lignes (les plus récentes).
    {
      const pagSchool = await createSchool('v2.pag');
      const now = Date.now();
      const pad = (i) => String(i).padStart(2, '0');

      // 25 annonces : n01 (la plus récente) … n25 -> pages 1 (n01-n20) et 2 (n21+).
      await prisma.listing.createMany({
        data: Array.from({ length: 25 }, (_, idx) => {
          const i = idx + 1;
          return {
            title: `PagAnnonce ${STAMP} n${pad(i)}`,
            description: 'pagination', city: 'Pau', department: '64',
            schoolId: pagSchool.id,
            titleLower: `pagannonce ${STAMP} n${pad(i)}`,
            descriptionLower: 'pagination', cityLower: 'pau',
            createdAt: new Date(now - i * 1000),
          };
        }),
      });

      // 21 écoles supplémentaires (aucune connexion : hash factice). Datées dans le
      // futur proche pour passer devant les écoles créées plus haut dans ce fichier :
      // page 1 = n01..n20 exactement, quel que soit le reste de la base.
      await prisma.school.createMany({
        data: Array.from({ length: 21 }, (_, idx) => {
          const i = idx + 1;
          return {
            email: `v2.pag.ecole.${pad(i)}.${STAMP}@example.test`,
            passwordHash: 'x',
            businessName: `PagEcole ${STAMP} n${pad(i)}`,
            siret: `9${String(STAMP + 100 + i).slice(-13).padStart(13, '0')}`,
            createdAt: new Date(now + (26 - i) * 1000),
          };
        }),
      });
      const pagSchools = await prisma.school.findMany({ where: { email: { contains: `.${STAMP}@example.test` } }, select: { id: true } });
      for (const s of pagSchools) if (!createdSchoolIds.includes(s.id)) createdSchoolIds.push(s.id);

      const adminJar = makeJar();
      let r = await req(adminJar, 'GET', '/admin/connexion');
      r = await req(adminJar, 'POST', '/admin/connexion',
        form({ _csrf: csrfFrom(r.text), email: `v2.admin.${STAMP}@example.test`, password: 'adminpass123' }));
      ok(r.status === 302 && r.location === '/admin', 'pagination : connexion admin');

      r = await req(adminJar, 'GET', '/admin/annonces');
      ok(r.status === 200 && r.text.includes('class="pagination"') && r.text.includes('page 1 /'),
        'pagination : /admin/annonces paginée (page 1)');
      ok(r.text.includes(`PagAnnonce ${STAMP} n01`) && r.text.includes(`PagAnnonce ${STAMP} n20`),
        'pagination : page 1 montre les 20 annonces les plus récentes');
      ok(!r.text.includes(`PagAnnonce ${STAMP} n21`), 'pagination : la 21e annonce n’est pas sur la page 1');
      r = await req(adminJar, 'GET', '/admin/annonces?page=2');
      ok(r.status === 200 && r.text.includes('page 2 /') && r.text.includes(`PagAnnonce ${STAMP} n21`),
        'pagination : page 2 des annonces atteignable avec la suite');
      ok(!r.text.includes(`PagAnnonce ${STAMP} n01`), 'pagination : page 2 ne répète pas la page 1');

      r = await req(adminJar, 'GET', '/admin/ecoles');
      ok(r.status === 200 && r.text.includes('class="pagination"') && r.text.includes('page 1 /'),
        'pagination : /admin/ecoles paginée (page 1)');
      ok(r.text.includes(`PagEcole ${STAMP} n01`) && r.text.includes(`PagEcole ${STAMP} n20`),
        'pagination : page 1 montre les 20 écoles les plus récentes');
      ok(!r.text.includes(`PagEcole ${STAMP} n21`), 'pagination : la 21e école n’est pas sur la page 1');
      r = await req(adminJar, 'GET', '/admin/ecoles?page=2');
      ok(r.status === 200 && r.text.includes('page 2 /') && r.text.includes(`PagEcole ${STAMP} n21`),
        'pagination : page 2 des écoles atteignable avec la suite');
    }

    console.log(`\n✅ Tests améliorations v2 réussis — ${passed} assertions.`);
  } finally {
    if (createdAdminIds.length) await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } }).catch(() => {});
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } }).catch(() => {});
    await prisma.$disconnect();
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
