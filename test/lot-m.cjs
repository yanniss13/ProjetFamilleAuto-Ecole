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
const applicationService = require('../src/services/applicationService');
const contractService = require('../src/services/contractService');
const realtimeService = require('../src/services/realtimeService');
const passwordUtil = require('../src/utils/password');
const mailer = require('../src/services/mailer');
const { resolveStored } = require('../src/config/storage');

const PORT = 4072;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF\n');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SIGNATURE_PNG = `data:image/png;base64,${PNG_B64}`;

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

function makeJar() { return { cookie: '' }; }

function sidFromJar(jar) {
  const encoded = String(jar.cookie || '').split('=')[1] || '';
  const signed = decodeURIComponent(encoded);
  return signed.startsWith('s:') ? signed.slice(2).split('.')[0] : null;
}

function storeCookies(jar, res) {
  const values = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const value of values) jar.cookie = value.split(';')[0];
}

async function req(jar, method, urlPath, { body, headers = {} } = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    redirect: 'manual',
    headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...headers },
    body,
  });
  storeCookies(jar, res);
  return {
    status: res.status,
    location: res.headers.get('location'),
    headers: res.headers,
    text: await res.text(),
  };
}

function csrfFrom(html) {
  const match = html.match(/name="csrf-token" content="([^"]+)"/);
  if (!match) throw new Error('Jeton CSRF introuvable.');
  return match[1];
}

function form(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) params.append(key, value);
  return { body: params.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } };
}

function applicationForm(csrf, suffix) {
  const data = new FormData();
  data.append('_csrf', csrf);
  data.append('applicantName', `Direct M ${suffix}`);
  data.append('applicantEmail', `direct.m.${STAMP}.${suffix}@example.test`);
  data.append('applicantPhone', '0611223344');
  data.append('message', 'Candidature envoyee pendant le test temps reel.');
  data.append('cv', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'cv.pdf');
  data.append('idCard', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'identite.pdf');
  data.append('license', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'permis.pdf');
  data.append('teachingCard', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'carte.pdf');
  return data;
}

function contractValues(csrf) {
  return {
    _csrf: csrf,
    type: 'cdi',
    startDate: '2026-11-02',
    grossSalary: '2300 € brut/mois',
    weeklyHours: '35',
    workplace: 'Marseille',
    schoolAddress: '45 avenue du Prado, Marseille',
    applicantAddress: '18 rue Paradis, Marseille',
    signatureData: SIGNATURE_PNG,
  };
}

