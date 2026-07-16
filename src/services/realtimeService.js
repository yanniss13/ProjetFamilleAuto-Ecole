'use strict';

// Bus mémoire local au processus. Les événements ne font qu'invalider une vue :
// la base Prisma reste la source de vérité après chaque reconnexion.
const subscribers = new Map();

const EVENT_TYPES = Object.freeze({
  APPLICATION_CREATED: 'application-created',
  APPLICATION_ACCEPTED: 'application-accepted',
  APPLICATION_REJECTED: 'application-rejected',
  CONTRACT_SENT: 'contract-sent',
  CONTRACT_SIGNED: 'contract-signed',
});
const ALLOWED_TYPES = new Set(Object.values(EVENT_TYPES));

function isPositiveId(id) {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

function positiveId(id) {
  if (!isPositiveId(id)) throw new TypeError('Identifiant temps reel invalide.');
  return id;
}

function listingChannel(id) {
  return `listing:${positiveId(id)}`;
}

function applicationChannel(id) {
  return `application:${positiveId(id)}`;
}

function subscribe(channel, callback) {
  if (typeof channel !== 'string' || typeof callback !== 'function') {
    throw new TypeError('Abonnement temps reel invalide.');
  }
  let channelSubscribers = subscribers.get(channel);
  if (!channelSubscribers) {
    channelSubscribers = new Set();
    subscribers.set(channel, channelSubscribers);
  }
  channelSubscribers.add(callback);
  let active = true;
  return function unsubscribe() {
    if (!active) return;
    active = false;
    channelSubscribers.delete(callback);
    if (channelSubscribers.size === 0) subscribers.delete(channel);
  };
}

function publish(channel, event) {
  let publicEvent;
  try {
    if (!event) return;
    const type = event.type;
    const applicationId = event.applicationId;
    if (!ALLOWED_TYPES.has(type) || !isPositiveId(applicationId)) return;
    publicEvent = Object.freeze({ type, applicationId });
  } catch {
    return;
  }
  const channelSubscribers = subscribers.get(channel);
  if (!channelSubscribers) return;
  for (const callback of [...channelSubscribers]) {
    try {
      callback(publicEvent);
    } catch {
      // Un navigateur parti entre deux écritures ne doit affecter ni les autres
      // abonnés ni l'action métier déjà validée en base.
    }
  }
}

function publishApplicationUpdate(application, type) {
  try {
    if (!application || !ALLOWED_TYPES.has(type)) return;
    const applicationId = positiveId(application.id);
    const listingId = positiveId(application.listingId);
    const event = { type, applicationId };
    publish(listingChannel(listingId), event);
    publish(applicationChannel(applicationId), event);
  } catch {
    // Une donnée métier incomplète ou inaccessible ne doit jamais faire échouer
    // l'action du contrôleur déjà validée en base.
  }
}

function subscriberCount(channel) {
  const channelSubscribers = subscribers.get(channel);
  return channelSubscribers ? channelSubscribers.size : 0;
}

function resetForTests() {
  subscribers.clear();
}

module.exports = {
  EVENT_TYPES,
  listingChannel,
  applicationChannel,
  subscribe,
  publish,
  publishApplicationUpdate,
  subscriberCount,
  _resetForTests: resetForTests,
};
