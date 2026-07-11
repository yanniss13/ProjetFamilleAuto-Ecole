// Génère le client Prisma puis marque le dossier généré comme module ES :
// le générateur "prisma-client" (Prisma 7) émet du TypeScript ESM, que ce
// projet CommonJS charge via require() grâce au type-stripping natif de
// Node >= 22.18 — à condition que le dossier porte {"type":"module"}.
// Usage : npm run prisma:generate (aussi lancé en postinstall).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

execSync('npx prisma generate', { stdio: 'inherit' });

const marqueur = path.join(__dirname, '..', 'src', 'generated', 'prisma', 'package.json');
fs.writeFileSync(marqueur, '{"type":"module"}\n');
console.log('Marqueur ESM écrit :', path.relative(process.cwd(), marqueur));
