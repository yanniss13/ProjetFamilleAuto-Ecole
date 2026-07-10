// Contrôles de conformité pour le dossier jury : W3C (validateur Nu officiel),
// accessibilité (axe-core injecté) et débordement horizontal (320/375/768/1440).
// LECTURE SEULE côté application (aucune écriture en base) ; le HTML validé est
// celui sérialisé par le DOM — différence marginale avec la source documentée
// dans docs/jury/conformite.md.
// Prérequis : npm run seed:demo + serveur sur le port 4071.
// Usage : node scripts/conformite-jury.js [--controle=w3c|axe|debordement|tout]
//         [--sortie=docs/jury/conformite]
const fs = require('fs');
const path = require('path');
const { lanceEdge, navigue, connecte, pause } = require('./lib/cdp');
const { BASE, ECOLE, ADMIN, donneesDemo, pagesJury } = require('./lib/pages-jury');

const LARGEURS = [320, 375, 768, 1440];
const NU = 'https://validator.w3.org/nu/?out=json';

function argument(nom, defaut) {
  const prefixe = `--${nom}=`;
  const trouve = process.argv.find((a) => a.startsWith(prefixe));
  return trouve ? trouve.slice(prefixe.length) : defaut;
}

async function htmlRendu(cdp) {
  const r = await cdp.cmd('Runtime.evaluate', {
    expression: `'<!doctype html>\\n' + document.documentElement.outerHTML`,
    returnByValue: true,
  });
  return r.result.value;
}

// W3C : POST du HTML rendu au validateur Nu. Politesse : appels en séquence
// avec 2 s de pause (voir boucle principale) et User-Agent identifiable.
async function controleW3c(cdp) {
  const html = await htmlRendu(cdp);
  const reponse = await fetch(NU, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'User-Agent': 'MoniteurConnect-verification-jury (projet local DWWM)',
    },
    body: html,
  });
  if (!reponse.ok) throw new Error(`validateur Nu HTTP ${reponse.status}`);
  const resultat = await reponse.json();
  const erreurs = resultat.messages.filter((m) => m.type === 'error');
  const avertissements = resultat.messages.filter((m) => m.type !== 'error');
  return { erreurs: erreurs.length, avertissements: avertissements.length, messages: resultat.messages };
}

// axe-core : injecté via Runtime.evaluate (Page.setBypassCSP est activé au
// lancement, la CSP stricte du site bloquerait le script sinon).
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
async function controleAxe(cdp) {
  await cdp.cmd('Runtime.evaluate', { expression: AXE_SOURCE });
  const r = await cdp.cmd('Runtime.evaluate', {
    expression: `axe.run(document).then(res => JSON.stringify({
      violations: res.violations.map(v => ({
        id: v.id, impact: v.impact, aide: v.help, noeuds: v.nodes.length,
        cibles: v.nodes.slice(0, 5).map(n => n.target.join(' ')),
      })),
      passes: res.passes.length,
    }))`,
    awaitPromise: true,
    returnByValue: true,
  });
  return JSON.parse(r.result.value);
}

// Débordement : à chaque largeur, scrollWidth vs innerWidth + les éléments
// plus larges que la fenêtre (10 premiers, sélecteur court).
async function controleDebordement(cdp) {
  const parLargeur = {};
  for (const largeur of LARGEURS) {
    await cdp.cmd('Emulation.setDeviceMetricsOverride', {
      width: largeur, height: 900, deviceScaleFactor: 1, mobile: largeur < 768,
    });
    await pause(400);
    const r = await cdp.cmd('Runtime.evaluate', {
      expression: `JSON.stringify((() => {
        const deborde = document.documentElement.scrollWidth > window.innerWidth;
        const coupables = [];
        if (deborde) {
          for (const el of document.querySelectorAll('body *')) {
            if (el.getBoundingClientRect().right > window.innerWidth + 1) {
              const cls = (el.className && typeof el.className === 'string')
                ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
              coupables.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : cls));
              if (coupables.length >= 10) break;
            }
          }
        }
        return { deborde, scrollWidth: document.documentElement.scrollWidth,
                 innerWidth: window.innerWidth, coupables };
      })())`,
      returnByValue: true,
    });
    parLargeur[largeur] = JSON.parse(r.result.value);
  }
  await cdp.cmd('Emulation.clearDeviceMetricsOverride');
  return parLargeur;
}

async function main() {
  const controle = argument('controle', 'tout');
  const dossierSortie = path.resolve(argument('sortie', path.join('docs', 'jury', 'conformite')));
  fs.mkdirSync(dossierSortie, { recursive: true });
  const actifs = controle === 'tout' ? ['w3c', 'axe', 'debordement'] : [controle];

  const pages = pagesJury(await donneesDemo());
  const { cdp, fermer } = await lanceEdge({});
  const resume = { date: new Date().toISOString(), controles: actifs, pages: {} };
  let echec = false;
  try {
    await cdp.cmd('Page.setBypassCSP', { enabled: true }); // pour l'injection d'axe
    let sessionCourante = null;
    for (const page of pages) {
      if (page.session !== sessionCourante && page.session === 'ecole') {
        await connecte(cdp, `${BASE}/connexion`, ECOLE);
        sessionCourante = 'ecole';
      } else if (page.session !== sessionCourante && page.session === 'admin') {
        await connecte(cdp, `${BASE}/admin/connexion`, ADMIN);
        sessionCourante = 'admin';
      }
      await navigue(cdp, `${BASE}${page.url}`);
      resume.pages[page.nom] = {};
      for (const nomControle of actifs) {
        try {
          const fn = { w3c: controleW3c, axe: controleAxe, debordement: controleDebordement }[nomControle];
          const resultat = await fn(cdp);
          fs.writeFileSync(
            path.join(dossierSortie, `${nomControle}-${page.nom}.json`),
            JSON.stringify(resultat, null, 2),
          );
          resume.pages[page.nom][nomControle] = nomControle === 'w3c'
            ? { erreurs: resultat.erreurs, avertissements: resultat.avertissements }
            : nomControle === 'axe'
              ? { violations: resultat.violations.length }
              : Object.fromEntries(Object.entries(resultat).map(([l, v]) => [l, v.deborde]));
          console.log(`  ✓ ${nomControle} ${page.nom}`);
          if (nomControle === 'w3c') await pause(2000); // politesse envers le validateur
        } catch (err) {
          echec = true;
          resume.pages[page.nom][nomControle] = { echec: err.message };
          console.error(`  ✗ ${nomControle} ${page.nom} : ${err.message}`);
        }
      }
    }
  } finally {
    fermer();
  }
  fs.writeFileSync(path.join(dossierSortie, 'resume.json'), JSON.stringify(resume, null, 2));
  console.log(`\nRésumé écrit dans ${path.join(dossierSortie, 'resume.json')}`);
  if (echec) process.exitCode = 1;
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  main().catch((err) => {
    console.error(`Échec : ${err.message}`);
    process.exitCode = 1;
  });
}
