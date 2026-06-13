// Point d'entrée : charge la configuration puis démarre le serveur HTTP.
require('dotenv').config({ quiet: true });

// Fail-fast : on refuse de démarrer en silence avec une valeur de repli dangereuse
// (un secret de session connu rendrait les cookies forgeables). À faire AVANT de
// charger app.js, qui lit ces variables au require.
const REQUIS = ['SESSION_SECRET'];
const manquants = REQUIS.filter((cle) => !process.env[cle]);
if (manquants.length > 0) {
  console.error(`Variables d'environnement manquantes : ${manquants.join(', ')}`);
  console.error('Copiez .env.example en .env et renseignez-les, puis relancez. Arrêt.');
  process.exit(1);
}

const app = require('./app');
const prisma = require('./config/prisma');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`MoniteurConnect démarré sur http://localhost:${PORT}`);
});

// Arrêt propre : ferme le serveur HTTP puis libère la connexion Prisma.
function shutdown(signal) {
  console.log(`\n${signal} reçu — arrêt du serveur...`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 10000).unref();
}
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