function openSse(jar, urlPath) {
  return new Promise((resolve, reject) => {
    const request = http.get(BASE + urlPath, {
      headers: {
        accept: 'text/event-stream',
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
    });
    openSseRequests.add(request);
    request.on('response', (response) => {
      response.once('close', () => openSseRequests.delete(request));
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('error', reject);
      const ready = async () => {
        if (response.statusCode !== 200 || await eventually(() => body.includes(': connexion'))) {
          resolve({ request, response, body: () => body });
        } else {
          reject(new Error('Flux SSE ouvert sans trame de connexion.'));
        }
      };
      ready().catch(reject);
    });
    request.on('error', reject);
  });
}

async function waitForSse(stream, type) {
  return eventually(() => stream.body().includes(`"type":"${type}"`), 80, 10);
}

function installTransitionOrderProbe() {
  const states = new Map();
  const publications = [];
  const originals = [];

  function stateFor(applicationId) {
    let state = states.get(applicationId);
    if (!state) {
      state = {};
      states.set(applicationId, state);
    }
    return state;
  }

  function wrapAfter(object, method, markCompleted) {
    const original = object[method];
    originals.push({ object, method, original });
    object[method] = async function wrappedMutation(...args) {
      const result = await original.apply(this, args);
      markCompleted(result);
      return result;
    };
  }

  wrapAfter(applicationService, 'createForListing', (application) => {
    stateFor(application.id).created = Number.isInteger(application.id)
      && Number.isInteger(application.listingId)
      && Boolean(application.trackingToken);
  });
  wrapAfter(applicationService, 'updateStatus', (application) => {
    const state = stateFor(application.id);
    if (application.status === 'accepted') {
      state.accepted = application.rejectedAt === null;
    } else if (application.status === 'rejected') {
      state.rejected = application.rejectedAt instanceof Date;
    }
  });
  wrapAfter(contractService, 'upsertForApplication', (contract) => {
    stateFor(contract.applicationId).contractPersisted = Boolean(
      contract.pdfPath
      && contract.schoolSignaturePath
      && contract.schoolSignedAt instanceof Date
      && contract.proposedPdfHash
    );
  });
  wrapAfter(contractService, 'markSent', (contract) => {
    stateFor(contract.applicationId).sent = contract.sentToApplicantAt instanceof Date;
  });
  wrapAfter(contractService, 'signByApplicant', (contract) => {
    const signedPdfPath = resolveStored(contract.signedPdfPath);
    stateFor(contract.applicationId).signed = contract.applicantSignedAt instanceof Date
      && Boolean(contract.signedPdfHash)
      && Boolean(signedPdfPath)
      && fs.existsSync(signedPdfPath);
  });

  const originalPublish = realtimeService.publishApplicationUpdate;
  originals.push({
    object: realtimeService,
    method: 'publishApplicationUpdate',
    original: originalPublish,
  });
  realtimeService.publishApplicationUpdate = function observedPublish(application, type) {
    const applicationId = application && application.id;
    const state = states.get(applicationId);
    const afterMutation = type === realtimeService.EVENT_TYPES.APPLICATION_CREATED
      ? Boolean(state && state.created)
      : type === realtimeService.EVENT_TYPES.APPLICATION_ACCEPTED
        ? Boolean(state && state.contractPersisted && state.accepted)
        : type === realtimeService.EVENT_TYPES.APPLICATION_REJECTED
          ? Boolean(state && state.rejected)
          : type === realtimeService.EVENT_TYPES.CONTRACT_SENT
            ? Boolean(state && state.sent)
            : type === realtimeService.EVENT_TYPES.CONTRACT_SIGNED
              ? Boolean(state && state.signed)
              : false;
    publications.push({ applicationId, type, afterMutation });
    return originalPublish.call(this, application, type);
  };

  let active = true;
  return {
    wasPublishedAfter(applicationId, type) {
      const matching = publications.filter((entry) => (
        entry.applicationId === applicationId && entry.type === type
      ));
      return matching.length > 0 && matching.every((entry) => entry.afterMutation);
    },
    publicationCount(applicationId, type) {
      return publications.filter((entry) => (
        entry.applicationId === applicationId && entry.type === type
      )).length;
    },
    restore() {
      if (!active) return;
      active = false;
      for (const { object, method, original } of originals.reverse()) object[method] = original;
    },
  };
}

function makeRealtimeDom({
  mode = 'candidate',
  focused = false,
  focusedCardId = null,
  page = '1',
  cardIds = [],
} = {}) {
  const statusText = { textContent: '' };
  const status = {
    hidden: true,
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    querySelector(selector) { return selector === '[data-realtime-status-text]' ? statusText : null; },
  };
  const announcement = { textContent: '' };
  const update = { hidden: true };
  const activeElement = focused || focusedCardId !== null ? {} : null;
  const current = {
    replacements: 0,
    contains() { return focused; },
    replaceWith() { this.replacements += 1; },
  };
  const cards = {};
  for (const applicationId of cardIds) {
    cards[String(applicationId)] = {
      replacements: 0,
      contains(element) {
        return String(focusedCardId) === String(applicationId) && element === activeElement;
      },
      replaceWith() { this.replacements += 1; },
    };
  }
  const list = {
    prepended: 0,
    prepend() { this.prepended += 1; },
  };
  const empty = { removed: false, remove() { this.removed = true; } };
  const attrs = {
    'data-realtime-mode': mode,
    'data-realtime-page': page,
    'data-realtime-stream-url': '/flux-sans-jeton',
    'data-realtime-snapshot-url': '/fragment-sans-jeton',
    'data-realtime-card-url-template': '/cartes/__APPLICATION_ID__',
  };
  const context = {
    getAttribute(name) { return attrs[name] || null; },
    querySelector(selector) {
      if (selector === '[data-realtime-status]') return status;
      if (selector === '[data-realtime-announcement]') return announcement;
      if (selector === '[data-realtime-update]') return update;
      if (selector === '[data-tracking-status]' && mode === 'candidate') return current;
      if (selector === '[data-application-region]' && mode === 'school') return current;
      if (selector === '[data-application-list]') return list;
      if (selector === '[data-application-empty]') return empty;
      const cardMatch = selector.match(/^\[data-application-card="(\d+)"\]$/);
      if (cardMatch) return cards[cardMatch[1]] || null;
      return null;
    },
  };
  const document = {
    activeElement,
    body: {},
    querySelectorAll(selector) { return selector === '[data-realtime-context]' ? [context] : []; },
    importNode(node) { return node; },
  };
  return {
    document, context, status, statusText, announcement, update, current, cards, list, empty,
  };
}

function loadRealtimeScript(dom, fetchImpl, { withAbortController = true } = {}) {
  const sources = [];
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = {};
      this.closed = false;
      this.closeCalls = 0;
      sources.push(this);
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    close() { this.closeCalls += 1; this.closed = true; this.readyState = 2; }
    open() { this.readyState = 1; if (this.onopen) this.onopen(); }
    error(state) { this.readyState = state; if (this.onerror) this.onerror(); }
    invalidate(payload) {
      if (this.listeners.invalidate) this.listeners.invalidate({ data: JSON.stringify(payload) });
    }
  }
  class FakeDOMParser {
    parseFromString(html) {
      if (html.includes('data-missing-root')) {
        return { querySelector() { return null; } };
      }
      const containsScript = html.includes('data-script-fragment');
      const node = {
        querySelector(selector) { return selector === 'script' && containsScript ? {} : null; },
      };
      return { querySelector() { return node; } };
    }
  }
  const module = { exports: {} };
  const win = {
    addEventListener() {},
  };
  if (withAbortController) win.AbortController = AbortController;
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'realtime.js'), 'utf8');
  vm.runInNewContext(script, { module, document: undefined, window: undefined, console });
  module.exports.initRealtime(dom.document, win, fetchImpl, FakeEventSource, FakeDOMParser);
  return { api: module.exports, sources };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fragmentResponse(html = '<section></section>') {
  return { ok: true, status: 200, redirected: false, text: async () => html };
}

async function resolveDeferredRequests(requests, expectedCount) {
  for (let index = 0; index < expectedCount; index += 1) {
    if (!await eventually(() => requests.length > index)) return false;
    requests[index].resolve(fragmentResponse());
  }
  return true;
}

