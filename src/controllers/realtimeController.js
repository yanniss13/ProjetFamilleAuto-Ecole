'use strict';

const listingService = require('../services/listingService');
const applicationService = require('../services/applicationService');
const messageService = require('../services/messageService');
const realtimeService = require('../services/realtimeService');
const { parseId, notFound } = require('../utils/http');

function duration(name, fallback) {
  if (process.env.NODE_ENV !== 'test') return fallback;
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Plafonds de flux SSE simultanés : chaque flux garde une socket, un abonné et
// deux minuteries jusqu'à 5 minutes. Un onglet ouvre un flux ; au-delà, on
// répond 429 (EventSource ne se reconnecte pas sur un statut d'erreur).
const MAX_STREAMS_PER_SESSION = 5;
const MAX_STREAMS_TOTAL = 500;
const streamsBySession = new Map();
let streamsTotal = 0;

function reserveStream(req) {
  const key = req.sessionID || 'sans-session';
  const count = streamsBySession.get(key) || 0;
  if (count >= MAX_STREAMS_PER_SESSION || streamsTotal >= MAX_STREAMS_TOTAL) return null;
  streamsBySession.set(key, count + 1);
  streamsTotal += 1;
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    streamsTotal -= 1;
    const left = (streamsBySession.get(key) || 1) - 1;
    if (left > 0) streamsBySession.set(key, left);
    else streamsBySession.delete(key);
  };
}

function openStream(req, res, channel) {
  const release = reserveStream(req);
  if (!release) {
    res.status(429).set('Retry-After', '60').end();
    return;
  }
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n: connexion\n\n');

  const unsubscribe = realtimeService.subscribe(channel, (event) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: invalidate\ndata: ${JSON.stringify(event)}\n\n`);
    }
  });
  let cleaned = false;
  let heartbeat;
  let lifetime;

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    unsubscribe();
    release();
  }

  res.once('close', cleanup);
  heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': heartbeat\n\n');
  }, duration('REALTIME_HEARTBEAT_MS', 25_000));
  lifetime = setTimeout(() => {
    cleanup();
    if (!res.writableEnded && !res.destroyed) res.end();
  }, duration('REALTIME_MAX_CONNECTION_MS', 300_000));
  if (heartbeat.unref) heartbeat.unref();
  if (lifetime.unref) lifetime.unref();
}

async function schoolStream(req, res, next) {
  try {
    const listingId = parseId(req.params.id);
    if (!listingId) return notFound(res);
    const listing = await listingService.findOwnedById(req.school.id, listingId);
    if (!listing) return notFound(res);
    openStream(req, res, realtimeService.listingChannel(listingId));
  } catch (err) {
    next(err);
  }
}

function candidateIsAuthorized(req, applicationId) {
  return Boolean(req.session && Array.isArray(req.session.realtimeApplicationIds)
    && req.session.realtimeApplicationIds.includes(applicationId));
}

async function candidateStream(req, res, next) {
  try {
    const applicationId = parseId(req.params.applicationId);
    if (!applicationId || !candidateIsAuthorized(req, applicationId)) return res.status(204).end();
    const application = await applicationService.findByIdForTracking(applicationId);
    if (!application) return notFound(res);
    openStream(req, res, realtimeService.applicationChannel(applicationId));
  } catch (err) {
    next(err);
  }
}

async function candidateFragment(req, res, next) {
  try {
    const applicationId = parseId(req.params.applicationId);
    if (!applicationId || !candidateIsAuthorized(req, applicationId)) return res.status(401).end();
    const application = await applicationService.findByIdForTracking(applicationId);
    if (!application) return notFound(res);
    await messageService.markReadBy(application.id, 'applicant');
    res.render('tracking/_status', { application });
  } catch (err) {
    next(err);
  }
}

async function schoolCard(req, res, next) {
  try {
    const listingId = parseId(req.params.id);
    const applicationId = parseId(req.params.applicationId);
    if (!listingId || !applicationId) return notFound(res);
    const application = await applicationService.findOwnedById(req.school.id, applicationId);
    if (!application || application.listingId !== listingId) return notFound(res);
    res.render('dashboard/_application-card', {
      application,
      listing: application.listing,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  MAX_STREAMS_PER_SESSION,
  openStream,
  schoolStream,
  candidateStream,
  candidateFragment,
  schoolCard,
};
