'use strict';

(function () {
  var TEXTS = {
    live: 'Actualisation en direct',
    connecting: 'Reconnexion en cours',
    unavailable: 'Temps réel indisponible — actualisez la page si nécessaire',
  };

  function setState(context, state) {
    var status = context.querySelector('[data-realtime-status]');
    if (!status) return;
    status.hidden = false;
    status.setAttribute('data-state', state);
    var text = status.querySelector('[data-realtime-status-text]');
    if (text) text.textContent = TEXTS[state] || TEXTS.unavailable;
  }

  function announce(context, message) {
    var region = context.querySelector('[data-realtime-announcement]');
    if (region) region.textContent = message || '';
  }

  function showUpdate(context) {
    var update = context.querySelector('[data-realtime-update]');
    if (update) update.hidden = false;
    announce(context, 'Une mise à jour est disponible. Actualisez la page.');
  }

  function messageFor(type) {
    var messages = {
      'application-created': 'Une nouvelle candidature a été reçue.',
      'application-accepted': 'La candidature a été acceptée.',
      'application-rejected': 'La candidature a été refusée.',
      'contract-sent': 'Le contrat est maintenant prêt à signer.',
      'contract-signed': 'Le contrat a été signé par le candidat.',
    };
    return messages[type] || 'La candidature a été mise à jour.';
  }

  function startRealtime(context, doc, win, fetchImpl, EventSourceCtor, ParserCtor) {
    var mode = context.getAttribute('data-realtime-mode');
    var streamUrl = context.getAttribute('data-realtime-stream-url');
    var snapshotUrl = context.getAttribute('data-realtime-snapshot-url');
    var cardTemplate = context.getAttribute('data-realtime-card-url-template');
    var page = context.getAttribute('data-realtime-page') || '1';
    if (!streamUrl || !snapshotUrl || !EventSourceCtor || !fetchImpl || !ParserCtor) return null;

    setState(context, 'connecting');
    var source = new EventSourceCtor(streamUrl);
    var queue = [];
    var pendingByKey = Object.create(null);
    var running = false;
    var stopped = false;

    function closeSource() {
      if (stopped) return;
      stopped = true;
      queue.length = 0;
      pendingByKey = Object.create(null);
      source.close();
    }

    function stopAsUnavailable() {
      closeSource();
      setState(context, 'unavailable');
    }

    function parsedNode(html, selector) {
      var parsed = new ParserCtor().parseFromString(html, 'text/html');
      var node = parsed.querySelector(selector);
      if (!node || (node.querySelector && node.querySelector('script'))) {
        throw new Error('Fragment temps reel invalide.');
      }
      return doc.importNode ? doc.importNode(node, true) : node;
    }

    function fetchNode(url, selector) {
      return fetchImpl(url, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html', 'X-Realtime-Fragment': '1' },
      }).then(function (response) {
        if (stopped) return null;
        if (response.status === 401 || response.status === 403) {
          var unauthorized = new Error('Session temps reel expiree.');
          unauthorized.code = 'UNAUTHORIZED';
          throw unauthorized;
        }
        if (!response.ok || response.redirected) throw new Error('Fragment temps reel indisponible.');
        return response.text();
      }).then(function (html) {
        if (stopped || html === null) return null;
        return parsedNode(html, selector);
      });
    }

    function replaceWithoutStealingFocus(current, next) {
      var active = doc.activeElement;
      if (active && active !== doc.body && current.contains && current.contains(active)) {
        showUpdate(context);
        return false;
      }
      current.replaceWith(next);
      return true;
    }

    function handleFetchError(err) {
      if (stopped) return;
      if (err && err.code === 'UNAUTHORIZED') {
        stopAsUnavailable();
        return;
      }
      setState(context, 'unavailable');
      showUpdate(context);
    }

    function drainQueue() {
      if (running || stopped) return;
      var task = queue.shift();
      if (!task) return;
      delete pendingByKey[task.key];
      running = true;
      Promise.resolve().then(function () {
        if (!stopped) return task.refresh();
        return null;
      }).catch(handleFetchError).then(function () {
        running = false;
        drainQueue();
      });
    }

    function enqueueRefresh(key, refresh) {
      if (stopped) return;
      var pending = pendingByKey[key];
      if (pending) {
        pending.refresh = refresh;
        return;
      }
      var task = { key: key, refresh: refresh };
      pendingByKey[key] = task;
      queue.push(task);
      drainQueue();
    }

    function refreshSnapshot(message) {
      var selector = mode === 'school' ? '[data-application-region]' : '[data-tracking-status]';
      var current = context.querySelector(selector);
      if (!current) return Promise.resolve();
      return fetchNode(snapshotUrl, selector).then(function (next) {
        if (stopped || !next) return;
        var replaced = replaceWithoutStealingFocus(current, next);
        if (stopped) return;
        setState(context, 'live');
        if (replaced && message) announce(context, message);
      });
    }

    function refreshSchoolCard(event) {
      var applicationId = event && event.applicationId;
      if (!cardTemplate || !Number.isInteger(applicationId) || applicationId <= 0) {
        return refreshSnapshot(messageFor(event && event.type));
      }
      var url = cardTemplate.replace('__APPLICATION_ID__', String(applicationId));
      return fetchNode(url, '[data-application-card]').then(function (next) {
        if (stopped || !next) return;
        var current = context.querySelector(`[data-application-card="${applicationId}"]`);
        if (current) {
          if (replaceWithoutStealingFocus(current, next)) announce(context, messageFor(event.type));
          return;
        }
        if (page !== '1' || event.type !== 'application-created') return showUpdate(context);
        var list = context.querySelector('[data-application-list]');
        if (!list) return showUpdate(context);
        list.prepend(next);
        var empty = context.querySelector('[data-application-empty]');
        if (empty) empty.remove();
        var update = context.querySelector('[data-realtime-update]');
        if (update) update.hidden = false;
        announce(context, messageFor(event.type));
      }).then(function () {
        if (!stopped) setState(context, 'live');
      });
    }

    source.onopen = function () {
      if (stopped) return;
      setState(context, 'live');
      enqueueRefresh('snapshot', function () { return refreshSnapshot(''); });
    };
    source.onerror = function () {
      if (stopped) return;
      if (source.readyState === 2) stopAsUnavailable();
      else setState(context, 'connecting');
    };
    source.addEventListener('invalidate', function (rawEvent) {
      var event;
      try {
        event = JSON.parse(rawEvent.data);
      } catch {
        return;
      }
      if (stopped) return;
      if (mode === 'school') {
        var applicationId = event && event.applicationId;
        var key = Number.isInteger(applicationId) && applicationId > 0
          ? `card:${applicationId}`
          : 'snapshot';
        enqueueRefresh(key, function () { return refreshSchoolCard(event); });
      } else {
        enqueueRefresh('snapshot', function () {
          return refreshSnapshot(messageFor(event.type));
        });
      }
    });
    function handlePagehide() {
      closeSource();
    }

    function handlePageshow(event) {
      if (!event || event.persisted !== true) return;
      win.removeEventListener('pagehide', handlePagehide);
      win.removeEventListener('pageshow', handlePageshow);
      startRealtime(context, doc, win, fetchImpl, EventSourceCtor, ParserCtor);
    }

    win.addEventListener('pagehide', handlePagehide);
    win.addEventListener('pageshow', handlePageshow);
    return source;
  }

  function initRealtime(doc, win, fetchImpl, EventSourceCtor, ParserCtor) {
    if (!doc || !win || !EventSourceCtor) return [];
    var contexts = doc.querySelectorAll('[data-realtime-context]');
    if (!contexts.length) return [];
    var source = startRealtime(contexts[0], doc, win, fetchImpl, EventSourceCtor, ParserCtor);
    return source ? [source] : [];
  }

  var api = { initRealtime: initRealtime, startRealtime: startRealtime, setState: setState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined'
      && typeof window !== 'undefined'
      && typeof window.fetch === 'function') {
    initRealtime(document, window, window.fetch.bind(window), window.EventSource, window.DOMParser);
  }
})();
