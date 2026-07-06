# Lot G+ — Import de signature dans les pads canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'école et au candidat de signer en dessinant ou en important une image de signature.

**Architecture:** Le formulaire continue de poster `signatureData` en `data:image/png;base64,...`. L'import est traité uniquement côté navigateur : le fichier image est chargé dans le canvas, redimensionné, puis exporté comme le dessin manuel. La validation serveur Lot G reste inchangée et demeure l'autorité finale.

**Tech Stack:** Node.js CommonJS, Express 5, Twig, JS vanilla statique CSP-compatible, tests HTTP `test/lot-g.cjs`.

## Global Constraints

- Spec de référence : `docs/superpowers/specs/2026-07-06-lot-g-import-signature-design.md`.
- Français partout ; typographie française dans les textes utilisateur (`—`, `…`, `« »`).
- CSP stricte : aucun JS inline ; tout le comportement reste dans `public/js/signature-pad.js`.
- Aucun nouveau flux multipart, aucune route, aucune migration Prisma.
- Le serveur reçoit toujours un PNG data URL dans `signatureData` et réutilise `src/services/signatureImage.js`.
- Tests : `test/lot-g.cjs` d'abord, puis `npm test` en fin d'extension.
- Commits préfixés `G:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1 : contrôles d'import dans les deux pads

**Files:**
- Modify: `views/dashboard/contract_form.twig`
- Modify: `views/tracking/sign.twig`
- Modify: `public/css/style.css`
- Modify: `test/lot-g.cjs`

**Interfaces:**
- Produces: attributs `data-signature-import-trigger` et `data-signature-import` consommés par `public/js/signature-pad.js`.
- Preserves: champ caché `#signatureData`, canvas `data-signature-pad`, bouton `data-signature-clear`.

- [x] **Step 1 : test qui échoue**

Dans `test/lot-g.cjs`, remplacer l'assertion école :

```js
    ok(r.text.includes('data-signature-pad') && r.text.includes('/js/signature-pad.js'),
      'école : pad de signature présent sur le formulaire de contrat');
```

par :

```js
    ok(r.text.includes('data-signature-pad') && r.text.includes('/js/signature-pad.js')
      && r.text.includes('data-signature-import') && r.text.includes('Importer une signature'),
      'école : pad de signature présent avec import d’image');
```

Puis remplacer l'assertion candidat :

```js
    ok(r.status === 200 && r.text.includes('data-signature-pad') && /J'ai lu et j'accepte/i.test(r.text),
      'candidat : page de signature (pad + case d’acceptation)');
```

par :

```js
    ok(r.status === 200 && r.text.includes('data-signature-pad') && r.text.includes('data-signature-import')
      && r.text.includes('Importer une signature') && /J'ai lu et j'accepte/i.test(r.text),
      'candidat : page de signature (pad + import + case d’acceptation)');
```

- [x] **Step 2 : vérifier l'échec**

Run : `node test/lot-g.cjs`

Attendu : échec sur `école : pad de signature présent avec import d’image`.

- [x] **Step 3 : vues**

Dans `views/dashboard/contract_form.twig`, remplacer le bloc :

```twig
        <div class="signature-actions">
          <button type="button" class="btn btn-small" data-signature-clear>Effacer</button>
        </div>
        <input type="hidden" name="signatureData" id="signatureData">
        <p class="field-error" data-signature-error hidden>Veuillez dessiner votre signature avant de valider.</p>
```

par :

```twig
        <div class="signature-actions">
          <button type="button" class="btn btn-small" data-signature-clear>Effacer</button>
          <button type="button" class="btn btn-small" data-signature-import-trigger>Importer une signature</button>
          <input type="file" class="signature-import-input" data-signature-import accept="image/png,image/jpeg">
        </div>
        <input type="hidden" name="signatureData" id="signatureData">
        <p class="field-error" data-signature-error hidden>Veuillez dessiner ou importer votre signature avant de valider.</p>
```

Dans `views/tracking/sign.twig`, appliquer exactement le même remplacement au bloc `.signature-actions` et au message `[data-signature-error]`.

- [x] **Step 4 : styles**

Dans `public/css/style.css`, remplacer :

```css
.signature-actions { margin-top: 0.25rem; }
```

par :

```css
.signature-actions {
  margin-top: 0.25rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.signature-import-input { display: none; }
```

- [x] **Step 5 : vérifier le succès**

Run : `node test/lot-g.cjs`

Attendu : `✅ Lot G tests réussis — 46 assertions.`

- [x] **Step 6 : commit**

```bash
git add views/dashboard/contract_form.twig views/tracking/sign.twig public/css/style.css test/lot-g.cjs docs/superpowers/plans/2026-07-06-lot-g-import-signature.md
git commit -m "G: controles d'import de signature sur les deux pads canvas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : import image dans `signature-pad.js`

**Files:**
- Modify: `public/js/signature-pad.js`
- Modify: `test/lot-g.cjs`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `data-signature-import-trigger`, `data-signature-import`, `data-signature-error`.
- Produces: import client d'une image PNG/JPEG dans le canvas ; au submit, `signatureData` reste un PNG data URL.

- [ ] **Step 1 : test qui échoue**

Dans `test/lot-g.cjs`, insérer avant le `console.log` final :

```js
    // --- G+. import image dans le pad ---
    const padJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'signature-pad.js'), 'utf8');
    ok(padJs.includes('FileReader') && padJs.includes('drawImage') && padJs.includes('MAX_IMPORT_BYTES'),
      'signature : JS du pad sait importer une image dans le canvas');
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-g.cjs`

Attendu : échec sur `signature : JS du pad sait importer une image dans le canvas`.

- [ ] **Step 3 : implémentation JS**

Dans `public/js/signature-pad.js`, remplacer tout le fichier par :

```js
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
```

- [ ] **Step 4 : mise à jour AGENTS**

Dans `AGENTS.md`, remplacer :

```markdown
- **Signatures** (Lot G) : PNG de pad validés par `src/services/signatureImage.js`
  (data URL, magic bytes, 200 Ko max), stockés sous `storage/signatures/` ; toute
```

par :

```markdown
- **Signatures** (Lot G) : dessin ou import PNG/JPEG dans le pad canvas, puis PNG
  validé par `src/services/signatureImage.js` (data URL, magic bytes, 200 Ko max),
  stocké sous `storage/signatures/` ; toute
```

et remplacer `~235 assertions` par `~236 assertions`.

- [ ] **Step 5 : vérifier le succès**

Run : `node test/lot-g.cjs`

Attendu : `✅ Lot G tests réussis — 47 assertions.`

Run : `npm test`

Attendu : suite complète verte (8 fichiers).

- [ ] **Step 6 : commit**

```bash
git add public/js/signature-pad.js test/lot-g.cjs AGENTS.md docs/superpowers/plans/2026-07-06-lot-g-import-signature.md
git commit -m "G: import d'image de signature dans le pad canvas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
