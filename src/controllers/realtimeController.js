'use strict';

const listingService = require('../services/listingService');
const applicationService = require('../services/applicationService');
const realtimeService = require('../services/realtimeService');
const { parseId, notFound } = require('../utils/http');

function duration(name, fallback) {
  if (process.env.NODE_ENV !== 'test') return fallback;
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function openStream(req, res, channel) {
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
    res.render('tracking/_status', { application });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  openStream,
  schoolStream,
  candidateStream,
  candidateFragment,
};
