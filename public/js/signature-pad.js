// Pad de signature (canvas) partagé : formulaire de contrat (école) et page de
// signature du candidat. Trace au pointeur (souris/tactile), importe une image
// PNG/JPEG dans le canvas, bouton « Effacer », puis export PNG dans #signatureData.
(function () {
  var canvas = document.querySelector('canvas[data-signature-pad]');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var field = document.getElementById('signatureData');
  var clearBtn = document.querySelector('[data-signature-clear]');
  var importBtn = document.querySelector('[data-signature-import-trigger]');
  var importInput = document.querySelector('[data-signature-import]');
  var errorEl = document.querySelector('[data-signature-error]');
  var form = canvas.closest('form');
  var drawing = false;
  var dirty = false;
  var MAX_IMPORT_BYTES = 200 * 1024;

  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1f2937';

  function setError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function markDirty() {
    dirty = true;
    setError('');
  }

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function clearSignature() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty = false;
    if (field) field.value = '';
    if (importInput) importInput.value = '';
    setError('');
  }

  function drawImportedImage(img) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    var w = img.width * scale;
    var h = img.height * scale;
    var x = (canvas.width - w) / 2;
    var y = (canvas.height - h) / 2;
    ctx.drawImage(img, x, y, w, h);
    markDirty();
    if (field) field.value = canvas.toDataURL('image/png');
  }

  canvas.addEventListener('pointerdown', function (e) {
    drawing = true;
    markDirty();
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
    clearBtn.addEventListener('click', clearSignature);
  }

  if (importBtn && importInput) {
    importBtn.addEventListener('click', function () {
      importInput.click();
    });
    importInput.addEventListener('change', function () {
      var file = importInput.files && importInput.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg)$/.test(file.type || '')) {
        setError('Image illisible — importez un PNG ou un JPEG.');
        importInput.value = '';
        return;
      }
      if (file.size > MAX_IMPORT_BYTES) {
        setError('Image trop volumineuse — choisissez un fichier de moins de 200 Ko.');
        importInput.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        setError('Image illisible — importez un PNG ou un JPEG.');
      };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () {
          setError('Image illisible — importez un PNG ou un JPEG.');
          importInput.value = '';
        };
        img.onload = function () {
          drawImportedImage(img);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      if (!dirty) {
        setError('Veuillez dessiner ou importer votre signature avant de valider.');
        e.preventDefault();
        return;
      }
      setError('');
      if (field) field.value = canvas.toDataURL('image/png');
    });
  }
})();
