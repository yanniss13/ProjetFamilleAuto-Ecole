// Client Chrome DevTools Protocol minimal, partagé par les scripts jury
// (captures d'écran, contrôles de conformité). Pilote Edge headless avec le
// WebSocket natif de Node >= 22 : aucune dépendance. Usage type dans
// scripts/captures-jury.js et scripts/conformite-jury.js.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT_CDP = 9223; // hors plage des tests (4055-4070) et du serveur (4071)
const EDGES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Commandes corrélées par id, attente du prochain chargement de page.
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

// Lance Edge headless, se connecte en CDP et active Page + Runtime.
// Renvoie { cdp, fermer } — TOUJOURS appeler fermer() dans un finally.
async function lanceEdge({ largeur = 1440, hauteur = 1000 } = {}) {
  const edge = EDGES.find((chemin) => fs.existsSync(chemin));
  if (!edge) throw new Error('Microsoft Edge introuvable (chemins Program Files).');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-jury-'));
  const processusEdge = spawn(edge, [
    '--headless=new',
    `--remote-debugging-port=${PORT_CDP}`,
    `--window-size=${largeur},${hauteur}`,
    `--user-data-dir=${profil}`,
    '--no-first-run',
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    let cible = null;
    for (let essai = 0; essai < 50 && !cible; essai += 1) {
      await pause(200);
      try {
        const reponse = await fetch(`http://127.0.0.1:${PORT_CDP}/json`);
        cible = (await reponse.json()).find((c) => c.type === 'page');
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
    return {
      cdp,
      fermer: () => {
        try { ws.close(); } catch (_) { /* déjà fermé */ }
        processusEdge.kill();
      },
    };
  } catch (err) {
    processusEdge.kill();
    throw err;
  }
}

module.exports = { lanceEdge, navigue, connecte, pause };
