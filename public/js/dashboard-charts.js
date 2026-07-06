// Graphiques des tableaux de bord (école + admin) : lit le bloc JSON #stats-data et
// construit des SVG en DOM (createElementNS + textContent — jamais d'HTML assemblé
// avec des données). Une seule teinte par graphique ; le texte reste en encre neutre.
(function () {
  var dataEl = document.getElementById('stats-data');
  if (!dataEl) return;

  var stats;
  try {
    stats = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var BAR = '#2563eb'; // teinte unique validée (contraste + daltonisme, surface claire)
  var INK = '#374151'; // encre neutre : le texte ne porte jamais la couleur des barres
  var MUTED = '#6b7280';
  var GRID = '#e5e7eb';

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    for (var k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  function textEl(x, y, content, fill, size, anchor) {
    var t = svgEl('text', { x: x, y: y, fill: fill, 'font-size': size, 'text-anchor': anchor || 'start' });
    t.textContent = content;
    return t;
  }

  // Barre verticale à sommet arrondi (2 px), base plate ancrée sur l'axe.
  function roundedBar(x, y, w, h) {
    var r = Math.min(2, h, w / 2);
    var d = 'M' + x + ' ' + (y + h) +
      ' L' + x + ' ' + (y + r) +
      ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
      ' L' + (x + w - r) + ' ' + y +
      ' Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) +
      ' L' + (x + w) + ' ' + (y + h) + ' Z';
    return svgEl('path', { d: d, fill: BAR });
  }

  // Barres hebdomadaires : serie = [{ label: 'JJ/MM', count }]. Valeur au-dessus des
  // barres non nulles seulement, libellés d'axe une semaine sur deux (12 = serré).
  function renderBarChart(el, serie) {
    if (!el || !Array.isArray(serie) || serie.length === 0) return;
    var W = 560;
    var H = 220;
    var pad = { top: 22, right: 6, bottom: 22, left: 6 };
    var innerW = W - pad.left - pad.right;
    var innerH = H - pad.top - pad.bottom;
    var max = 1;
    serie.forEach(function (b) { if (b.count > max) max = b.count; });

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    var step = innerW / serie.length;
    var barW = Math.min(26, Math.max(6, step * 0.55));
    var baseline = pad.top + innerH;

    svg.appendChild(svgEl('line', { x1: pad.left, y1: baseline, x2: W - pad.right, y2: baseline, stroke: GRID, 'stroke-width': 1 }));

    serie.forEach(function (b, i) {
      var x = pad.left + i * step + (step - barW) / 2;
      var h = Math.round((b.count / max) * (innerH - 4));
      if (b.count > 0) {
        var bar = roundedBar(x, baseline - h, barW, h);
        var title = svgEl('title', {});
        title.textContent = 'Semaine du ' + b.label + ' : ' + b.count;
        bar.appendChild(title);
        svg.appendChild(bar);
        svg.appendChild(textEl(x + barW / 2, baseline - h - 5, String(b.count), INK, 11, 'middle'));
      }
      if (serie.length <= 8 || i % 2 === 1) {
        svg.appendChild(textEl(x + barW / 2, baseline + 14, b.label, MUTED, 10, 'middle'));
      }
    });

    el.appendChild(svg);
  }

  // Entonnoir horizontal : steps = [{ label, count, rateFromPrevious }]. Barres
  // proportionnelles à la plus grande étape, une seule teinte, % de conversion
  // affiché entre les étapes en encre atténuée.
  function renderFunnel(el, steps) {
    if (!el || !Array.isArray(steps) || steps.length === 0) return;
    var W = 560;
    var rowH = 34;
    var gap = 18;
    var labelW = 150;
    var valueW = 56;
    var H = steps.length * (rowH + gap) - gap;
    var barMax = W - labelW - valueW;
    var max = 1;
    steps.forEach(function (s) { if (s.count > max) max = s.count; });

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    steps.forEach(function (s, i) {
      var y = i * (rowH + gap);
      var w = Math.round((s.count / max) * barMax);
      if (s.count > 0 && w < 3) w = 3; // barre visible même pour de petits comptes
      svg.appendChild(textEl(labelW - 10, y + rowH / 2 + 4, s.label, INK, 12, 'end'));
      if (w > 0) {
        var bar = svgEl('rect', { x: labelW, y: y, width: w, height: rowH, rx: 2, fill: BAR });
        var title = svgEl('title', {});
        title.textContent = s.label + ' : ' + s.count;
        bar.appendChild(title);
        svg.appendChild(bar);
      }
      svg.appendChild(textEl(labelW + w + 8, y + rowH / 2 + 4, String(s.count), INK, 12, 'start'));
      if (i > 0 && s.rateFromPrevious !== null && s.rateFromPrevious !== undefined) {
        svg.appendChild(textEl(labelW, y - 5, '↓ ' + s.rateFromPrevious + ' % de l’étape précédente', MUTED, 10, 'start'));
      }
    });

    el.appendChild(svg);
  }

  renderBarChart(document.getElementById('chart-weekly'), stats.weekly);
  renderFunnel(document.getElementById('chart-funnel'), stats.funnel);
  renderBarChart(document.getElementById('chart-schools-weekly'), stats.schoolsWeekly);
  renderBarChart(document.getElementById('chart-applications-weekly'), stats.applicationsWeekly);
})();
