// Verification SIRET en direct sur le formulaire d'inscription : a 14 chiffres saisis
// (debounce 400 ms), interroge le relais interne /api/siret/ puis pre-remplit raison
// sociale et adresse UNIQUEMENT si les champs sont vides (on n'ecrase jamais une
// saisie). Jamais bloquant : le serveur re-verifie de toute facon au submit.
(function () {
  var siret = document.getElementById('siret');
  var status = document.getElementById('siret-status');
  var businessName = document.getElementById('businessName');
  var address = document.getElementById('address');
  if (!siret || !status) return;

  var timer = null;
  var lastChecked = '';

  function show(text, okState) {
    status.hidden = false;
    status.textContent = text;
    status.className = okState ? 'field-hint field-hint-ok' : 'field-hint field-hint-warn';
  }

  function check() {
    var digits = siret.value.replace(/\D/g, '');
    if (digits.length !== 14 || digits === lastChecked) return;
    lastChecked = digits;
    fetch('/api/siret/' + digits)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.status === 'verified') {
          show('✓ Établissement vérifié' + (data.name ? ' : ' + data.name : ''), true);
          if (businessName && !businessName.value && data.name) businessName.value = data.name;
          if (address && !address.value && data.address) address.value = data.address;
        } else if (data.status === 'closed') {
          show('Établissement fermé administrativement - vous pouvez tout de même vous inscrire.', false);
        } else if (data.status === 'not_found') {
          show('SIRET introuvable au répertoire Sirene - vérifiez la saisie.', false);
        } else {
          status.hidden = true; // panne / rate-limit : silencieux, jamais bloquant
        }
      })
      .catch(function () { status.hidden = true; });
  }

  siret.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(check, 400);
  });
})();
