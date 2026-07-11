// Capture les 30 wireframes v2 en PNG pleine page (1440 px de large).
// Réutilise le client CDP du dépôt : Edge headless + Emulation exacte, comme
// pour les captures jury. Usage : node docs/jury/wireframes-v2/tools/capture-wireframes.cjs
const fs = require('fs');
const path = require('path');
const { lanceEdge, navigue } = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'lib', 'cdp'));
const screens = require(path.join(__dirname, '..', 'screens.cjs'));

const RACINE = path.resolve(__dirname, '..');
const SORTIE = path.join(RACINE, 'png');
const LARGEUR = 1440;

async function main() {
  fs.mkdirSync(SORTIE, { recursive: true });
  const { cdp, fermer } = await lanceEdge({ largeur: LARGEUR, hauteur: 1200 });
  const echecs = [];
  try {
    // Viewport imposé par CDP (la fenêtre extérieure ne fait pas foi) et
    // scrollbars masquées pour conserver exactement 1440 px de large.
    await cdp.cmd('Emulation.setDeviceMetricsOverride', {
      width: LARGEUR, height: 1200, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.cmd('Emulation.setScrollbarsHidden', { hidden: true });
    for (const s of screens) {
      try {
        const url = `file:///${path.join(RACINE, s.filename).replace(/\\/g, '/')}`;
        await navigue(cdp, url);
        const r = await cdp.cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(path.join(SORTIE, s.filename.replace('.html', '.png')), Buffer.from(r.data, 'base64'));
        console.log(`  ✓ ${s.filename.replace('.html', '.png')}`);
      } catch (err) {
        echecs.push(s.filename);
        console.error(`  ✗ ${s.filename} : ${err.message}`);
      }
    }
  } finally {
    fermer();
  }

  // Vérification binaire : 30 PNG, chacun > 15 Ko et large de 1440 px exactement.
  const pngs = fs.readdirSync(SORTIE).filter((f) => f.endsWith('.png'));
  let invalides = 0;
  for (const f of pngs) {
    const octets = fs.readFileSync(path.join(SORTIE, f));
    const largeur = octets.readUInt32BE(16);
    if (octets.length <= 15 * 1024 || largeur !== LARGEUR) {
      invalides += 1;
      console.error(`  ✗ ${f} : ${octets.length} octets, largeur ${largeur}px`);
    }
  }
  console.log(`\n${pngs.length}/30 PNG dans ${SORTIE} — ${invalides} invalide(s).`);
  process.exit(pngs.length === 30 && invalides === 0 && echecs.length === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
