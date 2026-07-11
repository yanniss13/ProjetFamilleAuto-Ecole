const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const expected = ['accueil','annonces','carte','annonce-detail','alertes','alerte-confirmee','alerte-desabonnement','alerte-supprimee','connexion','inscription','email-verifie','mot-de-passe-oublie','reinitialisation','suivi-attente','suivi-refuse','suivi-accepte','signature-candidat','suivi-signe','dashboard-ecole','mes-annonces','annonce-creation','annonce-modification','candidatures','contrat-ecole','mon-compte','connexion-admin','dashboard-admin','admin-ecoles','admin-annonces','etats-systeme'];
const forbidden = ['Rouvrir', 'Filtrer par statut', 'Modifier le mot de passe depuis Mon compte', 'Supprimer cette école'];
function fail(message) { console.error(message); process.exitCode = 1; }
let screens;
try { screens = require(path.join(root, 'screens.cjs')); } catch { fail('screens.cjs absent : 0/30 écrans'); return; }
const ids = screens.map(s => s.id);
if (screens.length !== 30 || expected.some(id => !ids.includes(id))) fail(`${screens.length}/30 écrans`);
if (new Set(ids).size !== ids.length || new Set(screens.map(s => s.filename)).size !== screens.length) fail('Identifiants ou fichiers dupliqués');
for (const screen of screens) {
  for (const key of ['id','filename','title','role','route','view','state','section','body']) if (!screen[key]) fail(`${screen.id}: ${key} absent`);
  if (!screen.filename.startsWith('wf-v2-')) fail(`${screen.id}: préfixe invalide`);
  const file = path.join(root, screen.filename);
  if (!fs.existsSync(file)) fail(`${screen.filename}: HTML absent`);
  if (screen.draft) fail(`${screen.id}: contenu incomplet`);
  if (fs.existsSync(file)) {
    const html = fs.readFileSync(file, 'utf8');
    for (const word of forbidden) if (html.includes(word)) fail(`${screen.id}: formulation interdite « ${word} »`);
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const target = match[1];
      if (!/^(https?:|#|mailto:)/.test(target) && !fs.existsSync(path.resolve(root, target))) fail(`${screen.id}: lien absent ${target}`);
    }
  }
}
if (!process.exitCode) console.log('Wireframes v2 : 30/30 écrans, liens et formulations valides.');
