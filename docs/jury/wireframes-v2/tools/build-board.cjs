// Génère la planche SVG de couverture des 30 wireframes v2 : miniatures
// référencées (pas embarquées) groupées par acteur, avec légende. Les
// miniatures montrent le haut de chaque page ; les PNG complets restent
// sous png/. Usage : node docs/jury/wireframes-v2/tools/build-board.cjs
const fs = require('fs');
const path = require('path');
const screens = require(path.join(__dirname, '..', 'screens.cjs'));

const RACINE = path.resolve(__dirname, '..');
const COLONNES = 5;
const CELL_L = 340, CELL_H = 268, IMG_L = 320, IMG_H = 200;
const MARGE = 40, TITRE_H = 90, GROUPE_H = 48;

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const groupes = [...new Set(screens.map((s) => s.section))];
let y = TITRE_H;
const blocs = [];
for (const groupe of groupes) {
  const liste = screens.filter((s) => s.section === groupe);
  blocs.push(`<text class="groupe" x="${MARGE}" y="${y + 30}">${esc(groupe)} — ${liste.length} écran(s)</text>`);
  y += GROUPE_H;
  liste.forEach((s, i) => {
    const col = i % COLONNES, ligne = Math.floor(i / COLONNES);
    const x = MARGE + col * CELL_L, cy = y + ligne * CELL_H;
    const png = `png/${s.filename.replace('.html', '.png')}`;
    blocs.push(
      `<g><rect class="cadre" x="${x}" y="${cy}" width="${IMG_L}" height="${IMG_H}"/>`
      + `<image href="${png}" x="${x}" y="${cy}" width="${IMG_L}" height="${IMG_H}" preserveAspectRatio="xMidYMin slice"/>`
      + `<rect class="bord" x="${x}" y="${cy}" width="${IMG_L}" height="${IMG_H}"/>`
      + `<text class="nom" x="${x}" y="${cy + IMG_H + 20}">${esc(s.title)}</text>`
      + `<text class="route" x="${x}" y="${cy + IMG_H + 38}">${esc(s.route)}</text></g>`,
    );
  });
  y += Math.ceil(liste.length / COLONNES) * CELL_H + 14;
}
const HAUTEUR = y + 50;
const LARGEUR = MARGE * 2 + COLONNES * CELL_L;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR} ${HAUTEUR}" font-family="Segoe UI, Arial, sans-serif">
  <style>
    .titre{fill:#1a4d8f;font-size:26px;font-weight:700;}
    .legende{fill:#5b6470;font-size:13px;}
    .groupe{fill:#1a4d8f;font-size:19px;font-weight:700;}
    .nom{fill:#1f2933;font-size:13px;font-weight:600;}
    .route{fill:#5b6470;font-size:11.5px;}
    .cadre{fill:#ffffff;}
    .bord{fill:none;stroke:#3b5b8c;stroke-width:1.2;}
  </style>
  <rect width="${LARGEUR}" height="${HAUTEUR}" fill="#ffffff"/>
  <text class="titre" x="${MARGE}" y="42">Wireframes v2 — 30 écrans et états conformes à l'application livrée</text>
  <text class="legende" x="${MARGE}" y="66">Miniatures = haut de page (recadrées) ; PNG pleine page sous png/, sources HTML navigables via index.html — 2026-07-11</text>
  ${blocs.join('\n  ')}
</svg>
`;
fs.writeFileSync(path.join(RACINE, 'wireframes-v2-planche.svg'), svg);
console.log(`Planche écrite : ${groupes.length} groupes, ${screens.length} miniatures, ${LARGEUR}x${HAUTEUR}.`);
