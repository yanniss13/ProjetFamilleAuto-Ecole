// La liste des 15 pages du dossier jury et les IDs du jeu de démonstration.
// Source de vérité unique pour les captures d'écran et les contrôles de
// conformité. LECTURE SEULE : la base n'est interrogée que pour retrouver les
// identifiants de démo, rien n'est écrit.
const prisma = require('../../src/config/prisma');

const BASE = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:4071';
const DEMO_SUFFIX = '@demo.moniteur-connect.example';
const ECOLE = { email: `ecole.vitrine${DEMO_SUFFIX}`, password: 'demo1234' };
const ADMIN = { email: `admin${DEMO_SUFFIX}`, password: 'admin1234' };

// IDs du jeu de démo, en lecture seule (aucune écriture, $disconnect garanti —
// le client partagé de src/config/prisma porte l'adaptateur SQLite Prisma 7).
async function donneesDemo() {
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

// L'ordre importe : publiques, puis session école, puis admin (la connexion
// admin régénère la session — cloisonnement voulu, l'école passe donc AVANT).
function pagesJury(ids) {
  return [
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
}

module.exports = { BASE, ECOLE, ADMIN, donneesDemo, pagesJury };
