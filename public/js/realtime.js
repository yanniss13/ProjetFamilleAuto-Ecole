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
    var requestNumber = 0;
    var controller = null;

    function stopAsUnavailable() {
      source.close();
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
      requestNumber += 1;
      var currentRequest = requestNumber;
      if (controller) controller.abort();
      controller = win.AbortController ? new win.AbortController() : null;
      return fetchImpl(url, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html', 'X-Realtime-Fragment': '1' },
        signal: controller ? controller.signal : undefined,
      }).then(function (response) {
        if (response.status === 401 || response.status === 403) {
          var unauthorized = new Error('Session temps reel expiree.');
          unauthorized.code = 'UNAUTHORIZED';
          throw unauthorized;
        }
        if (!response.ok || response.redirected) throw new Error('Fragment temps reel indisponible.');
        return response.text();
      }).then(function (html) {
        if (currentRequest !== requestNumber) return null;
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
      if (err && err.name === 'AbortError') return;
      stopAsUnavailable();
    }

    function refreshSnapshot(message) {
      var selector = mode === 'school' ? '[data-application-region]' : '[data-tracking-status]';
      var current = context.querySelector(selector);
      if (!current) return Promise.resolve();
      return fetchNode(snapshotUrl, selector).then(function (next) {
        if (!next) return;
        if (replaceWithoutStealingFocus(current, next)) {
          setState(context, 'live');
          if (message) announce(context, message);
        }
      }).catch(handleFetchError);
    }

    function refreshSchoolCard(event) {
      if (!cardTemplate || !event.applicationId) return refreshSnapshot(messageFor(event.type));
      var url = cardTemplate.replace('__APPLICATION_ID__', String(event.applicationId));
      return fetchNode(url, '[data-application-card]').then(function (next) {
        if (!next) return;
        var current = context.querySelector(`[data-application-card="${event.applicationId}"]`);
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
        setState(context, 'live');
      }).catch(handleFetchError);
    }

    source.onopen = function () {
      setState(context, 'live');
      refreshSnapshot('');
    };
    source.onerror = function () {
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
      if (mode === 'school') refreshSchoolCard(event);
      else refreshSnapshot(messageFor(event.type));
    });
    win.addEventListener('pagehide', function () { source.close(); });
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
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    initRealtime(document, window, window.fetch.bind(window), window.EventSource, window.DOMParser);
  }
})();
