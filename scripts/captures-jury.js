// Captures d'écran pour le dossier jury (comparaison maquettes v1 / application).
// Pilote Edge headless via le protocole CDP (WebSocket natif de Node >= 22) :
// aucune dépendance nouvelle. LECTURE SEULE : la base n'est interrogée que pour
// retrouver les IDs du jeu de démo, rien n'est écrit ; la navigation se fait en
// HTTP contre un serveur local déjà démarré.
//
// Prérequis : `npm run seed:demo` puis serveur lancé sur le port ciblé, ex. :
//   $env:PORT='4071'; node src/server.js
// Usage : node scripts/captures-jury.js [--largeur=1440] [--sortie=docs/jury/captures]
//   --largeur est paramétrable pour réutiliser le script au chantier responsive
//   (320/375/768 px) sans le modifier.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:4071';
const DEMO_SUFFIX = '@demo.moniteur-connect.example';
const ECOLE = { email: `ecole.vitrine${DEMO_SUFFIX}`, password: 'demo1234' };
const ADMIN = { email: `admin${DEMO_SUFFIX}`, password: 'admin1234' };
const PORT_CDP = 9223; // hors plage des tests (4055-4070) et du serveur (4071)
const EDGES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function argument(nom, defaut) {
  const prefixe = `--${nom}=`;
  const trouve = process.argv.find((a) => a.startsWith(prefixe));
  return trouve ? trouve.slice(prefixe.length) : defaut;
}

// IDs du jeu de démo, en lecture seule (aucune écriture, $disconnect garanti).
async function donneesDemo() {
  const prisma = new PrismaClient();
  try {
    const vitrine = await prisma.school.findUnique({ where: { email: ECOLE.email } });
    if (!vitrine) throw new Error(`École vitrine absente — lancer \`npm run seed:demo\` d'abord.`);
    const phare = await prisma.listing.findFirst({
      where: { schoolId: vitrine.id, status: 'open' },
      orderBy: { viewsCount: 'desc' },
    });
    const pending = await prisma.application.findFirst({
      where: { listingId: phare.id, status: 'pending' },
    });
    const signee = await prisma.application.findFirst({
      where: { listing: { schoolId: vitrine.id }, contract: { isNot: null } },
    });
    return { phareId: phare.id, pendingId: pending.id, token: signee.trackingToken };
  } finally {
    await prisma.$disconnect();
  }
}

// Client CDP minimal : commandes corrélées par id, attente du prochain chargement.
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.prochainId = 0;
    this.attentes = new Map(); // id -> {resolve, reject}
    this.attenteChargement = null; // resolve du prochain Page.loadEventFired
    ws.addEventListener('message', (evenement) => {
      const message = JSON.parse(evenement.data);
      if (message.id !== undefined && this.attentes.has(message.id)) {
        const { resolve, reject } = this.attentes.get(message.id);
        this.attentes.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message}`));
        else resolve(message.result);
      } else if (message.method === 'Page.loadEventFired' && this.attenteChargement) {
        const resolve = this.attenteChargement;
        this.attenteChargement = null;
        resolve();
      }
    });
  }

  cmd(method, params = {}) {
    const id = (this.prochainId += 1);
    return new Promise((resolve, reject) => {
      this.attentes.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      // Garde-fou : une commande sans réponse ne doit pas geler le script.
      setTimeout(() => {
        if (this.attentes.has(id)) {
          this.attentes.delete(id);
          reject(new Error(`CDP sans réponse : ${method}`));
        }
      }, 30000);
    });
  }

  attendChargement() {
    return new Promise((resolve, reject) => {
      this.attenteChargement = resolve;
      setTimeout(() => {
        if (this.attenteChargement === resolve) {
          this.attenteChargement = null;
          reject(new Error('chargement de page sans événement load après 30 s'));
        }
      }, 30000);
    });
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function navigue(cdp, url) {
  const chargement = cdp.attendChargement();
  await cdp.cmd('Page.navigate', { url });
  await chargement;
  await pause(1500); // laisse Leaflet, les graphiques SVG et la datalist se poser
}

// Connexion via le VRAI formulaire (le champ CSRF caché part avec lui) —
// jamais de POST fabriqué à la main.
async function connecte(cdp, urlLogin, compte) {
  await navigue(cdp, urlLogin);
  const chargement = cdp.attendChargement();
  await cdp.cmd('Runtime.evaluate', {
    expression: `
      document.querySelector('#email').value = ${JSON.stringify(compte.email)};
      document.querySelector('#password').value = ${JSON.stringify(compte.password)};
      document.querySelector('#password').closest('form').submit();
    `,
  });
  await chargement;
  await pause(1500);
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

  const edge = EDGES.find((chemin) => fs.existsSync(chemin));
  if (!edge) throw new Error('Microsoft Edge introuvable (chemins Program Files).');

  const ids = await donneesDemo();

  // Pages à capturer, dans l'ordre : publiques, puis session école, puis admin
  // (la connexion admin régénère la session : cloisonnement voulu, l'école
  // doit donc être capturée AVANT).
  const PAGES = [
    { nom: 'accueil', url: '/', session: null },
    { nom: 'annonces', url: '/annonces', session: null },
    { nom: 'annonce-detail', url: `/annonces/${ids.phareId}`, session: null },
    { nom: 'carte', url: '/annonces?vue=carte', session: null },
    { nom: 'inscription', url: '/inscription', session: null },
    { nom: 'connexion', url: '/connexion', session: null },
    { nom: 'alertes', url: '/alertes', session: null },
    { nom: 'suivi', url: `/suivi/${ids.token}`, session: null },
    { nom: 'dashboard', url: '/tableau-de-bord', session: 'ecole' },
    { nom: 'mes-annonces', url: '/mes-annonces', session: 'ecole' },
    { nom: 'annonce-form', url: '/mes-annonces/nouvelle', session: 'ecole' },
    { nom: 'candidatures', url: `/mes-annonces/${ids.phareId}/candidatures`, session: 'ecole' },
    { nom: 'contrat', url: `/mes-annonces/${ids.phareId}/candidatures/${ids.pendingId}/accepter`, session: 'ecole' },
    { nom: 'compte', url: '/mon-compte', session: 'ecole' },
    { nom: 'admin', url: '/admin', session: 'admin' },
  ];

  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'captures-jury-'));
  const processusEdge = spawn(edge, [
    '--headless=new',
    `--remote-debugging-port=${PORT_CDP}`,
    `--window-size=${largeur},1000`,
    `--user-data-dir=${profil}`,
    '--no-first-run',
    'about:blank',
  ], { stdio: 'ignore' });

  const echecs = [];
  try {
    // Attendre que l'endpoint CDP expose la cible « page ».
    let cible = null;
    for (let essai = 0; essai < 50 && !cible; essai += 1) {
      await pause(200);
      try {
        const reponse = await fetch(`http://127.0.0.1:${PORT_CDP}/json`);
        const cibles = await reponse.json();
        cible = cibles.find((c) => c.type === 'page');
      } catch (_) { /* Edge pas encore prêt */ }
    }
    if (!cible) throw new Error('endpoint CDP injoignable après 10 s.');

    const ws = new WebSocket(cible.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', () => reject(new Error('connexion WebSocket CDP refusée')));
    });
    const cdp = new Cdp(ws);
    await cdp.cmd('Page.enable');
    await cdp.cmd('Runtime.enable');

    let sessionCourante = null;
    for (const page of PAGES) {
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
    ws.close();
  } finally {
    processusEdge.kill();
  }

  const attendues = PAGES.map((p) => p.nom);
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