async function main() {
  let server;
  let transitionOrderProbe;
  try {
    realtimeService._resetForTests();
    server = app.listen(PORT);
    await new Promise((resolve) => server.once('listening', resolve));

    // --- 1. Registre mémoire isolé et best-effort ---
    const listingChannel = realtimeService.listingChannel(12);
    const applicationChannel = realtimeService.applicationChannel(34);
    ok(listingChannel === 'listing:12' && applicationChannel === 'application:34',
      'service : noms de canaux stables et distincts');

    let coercibleIdsRejected = 0;
    for (const buildChannel of [
      () => realtimeService.listingChannel('12'),
      () => realtimeService.applicationChannel(true),
    ]) {
      try {
        buildChannel();
      } catch (err) {
        if (err instanceof TypeError) coercibleIdsRejected += 1;
      }
    }
    ok(coercibleIdsRejected === 2,
      'service : les constructeurs refusent les identifiants coercibles non numeriques');

    const received = [];
    const unsubscribe = realtimeService.subscribe(listingChannel, (event) => received.push(event));
    realtimeService.subscribe(listingChannel, () => { throw new Error('abonne en panne'); });
    realtimeService.publish(listingChannel, {
      type: 'application-created',
      applicationId: 34,
      email: 'secret@example.test',
      token: 'secret',
      document: { path: 'storage/prive.pdf' },
    });
    ok(received.length === 1 && received[0].applicationId === 34,
      'service : un abonne en erreur ne bloque pas les autres');
    ok(JSON.stringify(Object.keys(received[0]).sort()) === JSON.stringify(['applicationId', 'type']),
      'service : publish borne exactement la charge utile aux deux cles publiques');

    let typeReads = 0;
    let applicationIdReads = 0;
    const beforeGetterEvent = received.length;
    realtimeService.publish(listingChannel, {
      get type() {
        typeReads += 1;
        return typeReads === 1 ? realtimeService.EVENT_TYPES.APPLICATION_CREATED : 'type-modifie';
      },
      get applicationId() {
        applicationIdReads += 1;
        return applicationIdReads === 1 ? 34 : '34';
      },
    });
    const getterEvent = received[beforeGetterEvent];
    ok(typeReads === 1 && applicationIdReads === 1
      && getterEvent.type === realtimeService.EVENT_TYPES.APPLICATION_CREATED
      && getterEvent.applicationId === 34,
    'service : publish fige les valeurs validees sans relire les getters');
    ok(realtimeService.subscriberCount(listingChannel) === 2,
      'service : compteur diagnostic des abonnes');

    const beforeUnknownType = received.length;
    let unknownTypeThrew = false;
    try {
      realtimeService.publish(listingChannel, { type: 'application-inconnue', applicationId: 34 });
    } catch {
      unknownTypeThrew = true;
    }
    ok(!unknownTypeThrew && received.length === beforeUnknownType,
      'service : publish ignore silencieusement un type inconnu');

    const beforeInvalidUpdates = received.length;
    let invalidUpdateThrew = false;
    const invalidApplications = [
      null,
      {},
      { id: 0, listingId: 12 },
      { id: 34, listingId: '12' },
      { get id() { throw new Error('getter en panne'); }, listingId: 12 },
    ];
    for (const invalidApplication of invalidApplications) {
      try {
        realtimeService.publishApplicationUpdate(
          invalidApplication,
          realtimeService.EVENT_TYPES.APPLICATION_ACCEPTED
        );
      } catch {
        invalidUpdateThrew = true;
      }
    }
    ok(!invalidUpdateThrew && received.length === beforeInvalidUpdates,
      'service : transition invalide ignoree sans exception ni diffusion');

    const beforeUnsubscribe = received.length;
    unsubscribe();
    unsubscribe();
    realtimeService.publish(listingChannel, { type: 'application-created', applicationId: 35 });
    ok(received.length === beforeUnsubscribe, 'service : desabonnement idempotent et definitif');

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

    // --- 2. Garde ecole et transport SSE ---
    const school = await prisma.school.create({
      data: {
        email: `m.school.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'M Ecole',
        siret: `6${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(school.id);
    const listing = await prisma.listing.create({
      data: {
        title: `Lot M annonce ${STAMP}`,
        description: 'Annonce de test temps reel',
        city: 'Marseille',
        department: '13',
        schoolId: school.id,
        titleLower: `lot m annonce ${STAMP}`,
        descriptionLower: 'annonce de test temps reel',
        cityLower: 'marseille',
      },
    });

    let r = await req(makeJar(), 'GET', `/mes-annonces/${listing.id}/candidatures/temps-reel`, {
      headers: { accept: 'text/event-stream' },
    });
    ok(r.status === 204, 'auth : flux ecole sans session -> 204 sans reconnexion');

    r = await req(makeJar(), 'GET', `/mes-annonces/${listing.id}/candidatures/999/carte`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 401, 'auth : fragment ecole sans session -> 401');

    r = await req(makeJar(), 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(r.status === 302 && r.location === '/connexion',
      'auth : navigation HTML sans session conserve la redirection');

    const staleSchool = await prisma.school.create({
      data: {
        email: `m.stale.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'M Ecole supprimee',
        siret: `4${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    const staleJar = makeJar();
    r = await req(staleJar, 'GET', '/connexion');
    r = await req(staleJar, 'POST', '/connexion', form({
      _csrf: csrfFrom(r.text), email: staleSchool.email, password: 'motdepasse123',
    }));
    await prisma.school.delete({ where: { id: staleSchool.id } });
    r = await req(staleJar, 'GET', '/mes-annonces/999/candidatures/temps-reel', {
      headers: { accept: 'text/event-stream' },
    });
    ok(r.status === 204, 'auth : ecole supprimee en session -> flux 204 apres destruction');

    const schoolJar = makeJar();
    r = await req(schoolJar, 'GET', '/connexion');
    r = await req(schoolJar, 'POST', '/connexion', form({
      _csrf: csrfFrom(r.text), email: school.email, password: 'motdepasse123',
    }));
    ok(r.status === 302, 'auth : connexion ecole pour le flux');

    const stream = await openSse(schoolJar, `/mes-annonces/${listing.id}/candidatures/temps-reel`);
    const channel = realtimeService.listingChannel(listing.id);
    ok(stream.response.headers['content-type'].startsWith('text/event-stream')
      && stream.response.headers['cache-control'] === 'no-store'
      && stream.response.headers['x-accel-buffering'] === 'no',
    'sse : en-tetes anti-cache et anti-buffering');
    ok(stream.body().includes('retry: 5000') && realtimeService.subscriberCount(channel) === 1,
      'sse : delai de reconnexion et abonnement actif');
    ok(await eventually(() => stream.body().includes(': heartbeat')),
      'sse : heartbeat emis pendant la connexion');

    stream.request.destroy();
    ok(await eventually(() => realtimeService.subscriberCount(channel) === 0),
      'sse : coupure cliente libere l abonnement');
    realtimeService.publish(channel, { type: 'application-created', applicationId: 999 });
    ok(realtimeService.subscriberCount(channel) === 0,
      'sse : publication apres close ne ressuscite pas le callback');

    const previousMaxConnection = process.env.REALTIME_MAX_CONNECTION_MS;
    process.env.REALTIME_MAX_CONNECTION_MS = '140';
    try {
      const timedStream = await openSse(schoolJar, `/mes-annonces/${listing.id}/candidatures/temps-reel`);
      ok(await eventually(() => timedStream.response.complete, 50, 10)
        && realtimeService.subscriberCount(channel) === 0,
      'sse : duree maximale de test ferme et nettoie le flux');
    } finally {
      process.env.REALTIME_MAX_CONNECTION_MS = previousMaxConnection;
    }

    // --- 3. Autorisation candidat liee a la session ---
    const applications = [];
    for (let i = 0; i < 6; i += 1) {
      applications.push(await prisma.application.create({
        data: {
          listingId: listing.id,
          applicantName: `Candidat M ${i}`,
          applicantEmail: `m.candidat.${STAMP}.${i}@example.test`,
          message: 'Candidature de test temps reel',
          trackingToken: `${String(i)}${String(STAMP).padStart(63, 'a')}`.slice(0, 64),
        },
      }));
    }

    const candidateJar = makeJar();
    r = await req(candidateJar, 'GET', `/suivi/${applications[0].trackingToken}`);
    ok(r.status === 200
      && r.text.includes(`/suivi/temps-reel/${applications[0].id}`)
      && r.text.includes(`/suivi/fragment/${applications[0].id}`)
      && !r.text.includes(`/suivi/temps-reel/${applications[0].trackingToken}`),
    'candidat : page lie la session avec des URLs temps reel sans jeton');

    r = await req(candidateJar, 'GET', `/suivi/fragment/${applications[0].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 200 && r.text.includes('En attente'),
      'candidat : fragment autorise rendu depuis la base');

    r = await req(makeJar(), 'GET', `/suivi/fragment/${applications[0].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 401, 'candidat : fragment sans liaison de session -> 401');

    r = await req(makeJar(), 'GET', `/suivi/temps-reel/${applications[0].id}`, {
      headers: { accept: 'text/event-stream' },
    });
    ok(r.status === 204, 'candidat : flux sans liaison de session -> 204');

    for (const application of applications.slice(1)) {
      r = await req(candidateJar, 'GET', `/suivi/${application.trackingToken}`);
      ok(r.status === 200, `candidat : ouverture du suivi ${application.id}`);
    }
    r = await req(candidateJar, 'GET', `/suivi/fragment/${applications[0].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 401, 'candidat : la sixieme liaison evince la plus ancienne');
    r = await req(candidateJar, 'GET', `/suivi/fragment/${applications[5].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 200, 'candidat : la liaison la plus recente reste autorisee');

    const expiredSid = sidFromJar(candidateJar);
    ok(Boolean(expiredSid), 'candidat : identifiant de session de test extrait');
    await prisma.session.deleteMany({ where: { sid: expiredSid } });
    r = await req(candidateJar, 'GET', `/suivi/fragment/${applications[5].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 401, 'candidat : session expiree -> fragment 401');
    r = await req(candidateJar, 'GET', `/suivi/temps-reel/${applications[5].id}`, {
      headers: { accept: 'text/event-stream' },
    });
    ok(r.status === 204, 'candidat : session expiree -> flux terminal 204');

    // --- 4. Partials et contexte ecole ---
    r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(r.status === 200
      && r.text.includes('data-realtime-context')
      && r.text.includes(`data-realtime-stream-url="/mes-annonces/${listing.id}/candidatures/temps-reel"`)
      && r.text.includes(`data-realtime-snapshot-url="/mes-annonces/${listing.id}/candidatures?page=1"`)
      && r.text.includes('role="status"')
      && r.text.includes('aria-live="polite"'),
    'vues : page ecole expose le contexte et l indicateur accessible');

    const displayedApplication = applications[5];
    r = await req(schoolJar, 'GET',
      `/mes-annonces/${listing.id}/candidatures/${displayedApplication.id}/carte`,
      { headers: { 'x-realtime-fragment': '1' } });
    ok(r.status === 200
      && r.text.includes(`data-application-card="${displayedApplication.id}"`)
      && r.text.includes(displayedApplication.applicantName),
    'vues : fragment carte rendu pour l ecole proprietaire');

    const otherSchool = await prisma.school.create({
      data: {
        email: `m.other.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'M Autre Ecole',
        siret: `5${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(otherSchool.id);
    const otherJar = makeJar();
    r = await req(otherJar, 'GET', '/connexion');
    r = await req(otherJar, 'POST', '/connexion', form({
      _csrf: csrfFrom(r.text), email: otherSchool.email, password: 'motdepasse123',
    }));
    r = await req(otherJar, 'GET',
      `/mes-annonces/${listing.id}/candidatures/${displayedApplication.id}/carte`,
      { headers: { 'x-realtime-fragment': '1' } });
    ok(r.status === 404, 'vues : fragment carte d une autre ecole -> 404');
    r = await req(otherJar, 'GET',
      `/mes-annonces/${listing.id}/candidatures/temps-reel`,
      { headers: { accept: 'text/event-stream' } });
    ok(r.status === 404, 'sse : flux d une annonce appartenant a une autre ecole -> 404');

    const secondListing = await prisma.listing.create({
      data: {
        title: `Lot M autre annonce ${STAMP}`,
        description: 'Autre annonce de la meme ecole',
        city: 'Marseille', department: '13', schoolId: school.id,
        titleLower: `lot m autre annonce ${STAMP}`,
        descriptionLower: 'autre annonce de la meme ecole', cityLower: 'marseille',
      },
    });
    r = await req(schoolJar, 'GET',
      `/mes-annonces/${secondListing.id}/candidatures/${displayedApplication.id}/carte`,
      { headers: { 'x-realtime-fragment': '1' } });
    ok(r.status === 404, 'vues : candidature et annonce incoherentes -> 404');

    r = await req(makeJar(), 'GET', `/suivi/${displayedApplication.trackingToken}`);
    ok(r.text.includes('data-realtime-status')
      && r.text.includes('Reconnexion en cours')
      && r.text.includes('/js/realtime.js'),
    'vues : suivi contient l indicateur et charge le client temps reel');

    // --- 5. Publications après les écritures métier ---
    transitionOrderProbe = installTransitionOrderProbe();
    const schoolEvents = await openSse(schoolJar, `/mes-annonces/${listing.id}/candidatures/temps-reel`);
    const publicJar = makeJar();
    r = await req(publicJar, 'GET', `/annonces/${listing.id}`);
    const beforeCreate = await prisma.application.count({
      where: { listingId: listing.id, applicantEmail: { contains: `direct.m.${STAMP}` } },
    });
    r = await req(publicJar, 'POST', `/annonces/${listing.id}/postuler`, {
      body: applicationForm(csrfFrom(r.text), 'workflow'),
    });
    ok(r.status === 302 && await waitForSse(schoolEvents, 'application-created'),
      'evenements : depot persiste puis notifie l ecole');
    const liveApplication = await prisma.application.findFirst({
      where: { listingId: listing.id, applicantEmail: `direct.m.${STAMP}.workflow@example.test` },
      include: { contract: true },
    });
    ok(beforeCreate === 0 && liveApplication && liveApplication.trackingToken,
      'evenements : candidature existe avec son jeton avant consommation du signal');
    ok(transitionOrderProbe.wasPublishedAfter(
      liveApplication.id,
      realtimeService.EVENT_TYPES.APPLICATION_CREATED
    ), 'ordre : application-created publiee apres la candidature persistee');

    const liveCandidateJar = makeJar();
    r = await req(liveCandidateJar, 'GET', `/suivi/${liveApplication.trackingToken}`);
    const candidateEvents = await openSse(liveCandidateJar, `/suivi/temps-reel/${liveApplication.id}`);

    r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures/${liveApplication.id}/accepter`);
    r = await req(schoolJar, 'POST', `/mes-annonces/${listing.id}/candidatures/${liveApplication.id}/accepter`,
      form(contractValues(csrfFrom(r.text))));
    ok(r.status === 302 && await waitForSse(candidateEvents, 'application-accepted'),
      'evenements : acceptation et contrat persistes puis candidat notifie');
    let liveContract = await prisma.contract.findUnique({ where: { applicationId: liveApplication.id } });
    ok(liveContract && liveContract.schoolSignedAt,
      'evenements : signal accepte correspond a un contrat en base');
    ok(transitionOrderProbe.wasPublishedAfter(
      liveApplication.id,
      realtimeService.EVENT_TYPES.APPLICATION_ACCEPTED
    ), 'ordre : application-accepted publiee apres contrat et statut persistes');

    const originalInvitation = mailer.sendSignatureInvitation;
    mailer.sendSignatureInvitation = async () => true;
    try {
      r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
      r = await req(schoolJar, 'POST',
        `/mes-annonces/${listing.id}/candidatures/${liveApplication.id}/contrat/envoyer`,
        form({ _csrf: csrfFrom(r.text) }));
      ok(r.status === 302 && await waitForSse(candidateEvents, 'contract-sent'),
        'evenements : invitation reussie notifie le candidat');
      liveContract = await prisma.contract.findUnique({ where: { applicationId: liveApplication.id } });
      ok(liveContract.sentToApplicantAt instanceof Date,
        'evenements : contract-sent est publie apres markSent');
      ok(transitionOrderProbe.wasPublishedAfter(
        liveApplication.id,
        realtimeService.EVENT_TYPES.CONTRACT_SENT
      ), 'ordre : contract-sent publie apres markSent persiste');

      const sentEventsBeforeFailure = (candidateEvents.body().match(/"type":"contract-sent"/g) || []).length;
      const sentPublicationsBeforeFailure = transitionOrderProbe.publicationCount(
        liveApplication.id,
        realtimeService.EVENT_TYPES.CONTRACT_SENT
      );
      mailer.sendSignatureInvitation = async () => false;
      r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
      r = await req(schoolJar, 'POST',
        `/mes-annonces/${listing.id}/candidatures/${liveApplication.id}/contrat/envoyer`,
        form({ _csrf: csrfFrom(r.text) }));
      await wait(80);
      const sentEventsAfterFailure = (candidateEvents.body().match(/"type":"contract-sent"/g) || []).length;
      const sentPublicationsAfterFailure = transitionOrderProbe.publicationCount(
        liveApplication.id,
        realtimeService.EVENT_TYPES.CONTRACT_SENT
      );
      ok(r.status === 302 && sentEventsAfterFailure === sentEventsBeforeFailure,
        'evenements : echec email ne publie pas contract-sent');
      ok(sentPublicationsAfterFailure === sentPublicationsBeforeFailure,
        'ordre : echec email ne declenche aucun appel de publication contract-sent');
    } finally {
      mailer.sendSignatureInvitation = originalInvitation;
    }

    r = await req(liveCandidateJar, 'GET', `/suivi/${liveApplication.trackingToken}/signer`);
    r = await req(liveCandidateJar, 'POST', `/suivi/${liveApplication.trackingToken}/signer`, form({
      _csrf: csrfFrom(r.text), accept: '1', signatureData: SIGNATURE_PNG,
    }));
    ok(r.status === 302 && await waitForSse(schoolEvents, 'contract-signed'),
      'evenements : contreseing persiste puis notifie l ecole');
    liveContract = await prisma.contract.findUnique({ where: { applicationId: liveApplication.id } });
    ok(liveContract.applicantSignedAt instanceof Date && Boolean(liveContract.signedPdfPath),
      'evenements : signal signe correspond au PDF final en base');
    ok(transitionOrderProbe.wasPublishedAfter(
      liveApplication.id,
      realtimeService.EVENT_TYPES.CONTRACT_SIGNED
    ), 'ordre : contract-signed publie apres signature, PDF final et empreinte persistes');

    const rejectedApplication = await prisma.application.create({
      data: {
        listingId: listing.id,
        applicantName: 'Refus M',
        applicantEmail: `refus.m.${STAMP}@example.test`,
        message: 'Candidature a refuser',
        trackingToken: `f${String(STAMP).padStart(63, 'f')}`.slice(0, 64),
      },
    });
    const rejectedJar = makeJar();
    await req(rejectedJar, 'GET', `/suivi/${rejectedApplication.trackingToken}`);
    const rejectedEvents = await openSse(rejectedJar, `/suivi/temps-reel/${rejectedApplication.id}`);
    r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    r = await req(schoolJar, 'POST',
      `/mes-annonces/${listing.id}/candidatures/${rejectedApplication.id}/refuser`,
      form({ _csrf: csrfFrom(r.text) }));
    ok(r.status === 302 && await waitForSse(rejectedEvents, 'application-rejected'),
      'evenements : refus persiste puis notifie le candidat');
    const rejectedRow = await prisma.application.findUnique({ where: { id: rejectedApplication.id } });
    ok(rejectedRow.status === 'rejected' && rejectedRow.rejectedAt instanceof Date,
      'evenements : signal refuse correspond a l etat RGPD en base');
    ok(transitionOrderProbe.wasPublishedAfter(
      rejectedApplication.id,
      realtimeService.EVENT_TYPES.APPLICATION_REJECTED
    ), 'ordre : application-rejected publiee apres statut et rejectedAt persistes');

    // --- 6. Simulation Node du client, sans prétendre couvrir un vrai navigateur ---
    const browserCalls = [];
    const candidateDom = makeRealtimeDom();
    const candidateBrowser = loadRealtimeScript(candidateDom, async (url, options) => {
      browserCalls.push({ url, options });
      return { ok: true, status: 200, redirected: false, text: async () => '<section></section>' };
    });
    ok(candidateBrowser.sources.length === 1
      && candidateBrowser.sources[0].url === '/flux-sans-jeton',
    'js vm : un seul EventSource ouvert sur l URL sans jeton');

    const duplicateDom = makeRealtimeDom();
    duplicateDom.document.querySelectorAll = function queryDuplicateContexts(selector) {
      return selector === '[data-realtime-context]'
        ? [duplicateDom.context, duplicateDom.context]
        : [];
    };
    const duplicateBrowser = loadRealtimeScript(duplicateDom, async () => ({
      ok: true, status: 200, redirected: false, text: async () => '<section></section>',
    }));
    ok(duplicateBrowser.sources.length === 1,
      'js vm : un seul EventSource maximum est cree par page');

    candidateBrowser.sources[0].open();
    ok(await eventually(() => browserCalls.length === 1)
      && browserCalls[0].options.headers['X-Realtime-Fragment'] === '1'
      && candidateDom.statusText.textContent === 'Actualisation en direct',
    'js vm : open actualise le fragment et l indicateur');
    candidateBrowser.sources[0].open();
    ok(await eventually(() => browserCalls.length === 2),
      'js vm : chaque reconnexion rattrape l etat courant');

    candidateBrowser.sources[0].error(0);
    ok(candidateDom.statusText.textContent === 'Reconnexion en cours',
      'js vm : coupure recuperable annonce la reconnexion');
    candidateBrowser.sources[0].error(2);
    ok(candidateDom.statusText.textContent.includes('Temps réel indisponible')
      && candidateBrowser.sources[0].closed,
    'js vm : etat terminal ferme la source sans boucle maison');

    let unauthorizedCalls = 0;
    const unauthorizedDom = makeRealtimeDom();
    const unauthorizedBrowser = loadRealtimeScript(unauthorizedDom, async () => {
      unauthorizedCalls += 1;
      return { ok: false, status: 401, redirected: false, text: async () => '' };
    });
    unauthorizedBrowser.sources[0].open();
    ok(await eventually(() => unauthorizedBrowser.sources[0].closed)
      && unauthorizedCalls === 1
      && unauthorizedDom.statusText.textContent.includes('Temps réel indisponible'),
    'js vm : fragment 401 provoque un arret unique et explicite');

    let forbiddenCalls = 0;
    const forbiddenDom = makeRealtimeDom();
    const forbiddenBrowser = loadRealtimeScript(forbiddenDom, async () => {
      forbiddenCalls += 1;
      return { ok: false, status: 403, redirected: false, text: async () => '' };
    });
    forbiddenBrowser.sources[0].open();
    ok(await eventually(() => forbiddenBrowser.sources[0].closed)
      && forbiddenCalls === 1
      && forbiddenDom.statusText.textContent.includes('Temps réel indisponible'),
    'js vm : fragment 403 provoque un arret unique et explicite');

    const failedFragmentDom = makeRealtimeDom();
    const failedFragmentBrowser = loadRealtimeScript(failedFragmentDom, async () => ({
      ok: false, status: 500, redirected: false, text: async () => '',
    }));
    failedFragmentBrowser.sources[0].open();
    ok(await eventually(() => failedFragmentDom.statusText.textContent
      .includes('Temps réel indisponible'))
      && !failedFragmentBrowser.sources[0].closed
      && failedFragmentDom.statusText.textContent.includes('Temps réel indisponible'),
    'js vm : echec transitoire du fragment conserve la source ouverte');

    const focusDom = makeRealtimeDom({ focused: true });
    const focusBrowser = loadRealtimeScript(focusDom, async () => ({
      ok: true, status: 200, redirected: false, text: async () => '<section></section>',
    }));
    focusBrowser.sources[0].open();
    ok(await eventually(() => focusDom.update.hidden === false)
      && focusDom.current.replacements === 0,
    'js vm : cible focalisee non remplacee, bandeau d actualisation affiche');

    const schoolDom = makeRealtimeDom({ mode: 'school' });
    const schoolBrowser = loadRealtimeScript(schoolDom, async () => ({
      ok: true, status: 200, redirected: false, text: async () => '<li></li>',
    }));
    schoolBrowser.sources[0].open();
    await eventually(() => schoolDom.current.replacements === 1);
    schoolBrowser.sources[0].invalidate({ type: 'application-created', applicationId: 987 });
    ok(await eventually(() => schoolDom.list.prepended === 1)
      && schoolDom.update.hidden === false,
    'js vm : nouvelle candidature inseree en page 1 avec invitation a rafraichir');

    const secondPageDom = makeRealtimeDom({ mode: 'school', page: '2' });
    const secondPageBrowser = loadRealtimeScript(secondPageDom, async () => ({
      ok: true, status: 200, redirected: false, text: async () => '<li></li>',
    }));
    secondPageBrowser.sources[0].open();
    await eventually(() => secondPageDom.current.replacements === 1);
    secondPageBrowser.sources[0].invalidate({ type: 'application-created', applicationId: 988 });
    ok(await eventually(() => secondPageDom.update.hidden === false)
      && secondPageDom.list.prepended === 0,
    'js vm : page ulterieure conserve sa pagination et affiche le bandeau');

    r = await req(makeJar(), 'GET', `/suivi/${displayedApplication.trackingToken}`);
    ok(r.text.includes('/js/realtime.js')
      && r.text.includes('role="status"')
      && r.text.includes('aria-live="polite"'),
    'structure : suivi charge le script externe et les regions accessibles');
    r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(r.text.includes('/js/realtime.js') && !r.text.includes('<script>'),
      'structure : page ecole respecte la CSP sans script inline');

    // --- 7. Revue des courses et des erreurs transitoires du client ---
    const reviewChecks = [];

    const distinctCardsDom = makeRealtimeDom({ mode: 'school', cardIds: [901, 902] });
    const distinctCardRequests = [];
    const distinctCardsBrowser = loadRealtimeScript(distinctCardsDom, () => {
      const request = deferred();
      distinctCardRequests.push(request);
      return request.promise;
    });
    distinctCardsBrowser.sources[0].invalidate({
      type: 'application-accepted', applicationId: 901,
    });
    distinctCardsBrowser.sources[0].invalidate({
      type: 'application-rejected', applicationId: 902,
    });
    await resolveDeferredRequests(distinctCardRequests, 2);
    reviewChecks.push({
      condition: await eventually(() => (
        distinctCardsDom.cards['901'].replacements === 1
        && distinctCardsDom.cards['902'].replacements === 1
      )),
      label: 'js vm revue : deux cartes distinctes sont toutes les deux actualisees',
    });

    const snapshotThenCardDom = makeRealtimeDom({ mode: 'school', cardIds: [903] });
    const snapshotThenCardRequests = [];
    const snapshotThenCardBrowser = loadRealtimeScript(snapshotThenCardDom, () => {
      const request = deferred();
      snapshotThenCardRequests.push(request);
      return request.promise;
    });
    snapshotThenCardBrowser.sources[0].open();
    snapshotThenCardBrowser.sources[0].invalidate({
      type: 'contract-signed', applicationId: 903,
    });
    await resolveDeferredRequests(snapshotThenCardRequests, 2);
    reviewChecks.push({
      condition: await eventually(() => (
        snapshotThenCardDom.current.replacements === 1
        && snapshotThenCardDom.cards['903'].replacements === 1
      )),
      label: 'js vm revue : le snapshot open et la carte suivante sont tous deux appliques',
    });

    const serialDom = makeRealtimeDom();
    const serialRequests = [];
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const serialBrowser = loadRealtimeScript(serialDom, () => {
      const request = deferred();
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      serialRequests.push(request);
      return request.promise.finally(() => { activeRequests -= 1; });
    }, { withAbortController: false });
    serialBrowser.sources[0].open();
    serialBrowser.sources[0].invalidate({ type: 'application-accepted', applicationId: 904 });
    await eventually(() => serialRequests.length >= 1);
    if (serialRequests.length >= 2) {
      serialRequests[1].resolve(fragmentResponse());
      await eventually(() => serialDom.current.replacements === 1);
      serialRequests[0].reject(new Error('ancienne requete en echec'));
    } else {
      serialRequests[0].reject(new Error('premiere requete en echec'));
      await eventually(() => serialRequests.length >= 2);
      if (serialRequests[1]) serialRequests[1].resolve(fragmentResponse());
    }
    reviewChecks.push({
      condition: await eventually(() => (
        maximumActiveRequests === 1
        && serialDom.current.replacements === 1
        && serialDom.status.attrs['data-state'] === 'live'
        && !serialBrowser.sources[0].closed
      )),
      label: 'js vm revue : sans AbortController la file evite erreur obsolete et concurrence',
    });

    async function transientFailureRecovers(firstFetch) {
      const transientDom = makeRealtimeDom();
      let calls = 0;
      const transientBrowser = loadRealtimeScript(transientDom, () => {
        calls += 1;
        return calls === 1 ? firstFetch() : Promise.resolve(fragmentResponse());
      });
      transientBrowser.sources[0].open();
      await eventually(() => transientDom.status.attrs['data-state'] === 'unavailable');
      const stayedOpenWithFallback = !transientBrowser.sources[0].closed
        && transientDom.update.hidden === false;
      transientBrowser.sources[0].invalidate({
        type: 'application-accepted', applicationId: 905,
      });
      const recovered = await eventually(() => (
        calls === 2
        && transientDom.current.replacements === 1
        && transientDom.status.attrs['data-state'] === 'live'
      ));
      return stayedOpenWithFallback && recovered && !transientBrowser.sources[0].closed;
    }

    reviewChecks.push({
      condition: await transientFailureRecovers(() => Promise.resolve({
        ok: false, status: 500, redirected: false, text: async () => '',
      })),
      label: 'js vm revue : un fragment 500 reste transitoire puis recupere',
    });
    reviewChecks.push({
      condition: await transientFailureRecovers(() => Promise.reject(new Error('reseau coupe'))),
      label: 'js vm revue : un rejet reseau reste transitoire puis recupere',
    });
    reviewChecks.push({
      condition: await transientFailureRecovers(() => Promise.resolve(
        fragmentResponse('<section data-missing-root></section>')
      )),
      label: 'js vm revue : une racine absente reste transitoire puis recupere',
    });
    reviewChecks.push({
      condition: await transientFailureRecovers(() => Promise.resolve(
        fragmentResponse('<section data-script-fragment><script></script></section>')
      )),
      label: 'js vm revue : un fragment avec script est refuse sans fermer le flux',
    });

    async function terminalAuthorizationClosesOnce(status) {
      const terminalDom = makeRealtimeDom();
      const terminalBrowser = loadRealtimeScript(terminalDom, async () => ({
        ok: false, status, redirected: false, text: async () => '',
      }));
      terminalBrowser.sources[0].open();
      await eventually(() => terminalBrowser.sources[0].closed);
      terminalBrowser.sources[0].error(2);
      return terminalBrowser.sources[0].closeCalls === 1
        && terminalDom.status.attrs['data-state'] === 'unavailable';
    }
    reviewChecks.push({
      condition: await terminalAuthorizationClosesOnce(401),
      label: 'js vm revue : 401 ferme la source une seule fois',
    });
    reviewChecks.push({
      condition: await terminalAuthorizationClosesOnce(403),
      label: 'js vm revue : 403 ferme la source une seule fois',
    });

    const lateSuccessDom = makeRealtimeDom({ mode: 'school' });
    const lateSuccessRequest = deferred();
    const lateSuccessBrowser = loadRealtimeScript(
      lateSuccessDom,
      () => lateSuccessRequest.promise
    );
    lateSuccessBrowser.sources[0].open();
    await wait(0);
    lateSuccessBrowser.sources[0].error(2);
    lateSuccessBrowser.sources[0].error(2);
    lateSuccessRequest.resolve(fragmentResponse());
    await wait(20);
    reviewChecks.push({
      condition: lateSuccessBrowser.sources[0].closeCalls === 1
        && lateSuccessDom.status.attrs['data-state'] === 'unavailable'
        && lateSuccessDom.current.replacements === 0
        && lateSuccessDom.list.prepended === 0
        && lateSuccessDom.announcement.textContent === '',
      label: 'js vm revue : un succes tardif apres fermeture terminale reste inerte',
    });

    const lateFailureDom = makeRealtimeDom();
    const lateFailureRequest = deferred();
    const lateFailureBrowser = loadRealtimeScript(
      lateFailureDom,
      () => lateFailureRequest.promise
    );
    lateFailureBrowser.sources[0].open();
    await wait(0);
    lateFailureBrowser.sources[0].error(2);
    lateFailureRequest.reject(new Error('rejet apres fermeture terminale'));
    await wait(20);
    reviewChecks.push({
      condition: lateFailureBrowser.sources[0].closeCalls === 1
        && lateFailureDom.status.attrs['data-state'] === 'unavailable'
        && lateFailureDom.current.replacements === 0
        && lateFailureDom.update.hidden === true,
      label: 'js vm revue : un rejet tardif apres fermeture terminale reste inerte',
    });

    async function focusedSnapshotRecovery(mode) {
      const focusedDom = makeRealtimeDom({ mode, focused: true });
      let calls = 0;
      const focusedBrowser = loadRealtimeScript(focusedDom, async () => {
        calls += 1;
        if (calls === 1) {
          return { ok: false, status: 500, redirected: false, text: async () => '' };
        }
        return fragmentResponse();
      });
      focusedBrowser.sources[0].open();
      await eventually(() => focusedDom.status.attrs['data-state'] === 'unavailable');
      focusedBrowser.sources[0].invalidate({ type: 'application-accepted' });
      const liveRestored = await eventually(() => (
        calls === 2 && focusedDom.status.attrs['data-state'] === 'live'
      ));
      return liveRestored
        && !focusedBrowser.sources[0].closed
        && focusedDom.current.replacements === 0
        && focusedDom.update.hidden === false;
    }
    reviewChecks.push({
      condition: await focusedSnapshotRecovery('candidate'),
      label: 'js vm revue : succes candidat sous focus restaure live sans remplacement',
    });
    reviewChecks.push({
      condition: await focusedSnapshotRecovery('school'),
      label: 'js vm revue : succes snapshot ecole sous focus restaure live sans remplacement',
    });

    const focusedCardDom = makeRealtimeDom({
      mode: 'school', cardIds: [906], focusedCardId: 906,
    });
    const focusedCardBrowser = loadRealtimeScript(focusedCardDom, async () => fragmentResponse());
    focusedCardBrowser.sources[0].invalidate({
      type: 'application-accepted', applicationId: 906,
    });
    reviewChecks.push({
      condition: await eventually(() => (
        focusedCardDom.update.hidden === false
        && focusedCardDom.cards['906'].replacements === 0
      )),
      label: 'js vm revue : une carte focalisee conserve le focus et affiche le bandeau',
    });

    let fallbackWithoutFetch = true;
    try {
      const script = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'realtime.js'), 'utf8'
      );
      vm.runInNewContext(script, {
        module: { exports: {} },
        document: makeRealtimeDom().document,
        window: {},
        console,
      });
    } catch {
      fallbackWithoutFetch = false;
    }
    reviewChecks.push({
      condition: fallbackWithoutFetch,
      label: 'js vm revue : sans window.fetch le HTML de repli reste utilisable',
    });

    const reviewFailures = reviewChecks.filter((check) => !check.condition);
    if (reviewFailures.length) {
      throw new Error(`ECHEC REVUE : ${reviewFailures.map((check) => check.label).join(' ; ')}`);
    }
    for (const check of reviewChecks) ok(true, check.label);

    schoolEvents.request.destroy();
    candidateEvents.request.destroy();
    rejectedEvents.request.destroy();

    console.log(`\n✅ Lot M tests reussis - ${passed} assertions.`);
  } finally {
    if (transitionOrderProbe) transitionOrderProbe.restore();
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
