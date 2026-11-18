// Démarrage de l'instance publique de démonstration (Render, offre gratuite).
// À chaque démarrage : migrations appliquées, données de démo recréées, puis
// serveur lancé. Le disque de l'offre gratuite n'est pas persistant : la base
// SQLite et les fichiers repartent donc d'un état propre après chaque mise en
// veille, ce qui efface aussi ce que les visiteurs ont modifié.
// Usage : npm run demo:start (avec DEMO_MODE=true pour afficher les accès).
const { execSync } = require('child_process');

execSync('npx prisma migrate deploy', { stdio: 'inherit' });
execSync('node scripts/seed-demo.js', { stdio: 'inherit' });
require('../src/server');
