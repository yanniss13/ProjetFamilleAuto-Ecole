// Création/MAJ d'un compte administrateur. Usage :
//   npm run admin:create -- <email> <motdepasse>
// Upsert par email : relancer avec le même email met à jour le mot de passe.
const prisma = require('../src/config/prisma');
const password = require('../src/utils/password');

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // octets (limite bcrypt)

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Logique réutilisable (testable sans argv). Valide, hache, upsert par email.
async function createOrUpdateAdmin({ email, password: plain }) {
  const normEmail = (email || '').trim().toLowerCase();
  if (!normEmail || !isValidEmail(normEmail)) throw new Error('Email invalide.');
  if (!plain || plain.length < PASSWORD_MIN) throw new Error(`Mot de passe : au moins ${PASSWORD_MIN} caractères.`);
  if (Buffer.byteLength(plain, 'utf8') > PASSWORD_MAX) throw new Error(`Mot de passe : ${PASSWORD_MAX} octets maximum.`);
  const passwordHash = await password.hash(plain);
  return prisma.admin.upsert({
    where: { email: normEmail },
    update: { passwordHash },
    create: { email: normEmail, passwordHash },
  });
}

// Runner CLI (exécuté seulement si lancé directement, pas au require).
async function runCli() {
  const [email, plain] = process.argv.slice(2);
  if (!email || !plain) {
    console.error('Usage : npm run admin:create -- <email> <motdepasse>');
    process.exit(1);
  }
  try {
    const admin = await createOrUpdateAdmin({ email, password: plain });
    console.log(`Admin prêt : ${admin.email} (id ${admin.id}).`);
    await prisma.$disconnect();
  } catch (err) {
    console.error(`Échec : ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) runCli();

module.exports = { createOrUpdateAdmin };
