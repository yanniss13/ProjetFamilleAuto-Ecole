/**
 * Tests du Lot L - autocomplete d'adresse via l'API Adresse.
 * Spec : docs/superpowers/plans/2026-07-07-lot-l-autocomplete-adresse.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotl-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';
process.env.ADRESSE_LOOKUP_DISABLED = '1';

const PORT = 4070;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function main() {
  // --- 1. service relais API Adresse ---
  {
    const adresseService = require('../src/services/adresse');
    const origFetch = global.fetch;
    const origDisabled = process.env.ADRESSE_LOOKUP_DISABLED;
    let calls = 0;
    const okResponse = (features) => ({ ok: true, json: async () => ({ features }) });
    try {
      process.env.ADRESSE_LOOKUP_DISABLED = '0';
      global.fetch = async (url) => {
        calls += 1;
        const href = String(url);
        ok(href.includes('limit=5') && href.includes('autocomplete=1'), 'adresse : appel API borne a 5 suggestions autocomplete');
        return okResponse([
          { properties: { label: '8 Boulevard du Port 80000 Amiens', city: 'Amiens', postcode: '80000' } },
          { properties: { label: '8 Boulevard du Port 80080 Amiens', city: 'Amiens', postcode: '80080' } },
        ]);
      };

      const results = await adresseService.searchAddress(`8 bd du port, Amiens ${STAMP}`);
      ok(Array.isArray(results) && results.length === 2, 'adresse : renvoie un tableau de suggestions');
      ok(results[0].label === '8 Boulevard du Port 80000 Amiens' && results[0].city === 'Amiens' && results[0].postcode === '80000',
        'adresse : mappe label, ville et code postal');

      await adresseService.searchAddress(`  8 BD DU PORT, AMIENS ${STAMP}  `);
      ok(calls === 1, 'adresse : le cache evite un deuxieme fetch pour la meme requete');

      global.fetch = async () => { calls += 1; throw new Error('reseau'); };
      ok((await adresseService.searchAddress(`reseau ko ${STAMP}`)).length === 0, 'adresse : exception reseau -> tableau vide');

      global.fetch = async () => { calls += 1; return { ok: false }; };
      ok((await adresseService.searchAddress(`statut ko ${STAMP}`)).length === 0, 'adresse : statut non-200 -> tableau vide');

      const beforeShort = calls;
      ok((await adresseService.searchAddress('  ab ')).length === 0 && calls === beforeShort,
        'adresse : requete trop courte -> tableau vide sans reseau');

      process.env.ADRESSE_LOOKUP_DISABLED = '1';
      const beforeDisabled = calls;
      ok((await adresseService.searchAddress(`desactive ${STAMP}`)).length === 0 && calls === beforeDisabled,
        'adresse : ADRESSE_LOOKUP_DISABLED court-circuite sans reseau');
    } finally {
      global.fetch = origFetch;
      process.env.ADRESSE_LOOKUP_DISABLED = origDisabled;
    }
  }

  console.log(`\n✅ Lot L tests reussis - ${passed} assertions.`);
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
