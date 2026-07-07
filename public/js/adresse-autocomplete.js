// Autocomplete d'adresse non bloquante : suggestions officielles via le relais
// interne /api/adresse, avec datalist natif pour conserver une saisie libre.
(function () {
  var inputs = document.querySelectorAll('input[data-adresse-autocomplete]');
  if (!inputs || !inputs.length) return;

  var seq = 0;

  function clearList(list) {
    if (typeof list.replaceChildren === 'function') {
      list.replaceChildren();
      return;
    }
    while (list.firstChild) list.removeChild(list.firstChild);
  }

  function render(list, resultats) {
    clearList(list);
    if (!Array.isArray(resultats)) return;
    resultats.forEach(function (item) {
      var label = item && item.label ? String(item.label) : '';
      if (!label) return;
      var option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      list.appendChild(option);
    });
  }

  Array.prototype.forEach.call(inputs, function (input) {
    var list = document.createElement('datalist');
    var id = input.getAttribute('list') || input.getAttribute('id') || ('adresse-autocomplete-' + seq);
    seq += 1;
    if (id.indexOf('adresse-autocomplete-') !== 0) id += '-adresse-autocomplete';
    list.setAttribute('id', id);
    input.setAttribute('list', id);
    (input.parentNode || document.body).appendChild(list);

    var debounceMs = Number(input.getAttribute('data-debounce-ms')) || 300;
    var timer = null;
    var controller = null;
    var lastQuery = '';

    function search() {
      var q = String(input.value || '').trim();
      if (q.length < 3) {
        clearList(list);
        return;
      }
      if (q === lastQuery) return;
      lastQuery = q;

      if (controller) controller.abort();
      controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

      fetch('/api/adresse?q=' + encodeURIComponent(q), controller ? { signal: controller.signal } : undefined)
        .then(function (res) { return res.ok ? res.json() : { resultats: [] }; })
        .then(function (data) { render(list, data.resultats); })
        .catch(function () {
          // Panne reseau, API lente ou requete annulee : l'utilisateur continue a saisir.
        });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(search, debounceMs);
    });
  });
})();
