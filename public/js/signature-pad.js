// Pad de signature (canvas) partagé : formulaire de contrat (école) et page de
// signature du candidat. Trace au pointeur (souris/tactile), bouton « Effacer », et
// au submit exporte le dessin en PNG dans le champ caché #signatureData. Bloque le
// submit si le pad est vierge (message [data-signature-error]).
(function () {
  var canvas = document.querySelector('canvas[data-signature-pad]');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var field = document.getElementById('signatureData');
  var clearBtn = document.querySelector('[data-signature-clear]');
  var errorEl = document.querySelector('[data-signature-error]');
  var form = canvas.closest('form');
  var drawing = false;
  var dirty = false;

  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1f2937';

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('pointerdown', function (e) {
    drawing = true;
    dirty = true;
    canvas.setPointerCapture(e.pointerId);
    var p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    e.preventDefault();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { drawing = false; });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty = false;
      if (field) field.value = '';
    });
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      if (!dirty) {
        if (errorEl) errorEl.hidden = false;
        e.preventDefault();
        return;
      }
      if (errorEl) errorEl.hidden = true;
      if (field) field.value = canvas.toDataURL('image/png');
    });
  }
})();
