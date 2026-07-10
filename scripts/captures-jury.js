// Captures d'écran pour le dossier jury (comparaison maquettes v1 / application,
// contrôle responsive). Edge headless piloté en CDP — voir scripts/lib/cdp.js.
// LECTURE SEULE : la base n'est interrogée que pour retrouver les IDs de démo.
//
// Prérequis : `npm run seed:demo` puis serveur lancé sur le port ciblé, ex. :
//   $env:PORT='4071'; node src/server.js
// Usage : node scripts/captures-jury.js [--largeur=1440] [--sortie=docs/jury/captures]
//   --largeur sert au contrôle responsive (320/375/768) sans modifier le script.
const fs = require('fs');
const path = require('path');
const { lanceEdge, navigue, connecte } = require('./lib/cdp');
const { BASE, ECOLE, ADMIN, donneesDemo, pagesJury } = require('./lib/pages-jury');

function argument(nom, defaut) {
  const prefixe = `--${nom}=`;
  const trouve = process.argv.find((a) => a.startsWith(prefixe));
  return trouve ? trouve.slice(prefixe.length) : defaut;
}

async function capture(cdp, dossierSortie, nom) {
  const resultat = await cdp.cmd('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  fs.writeFileSync(path.join(dossierSortie, `${nom}.png`), Buffer.from(resultat.data, 'base64'));
}

async function main() {
  const largeur = Number(argument('largeur', '1440'));
  const dossierSortie = path.resolve(argument('sortie', path.join('docs', 'jury', 'captures')));
  fs.mkdirSync(dossierSortie, { recursive: true });

  const pages = pagesJury(await donneesDemo());
  const { cdp, fermer } = await lanceEdge({ largeur });

  const echecs = [];
  try {
    let sessionCourante = null;
    for (const page of pages) {
      try {
        if (page.session !== sessionCourante && page.session === 'ecole') {
          await connecte(cdp, `${BASE}/connexion`, ECOLE);
          sessionCourante = 'ecole';
        } else if (page.session !== sessionCourante && page.session === 'admin') {
          await connecte(cdp, `${BASE}/admin/connexion`, ADMIN);
          sessionCourante = 'admin';
        }
        await navigue(cdp, `${BASE}${page.url}`);
        await capture(cdp, dossierSortie, page.nom);
        console.log(`  ✓ ${page.nom}.png`);
      } catch (err) {
        echecs.push(page.nom);
        console.error(`  ✗ ${page.nom} : ${err.message}`);
      }
    }
  } finally {
    fermer();
  }

  const attendues = pages.map((p) => p.nom);
  const manquantes = attendues.filter((nom) => !fs.existsSync(path.join(dossierSortie, `${nom}.png`)));
  console.log(`\n${attendues.length - manquantes.length}/${attendues.length} captures dans ${dossierSortie}`);
  if (manquantes.length > 0 || echecs.length > 0) {
    console.error(`Manquantes ou en échec : ${[...new Set([...manquantes, ...echecs])].join(', ')}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  main().catch((err) => {
    console.error(`Échec des captures : ${err.message}`);
    process.exitCode = 1;
  });
}
