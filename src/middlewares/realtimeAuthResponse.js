'use strict';

function isSse(req) {
  return String(req.get('accept') || '').toLowerCase().includes('text/event-stream');
}

function isFragment(req) {
  return req.get('x-realtime-fragment') === '1';
}

function respond(req, res) {
  if (isSse(req)) {
    res.status(204).end();
    return true;
  }
  if (isFragment(req)) {
    res.status(401).end();
    return true;
  }
  return false;
}

module.exports = { isSse, isFragment, respond };
