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

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const prisma = require('../src/config/prisma');
const app = require('../src/app');

const PORT = 4070;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
function jsonOrNull(text) {
  try { return JSON.parse(text); } catch { return null; }
}
async function get(urlPath) {
  const res = await fetch(BASE + urlPath, { redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function makeElement(tag) {
  const attrs = {};
  const el = {
    tagName: tag.toUpperCase(), children: [], value: '', textContent: '',
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    replaceChildren(...items) { this.children = []; items.forEach((item) => this.appendChild(item)); },
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    addEventListener(name, cb) { this.listeners = this.listeners || {}; this.listeners[name] = cb; },
    dispatchInput() { if (this.listeners && this.listeners.input) this.listeners.input({ target: this }); },
  };
  Object.defineProperty(el, 'innerHTML', { set() { throw new Error('innerHTML interdit dans le test autocomplete.'); } });
  return el;
}
function makeAutocompleteDom() {
  const input = makeElement('input');
  input.setAttribute('data-adresse-autocomplete', '');
  input.setAttribute('data-debounce-ms', '20');
  const body = makeElement('body');
  body.appendChild(input);
  const created = [];
  const document = {
    body,
    querySelectorAll(selector) { return selector === 'input[data-adresse-autocomplete]' ? [input] : []; },
    createElement(tag) { const el = makeElement(tag); created.push(el); return el; },
  };
  return { document, input, created };
}
function runAdresseAutocompleteJs(fetchImpl) {
  const dom = makeAutocompleteDom();
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'adresse-autocomplete.js'), 'utf8');
  vm.runInNewContext(script, {
    document: dom.document,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
    AbortController,
    encodeURIComponent,
  });
  return dom;
}

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

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

    // --- 2. endpoint interne /api/adresse ---
    {
      const adresseService = require('../src/services/adresse');
      const origSearch = adresseService.searchAddress;
      try {
        let seenQuery = null;
        adresseService.searchAddress = async (q) => {
          seenQuery = q;
          return [{ label: '8 Boulevard du Port 80000 Amiens', city: 'Amiens', postcode: '80000' }];
        };

        let r = await get('/api/adresse?q=8+bd+du+port');
        let body = jsonOrNull(r.text);
        ok(r.status === 200 && body && body.resultats.length === 1 && body.resultats[0].city === 'Amiens' && seenQuery === '8 bd du port',
          'api adresse : relaie les resultats du service en JSON');

        r = await get('/api/adresse');
        body = jsonOrNull(r.text);
        ok(r.status === 400 && typeof body.erreur === 'string',
          'api adresse : q absente -> 400 JSON');

        r = await get('/api/adresse?q=ab');
        body = jsonOrNull(r.text);
        ok(r.status === 400 && typeof body.erreur === 'string',
          'api adresse : q trop courte -> 400 JSON');

        let limited = false;
        for (let i = 0; i < 40 && !limited; i += 1) {
          r = await get(`/api/adresse?q=limite-${STAMP}-${i}`);
          if (r.status === 429) {
            body = jsonOrNull(r.text);
            limited = body.erreur === 'rate_limited';
          }
        }
        ok(limited, 'api adresse : rate-limit public 30/min/IP en JSON');
      } finally {
        adresseService.searchAddress = origSearch;
      }
    }

    // --- 3. script navigateur adresse-autocomplete.js ---
    {
      const calls = [];
      const dom = runAdresseAutocompleteJs(async (url) => {
        calls.push(String(url));
        return {
          ok: true,
          json: async () => ({ resultats: [{ label: '8 Boulevard du Port 80000 Amiens', city: 'Amiens', postcode: '80000' }] }),
        };
      });
      const listId = dom.input.getAttribute('list');
      const datalist = dom.created.find((el) => el.tagName === 'DATALIST' && el.getAttribute('id') === listId);
      ok(Boolean(listId && datalist), 'JS adresse : datalist creee et liee a l input');

      dom.input.value = '8 bd du port';
      dom.input.dispatchInput();
      await wait(40);
      ok(calls.length === 1 && calls[0].startsWith('/api/adresse?q=8%20bd%20du%20port'),
        'JS adresse : saisie valide -> fetch vers le relais interne');
      ok(datalist.children.length === 1 && datalist.children[0].value === '8 Boulevard du Port 80000 Amiens'
        && datalist.children[0].textContent === '8 Boulevard du Port 80000 Amiens',
        'JS adresse : suggestions rendues en option via value et textContent');

      const shortCalls = [];
      const shortDom = runAdresseAutocompleteJs(async (url) => {
        shortCalls.push(String(url));
        return { ok: true, json: async () => ({ resultats: [] }) };
      });
      shortDom.input.value = 'ab';
      shortDom.input.dispatchInput();
      await wait(40);
      ok(shortCalls.length === 0, 'JS adresse : saisie trop courte -> aucun fetch');

      const debounceCalls = [];
      const debounceDom = runAdresseAutocompleteJs(async (url) => {
        debounceCalls.push(String(url));
        return { ok: true, json: async () => ({ resultats: [] }) };
      });
      debounceDom.input.value = '8 boulevard';
      debounceDom.input.dispatchInput();
      debounceDom.input.value = '8 boulevard du port';
      debounceDom.input.dispatchInput();
      await wait(40);
      ok(debounceCalls.length === 1 && debounceCalls[0].includes('8%20boulevard%20du%20port'),
        'JS adresse : appels debounces, seule la derniere saisie part');
    }

    console.log(`\n✅ Lot L tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
