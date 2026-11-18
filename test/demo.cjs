/**
 * Tests du mode démonstration (DEMO_MODE=true) — instance publique de démo.
 * Le mode affiche un bandeau « données fictives » et les accès de démonstration
 * sur les pages de connexion ; sans lui, rien de tout cela n'apparaît.
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'demo-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';
process.env.ADRESSE_LOOKUP_DISABLED = '1';
delete process.env.DEMO_MODE;

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const { DEMO_ACCOUNTS, isDemoMode } = require('../src/config/demo');
const { DEMO_DOMAIN } = require('../scripts/seed-demo');

const PORT = 4073;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
async function page(urlPath) {
  const res = await fetch(BASE + urlPath, { redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}

async function main() {
  let server;
  try {
    server = await new Promise((resolve) => { const s = app.listen(PORT, () => resolve(s)); });

    // --- Comptes de démonstration : une seule source, alignée sur le seed ---
    ok(DEMO_ACCOUNTS.school.email === `ecole.vitrine@${DEMO_DOMAIN}`,
      'comptes : l ecole de demo est l ecole vitrine du seed');
    ok(DEMO_ACCOUNTS.admin.email === `admin@${DEMO_DOMAIN}`,
      'comptes : l admin de demo est celui du seed');

    // --- Hors démo : aucun accès ni bandeau ---
    ok(isDemoMode() === false, 'hors demo : DEMO_MODE absent => mode inactif');
    let r = await page('/connexion');
    ok(r.status === 200 && !r.text.includes(DEMO_ACCOUNTS.school.email)
      && !r.text.includes(DEMO_ACCOUNTS.school.password),
    'hors demo : la connexion ecole n affiche aucun identifiant');
    r = await page('/admin/connexion');
    ok(r.status === 200 && !r.text.includes(DEMO_ACCOUNTS.admin.email)
      && !r.text.includes(DEMO_ACCOUNTS.admin.password),
    'hors demo : la connexion admin n affiche aucun identifiant');
    r = await page('/');
    ok(r.status === 200 && !r.text.includes('data-demo-banner'), 'hors demo : pas de bandeau de demonstration');

    process.env.DEMO_MODE = 'oui';
    ok(isDemoMode() === false, 'hors demo : seule la valeur exacte "true" active le mode');

    // --- En démo ---
    process.env.DEMO_MODE = 'true';
    ok(isDemoMode() === true, 'demo : DEMO_MODE=true active le mode');
    r = await page('/');
    ok(r.status === 200 && r.text.includes('data-demo-banner') && r.text.includes('fictives'),
      'demo : bandeau donnees fictives sur l accueil');
    r = await page('/connexion');
    ok(r.text.includes(DEMO_ACCOUNTS.school.email) && r.text.includes(DEMO_ACCOUNTS.school.password),
      'demo : la connexion ecole affiche les acces de l ecole vitrine');
    ok(!r.text.includes(DEMO_ACCOUNTS.admin.password),
      'demo : la connexion ecole n affiche pas le mot de passe admin');
    r = await page('/admin/connexion');
    ok(r.text.includes(DEMO_ACCOUNTS.admin.email) && r.text.includes(DEMO_ACCOUNTS.admin.password),
      'demo : la connexion admin affiche les acces admin');

    console.log(`\n✅ Mode demo tests reussis - ${passed} assertions.`);
  } finally {
    delete process.env.DEMO_MODE;
    if (server) await new Promise((r) => server.close(r));
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
