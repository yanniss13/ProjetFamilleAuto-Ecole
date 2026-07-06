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

const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function main() {
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

  console.log(`\n✅ Lot E tests reussis - ${passed} assertions.`);
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
