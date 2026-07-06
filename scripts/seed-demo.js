// Jeu de données de démonstration. Usage : npm run seed:demo
// Crée ~15 auto-écoles géolocalisées, ~38 annonces, ~60 candidatures étalées sur
// 12 semaines, 4 alertes et un dossier complet jusqu'au contrat signé (école
// « vitrine »). RELANÇABLE : toutes les données démo portent le domaine réservé
// @demo.moniteur-connect.example — le script les supprime (fichiers compris)
// puis les recrée, sans jamais toucher aux autres données.
// Spec : docs/superpowers/specs/2026-07-07-lot-k-seed-demo-design.md
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = require('../src/config/prisma');
const passwordUtil = require('../src/utils/password');
const { generateOpaqueToken } = require('../src/services/tokens');
const { buildContractPdf } = require('../src/services/contractPdf');
const signatureImage = require('../src/services/signatureImage');
const { sha256Hex } = require('../src/utils/hash');
const { STORAGE_DIR, SUBDIRS, resolveStored, deleteStored } = require('../src/config/storage');

const DEMO_DOMAIN = 'demo.moniteur-connect.example';
const DEMO_SUFFIX = `@${DEMO_DOMAIN}`;
const MDP_ECOLE = 'demo1234';
const MDP_ADMIN = 'admin1234';

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgo(n) { return new Date(Date.now() - n * DAY_MS); }

// PNG 1×1 valide (même fixture que test/lot-g.cjs) : suffit à pdfkit pour incruster
// une « signature » dans le PDF — le flux réel du Lot G est utilisé tel quel.
const PNG_SIGNATURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// PDF minimal valide : les téléchargements de pièces fonctionnent en démo.
const MINI_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
  'trailer<</Size 4/Root 1 0 R>>\n%%EOF\n'
);

// ------------------------------ Données rédigées ------------------------------
// (Le jury lira ces textes : tout est écrit, rien n'est généré aléatoirement.)

const ECOLES = [
  // La première entrée est l'école « vitrine » (compte de connexion de la démo).
  { slug: 'ecole.vitrine', name: 'Prado Conduite', city: 'Marseille', department: '13', address: '45 avenue du Prado, 13006 Marseille', lat: 43.2803, lng: 5.3806, verified: true, phone: '04 91 22 33 44' },
  { slug: 'marais', name: 'Auto-école du Marais', city: 'Paris', department: '75', address: '12 rue des Archives, 75004 Paris', lat: 48.8575, lng: 2.356, verified: true, phone: '01 42 71 20 20' },
  { slug: 'presquile', name: 'Presqu’île Permis', city: 'Lyon', department: '69', address: '8 rue de la République, 69002 Lyon', lat: 45.764, lng: 4.8357, verified: true, phone: '04 78 42 10 10' },
  { slug: 'capitole', name: 'Capitole Conduite', city: 'Toulouse', department: '31', address: '3 rue du Taur, 31000 Toulouse', lat: 43.6047, lng: 1.4442, verified: false, phone: '05 61 21 40 40' },
  { slug: 'riviera', name: 'Riviera Auto-école', city: 'Nice', department: '06', address: '27 avenue Jean Médecin, 06000 Nice', lat: 43.7102, lng: 7.262, verified: true, phone: '04 93 87 55 55' },
  { slug: 'erdre', name: 'Erdre Conduite', city: 'Nantes', department: '44', address: '5 rue Crébillon, 44000 Nantes', lat: 47.2184, lng: -1.5536, verified: true, phone: '02 40 48 60 60' },
  { slug: 'garonne', name: 'Garonne Permis', city: 'Bordeaux', department: '33', address: '14 cours de l’Intendance, 33000 Bordeaux', lat: 44.8378, lng: -0.5792, verified: false, phone: '05 56 44 70 70' },
  { slug: 'nord', name: 'Nord Conduite', city: 'Lille', department: '59', address: '21 rue Nationale, 59000 Lille', lat: 50.6292, lng: 3.0573, verified: true, phone: '03 20 54 80 80' },
  { slug: 'alsace', name: 'Alsace Permis', city: 'Strasbourg', department: '67', address: '9 rue des Grandes Arcades, 67000 Strasbourg', lat: 48.5734, lng: 7.7521, verified: true, phone: '03 88 32 90 90' },
  { slug: 'breizh', name: 'Breizh Conduite', city: 'Rennes', department: '35', address: '11 rue de Nemours, 35000 Rennes', lat: 48.1173, lng: -1.6778, verified: false, phone: '02 99 79 15 15' },
  { slug: 'occitane', name: 'Occitane Auto-école', city: 'Montpellier', department: '34', address: '6 rue de la Loge, 34000 Montpellier', lat: 43.6108, lng: 3.8767, verified: true, phone: '04 67 60 25 25' },
  { slug: 'alpes', name: 'Alpes Conduite', city: 'Grenoble', department: '38', address: '2 boulevard Gambetta, 38000 Grenoble', lat: 45.1885, lng: 5.7245, verified: true, phone: '04 76 46 35 35' },
  { slug: 'bourgogne', name: 'Bourgogne Permis', city: 'Dijon', department: '21', address: '17 rue de la Liberté, 21000 Dijon', lat: 47.322, lng: 5.0415, verified: false, phone: '03 80 30 45 45' },
  { slug: 'anjou', name: 'Anjou Conduite', city: 'Angers', department: '49', address: '4 rue Lenepveu, 49100 Angers', lat: 47.4784, lng: -0.5632, verified: true, phone: '02 41 88 65 65' },
  { slug: 'mirabeau', name: 'Cours Mirabeau Conduite', city: 'Aix-en-Provence', department: '13', address: '31 cours Mirabeau, 13100 Aix-en-Provence', lat: 43.5266, lng: 5.4497, verified: true, phone: '04 42 26 75 75' },
];

// Modèles d'annonces réutilisés par les écoles (la ville est celle de l'école).
const MODELES = [
  { title: 'Moniteur / Monitrice B — CDI temps plein', contractType: 'cdi', hoursPerWeek: 35, compensation: '2 200 € brut/mois', description: 'Nous recherchons un enseignant ou une enseignante de la conduite (catégorie B) pour rejoindre une équipe de quatre moniteurs. Véhicule récent fourni, planning fixe établi deux semaines à l’avance, clientèle régulière. Autorisation d’enseigner en cours de validité exigée.' },
  { title: 'Moniteur auto-école — CDI 30 h évolutif', contractType: 'cdi', hoursPerWeek: 30, compensation: '1 900 € brut/mois', description: 'Poste à 30 heures hebdomadaires, évolutif vers un temps plein selon l’activité. Vous accompagnez nos élèves de la première heure de conduite jusqu’à l’examen. Ambiance familiale, bureau dédié aux moniteurs.' },
  { title: 'Enseignant(e) de la conduite — CDD 6 mois', contractType: 'cdd', hoursPerWeek: 35, compensation: '2 100 € brut/mois', description: 'Remplacement de six mois dans le cadre d’un congé parental. Prise de poste rapide souhaitée. Vous assurez les leçons de conduite et quelques rendez-vous pédagogiques en salle.' },
  { title: 'Moniteur indépendant — renfort week-ends', contractType: 'freelance', hoursPerWeek: 12, compensation: '28 €/h, facturation mensuelle', description: 'Nous cherchons un moniteur indépendant pour absorber la demande du samedi. Volume garanti de 10 à 14 heures par week-end, planning transmis le lundi. SIRET et autorisation d’enseigner indispensables.' },
  { title: 'Monitrice / Moniteur moto (mention A)', contractType: 'cdi', hoursPerWeek: 35, compensation: '2 350 € brut/mois', description: 'Développement de notre activité deux-roues : plateau privatif, deux motos école récentes. La mention deux-roues est exigée, une première expérience sur plateau est un vrai plus.' },
  { title: 'Contrat d’apprentissage — futur enseignant ECSR', contractType: 'apprentissage', hoursPerWeek: 35, compensation: 'Rémunération légale d’apprentissage', description: 'Vous préparez le titre professionnel ECSR ? Nous accueillons un apprenti ou une apprentie pour l’année à venir, avec un tuteur diplômé depuis douze ans. Immersion complète : conduite, pédagogie en salle, gestion des examens.' },
  { title: 'Moniteur B — soirées et samedi matin', contractType: 'cdi', hoursPerWeek: 25, compensation: '1 650 € brut/mois', description: 'Créneaux de fin de journée (16 h – 20 h) et samedi matin, idéal en complément d’une autre activité. Élèves principalement en conduite accompagnée.' },
  { title: 'Enseignant de la conduite — boîte automatique', contractType: 'cdd', hoursPerWeek: 28, compensation: '1 800 € brut/mois', description: 'CDD de neuf mois pour accompagner le lancement de notre offre 100 % boîte automatique. Véhicule hybride neuf, tablette pédagogique fournie, formation interne à notre méthode.' },
  { title: 'Moniteur indépendant — permis remorque BE', contractType: 'freelance', hoursPerWeek: 8, compensation: '30 €/h', description: 'Mission récurrente : formations BE (remorque) un vendredi sur deux sur notre plateau. Matériel fourni (tracteur + remorque), élèves par groupes de deux.' },
];

// Annonces propres à l'école vitrine (dossier de démo complet).
const ANNONCES_VITRINE = [
  { title: 'Moniteur / Monitrice B — CDI temps plein', contractType: 'cdi', hoursPerWeek: 35, compensation: '2 300 € brut/mois', views: 287, weeksAgo: 6, description: 'Prado Conduite renforce son équipe : cinq moniteurs, deux salles de code, secteur Prado – Castellane. Vous suivez vos élèves de bout en bout, avec un véhicule attitré et un samedi sur deux libéré. Prime de résultats à chaque session d’examen.' },
  { title: 'Enseignant(e) deux-roues — mention A exigée', contractType: 'cdi', hoursPerWeek: 35, compensation: '2 400 € brut/mois', views: 194, weeksAgo: 9, description: 'Notre plateau moto de la Pointe-Rouge tourne à plein régime : nous ouvrons un second poste deux-roues. Motos récentes (MT-07), équipements élèves fournis, binôme avec notre monitrice référente.' },
  { title: 'Moniteur B — CDD remplacement (8 mois)', contractType: 'cdd', hoursPerWeek: 32, compensation: '2 000 € brut/mois', views: 143, weeksAgo: 4, description: 'Remplacement d’un congé maternité d’avril à décembre. Planning déjà constitué, élèves en milieu de formation : vous reprenez un portefeuille suivi et documenté.' },
  { title: 'Moniteur indépendant — examens blancs du samedi', contractType: 'freelance', hoursPerWeek: 10, compensation: '29 €/h', views: 88, weeksAgo: 8, description: 'Chaque samedi matin, nous organisons des examens blancs en conditions réelles. Nous cherchons un moniteur indépendant pour les encadrer : évaluation, débriefing, fiche de progression.' },
  { title: 'Apprenti(e) enseignant ECSR — rentrée prochaine', contractType: 'apprentissage', hoursPerWeek: 35, compensation: 'Rémunération légale d’apprentissage', views: 61, weeksAgo: 3, description: 'Nous formons notre prochain moniteur ! Tutorat par le fondateur (vingt ans de métier), passage progressif de l’observation à la conduite commentée, salle de code dédiée aux apprentis.' },
  { title: 'Monitrice / Moniteur B — poste pourvu', contractType: 'cdi', hoursPerWeek: 35, compensation: '2 250 € brut/mois', views: 240, weeksAgo: 11, status: 'closed', description: 'Poste pourvu — merci à toutes les candidates et tous les candidats. L’annonce reste visible à titre d’archive interne.' },
];

const CANDIDATS = [
  'Julien Martin', 'Sophie Bernard', 'Karim Haddad', 'Claire Dubois', 'Lucas Moreau',
  'Emma Petit', 'Nadia Benali', 'Thomas Leroy', 'Camille Fournier', 'Hugo Girard',
  'Léa Bonnet', 'Mehdi Charef', 'Alice Lambert', 'Paul Rousseau', 'Inès Garnier',
  'Antoine Faure', 'Manon Chevalier', 'Yanis Cohen', 'Julie Masson', 'Romain Blanc',
];

const MESSAGES = [
  'Bonjour, moniteur diplômé depuis cinq ans, je cherche un poste stable dans votre secteur. Disponible pour un essai quand vous le souhaitez.',
  'Bonjour, votre annonce correspond exactement à ce que je recherche : je termine mon contrat actuel à la fin du mois et je peux commencer immédiatement après.',
  'Bonjour, enseignante de la conduite depuis 2019 (B et conduite accompagnée), je serais ravie d’échanger sur ce poste. Mon autorisation d’enseigner est valide jusqu’en 2028.',
];

function slugifie(nom) {
  return nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.');
}

// --------------------------------- Nettoyage ---------------------------------

// Supprime les données démo existantes ET leurs fichiers (les cascades DB
// emportent annonces, candidatures et contrats, mais pas les fichiers disque).
async function nettoieDemo() {
  const ecoles = await prisma.school.findMany({ where: { email: { endsWith: DEMO_SUFFIX } }, select: { id: true } });
  const ids = ecoles.map((e) => e.id);
  if (ids.length) {
    const apps = await prisma.application.findMany({
      where: { listing: { schoolId: { in: ids } } },
      include: { contract: true },
    });
    for (const a of apps) {
      for (const rel of [a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath]) deleteStored(rel);
      if (a.contract) {
        for (const rel of [a.contract.pdfPath, a.contract.schoolSignaturePath, a.contract.applicantSignaturePath, a.contract.signedPdfPath]) {
          deleteStored(rel);
        }
      }
    }
    await prisma.school.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.alert.deleteMany({ where: { email: { endsWith: DEMO_SUFFIX } } });
  await prisma.admin.deleteMany({ where: { email: { endsWith: DEMO_SUFFIX } } });
}

// ------------------------------ Contrat signé --------------------------------

// Reproduit le flux réel du Lot G : PDF proposé signé école, puis PDF final
// contresigné, avec les vraies empreintes SHA-256 — la page de suivi et les
// téléchargements sont pleinement démontrables.
async function creeContratSigne(school, listing, application) {
  const schoolSignaturePath = await signatureImage.saveSignature(PNG_SIGNATURE);
  const applicantSignaturePath = await signatureImage.saveSignature(PNG_SIGNATURE);
  const schoolSignedAt = daysAgo(14);
  const applicantSignedAt = daysAgo(12);

  const terms = {
    type: 'cdi',
    startDate: new Date(Date.now() + 21 * DAY_MS),
    endDate: null,
    motif: null,
    grossSalary: '2 300 € brut/mois',
    weeklyHours: 35,
    trialPeriodWeeks: 4,
    workplace: 'Marseille (secteur Prado – Castellane)',
    providerSiret: null,
    schoolAddress: '45 avenue du Prado, 13006 Marseille',
    applicantAddress: '18 rue Paradis, 13001 Marseille',
    extraClauses: null,
    birthDate: new Date('1993-04-12T00:00:00.000Z'),
    birthPlace: 'Avignon',
    nationality: 'Française',
    teachingAuthNumber: 'A-13-2019-0457',
    teachingAuthValidUntil: new Date('2029-06-30T00:00:00.000Z'),
    licenseNumber: '13AB45678',
    licenseCategories: 'B, A2',
  };

  const sigEcole = { imagePath: resolveStored(schoolSignaturePath), signedAt: schoolSignedAt, name: school.businessName };
  const proposedPdf = await buildContractPdf({
    type: terms.type, school, applicant: application, listing, terms,
    signatures: { school: sigEcole, applicant: null, proposedHash: null },
  });
  const proposedPdfHash = sha256Hex(proposedPdf);
  const pdfPath = `${SUBDIRS.contracts}/${crypto.randomBytes(16).toString('hex')}.pdf`;
  await fs.promises.writeFile(path.join(STORAGE_DIR, pdfPath), proposedPdf);

  const signedPdf = await buildContractPdf({
    type: terms.type, school, applicant: application, listing, terms,
    signatures: {
      school: sigEcole,
      applicant: { imagePath: resolveStored(applicantSignaturePath), signedAt: applicantSignedAt, name: application.applicantName },
      proposedHash: proposedPdfHash,
    },
  });
  const signedPdfPath = `${SUBDIRS.contracts}/${crypto.randomBytes(16).toString('hex')}.pdf`;
  await fs.promises.writeFile(path.join(STORAGE_DIR, signedPdfPath), signedPdf);

  await prisma.contract.create({
    data: {
      ...terms,
      applicationId: application.id,
      pdfPath,
      sentToApplicantAt: daysAgo(13),
      schoolSignaturePath,
      schoolSignedAt,
      applicantSignaturePath,
      applicantSignedAt,
      proposedPdfHash,
      signedPdfPath,
      signedPdfHash: sha256Hex(signedPdf),
    },
  });
}

// ----------------------------------- Seed ------------------------------------

async function seedDemo() {
  await nettoieDemo();

  const hashEcole = await passwordUtil.hash(MDP_ECOLE);
  const compteurs = { schools: 0, listings: 0, applications: 0, alerts: 0, signedContracts: 0 };

  // Écoles.
  const ecoles = [];
  for (let i = 0; i < ECOLES.length; i += 1) {
    const e = ECOLES[i];
    const ecole = await prisma.school.create({
      data: {
        email: `${e.slug}${DEMO_SUFFIX}`,
        passwordHash: hashEcole,
        businessName: e.name,
        siret: `99900001234${String(100 + i).slice(-3)}`,
        phone: e.phone,
        address: e.address,
        latitude: e.lat,
        longitude: e.lng,
        emailVerified: true,
        siretStatus: e.verified ? 'verified' : 'unverified',
        siretVerifiedName: e.verified ? e.name.toUpperCase() : null,
        siretCheckedAt: e.verified ? daysAgo(i + 1) : null,
      },
    });
    ecoles.push(ecole);
    compteurs.schools += 1;
  }
  const vitrine = ecoles[0];

  // Annonces de l'école vitrine.
  const annoncesVitrine = [];
  for (const a of ANNONCES_VITRINE) {
    const annonce = await prisma.listing.create({
      data: {
        title: a.title,
        description: a.description,
        contractType: a.contractType,
        city: 'Marseille',
        department: '13',
        hoursPerWeek: a.hoursPerWeek,
        compensation: a.compensation,
        status: a.status || 'open',
        viewsCount: a.views,
        createdAt: daysAgo(a.weeksAgo * 7),
        schoolId: vitrine.id,
        titleLower: a.title.toLowerCase(),
        descriptionLower: a.description.toLowerCase(),
        cityLower: 'marseille',
      },
    });
    annoncesVitrine.push(annonce);
    compteurs.listings += 1;
  }

  // Annonces des autres écoles (2 à 3 chacune, modèles variés, dates étalées).
  const autresAnnonces = [];
  for (let i = 1; i < ecoles.length; i += 1) {
    const ecole = ecoles[i];
    const ville = ECOLES[i].city;
    const nb = i % 3 === 0 ? 3 : 2;
    for (let t = 0; t < nb; t += 1) {
      const m = MODELES[(i * 2 + t * 5) % MODELES.length];
      const annonce = await prisma.listing.create({
        data: {
          title: m.title,
          description: m.description,
          contractType: m.contractType,
          city: ville,
          department: ECOLES[i].department,
          hoursPerWeek: m.hoursPerWeek,
          compensation: m.compensation,
          status: (i + t) % 8 === 0 ? 'closed' : 'open',
          viewsCount: 20 + ((i * 53 + t * 89) % 281),
          createdAt: daysAgo(((i * 3 + t * 7) % 12) * 7 + (i % 5)),
          schoolId: ecole.id,
          titleLower: m.title.toLowerCase(),
          descriptionLower: m.description.toLowerCase(),
          cityLower: ville.toLowerCase(),
        },
      });
      if (annonce.status === 'open') autresAnnonces.push(annonce);
      compteurs.listings += 1;
    }
  }

  // Candidatures : 15 sur la vitrine (dossier fourni), 45 réparties ailleurs.
  const STATUTS = ['pending', 'pending', 'pending', 'accepted', 'rejected'];
  const creeCandidature = async (listing, k, statut, joursCreation, extra = {}) => {
    const nom = CANDIDATS[k % CANDIDATS.length];
    const creation = daysAgo(joursCreation);
    const candidature = await prisma.application.create({
      data: {
        applicantName: nom,
        applicantEmail: `${slugifie(nom)}.${k}${DEMO_SUFFIX}`,
        applicantPhone: `06 ${String(10 + (k % 80))} ${String(20 + (k % 70))} ${String(10 + (k % 80))} ${String(20 + (k % 70))}`,
        message: MESSAGES[k % MESSAGES.length],
        status: statut,
        rejectedAt: statut === 'rejected' ? new Date(creation.getTime() + 3 * DAY_MS) : null,
        trackingToken: generateOpaqueToken(),
        listingId: listing.id,
        createdAt: creation,
        ...extra,
      },
    });
    compteurs.applications += 1;
    return candidature;
  };

  // Vitrine : pièces réelles sur les 4 premières, un contrat signé sur la 2e.
  const STATUTS_VITRINE = ['pending', 'accepted', 'accepted', 'rejected', 'pending', 'accepted', 'pending', 'rejected', 'pending', 'pending', 'pending', 'rejected', 'pending', 'accepted', 'pending'];
  let candidatureSignee = null;
  for (let v = 0; v < 15; v += 1) {
    // Jamais l'annonce clôturée (dernier index) ; la candidature signée (v = 1)
    // est forcée sur l'annonce phare : le contrat généré la référence.
    const annonce = v === 1 ? annoncesVitrine[0] : annoncesVitrine[v % (annoncesVitrine.length - 1)];
    const extra = {};
    if (v < 4) {
      const cvRel = `${SUBDIRS.cv}/demo-cv-${v}.pdf`;
      await fs.promises.writeFile(path.join(STORAGE_DIR, cvRel), MINI_PDF);
      extra.cvPath = cvRel;
      if (v < 2) {
        const idRel = `${SUBDIRS.id}/demo-id-${v}.pdf`;
        await fs.promises.writeFile(path.join(STORAGE_DIR, idRel), MINI_PDF);
        extra.idCardPath = idRel;
      }
    }
    const candidature = await creeCandidature(annonce, v, STATUTS_VITRINE[v], (v * 6) % 80, extra);
    if (v === 1) candidatureSignee = candidature; // Sophie Bernard — dossier signé
  }
  await creeContratSigne(vitrine, annoncesVitrine[0], candidatureSignee);
  compteurs.signedContracts += 1;

  // Autres écoles : 45 candidatures réparties sur les annonces ouvertes.
  for (let k = 0; k < 45; k += 1) {
    const annonce = autresAnnonces[k % autresAnnonces.length];
    await creeCandidature(annonce, k + 15, STATUTS[k % STATUTS.length], (k * 11) % 84);
  }

  // Alertes : 3 confirmées + 1 non confirmée antidatée (elle « meurt » en direct
  // quand on clique « Lancer une purge maintenant » devant le jury).
  const ALERTES = [
    { email: `alerte.marseille${DEMO_SUFFIX}`, department: '13', keyword: null, confirmedAt: daysAgo(20), createdAt: daysAgo(21) },
    { email: `alerte.lyon.moto${DEMO_SUFFIX}`, department: '69', keyword: 'moto', confirmedAt: daysAgo(9), createdAt: daysAgo(9) },
    { email: `alerte.paris.cdi${DEMO_SUFFIX}`, department: '75', keyword: 'CDI', confirmedAt: daysAgo(15), createdAt: daysAgo(16) },
    { email: `alerte.oubliee${DEMO_SUFFIX}`, department: '33', keyword: null, confirmedAt: null, createdAt: daysAgo(10) },
  ];
  for (const a of ALERTES) {
    await prisma.alert.create({
      data: {
        email: a.email,
        department: a.department,
        keyword: a.keyword,
        keywordLower: (a.keyword || '').toLowerCase(),
        confirmedAt: a.confirmedAt,
        createdAt: a.createdAt,
        unsubscribeToken: generateOpaqueToken(),
      },
    });
    compteurs.alerts += 1;
  }

  // Admin de démo.
  const admin = await prisma.admin.create({
    data: { email: `admin${DEMO_SUFFIX}`, passwordHash: await passwordUtil.hash(MDP_ADMIN) },
  });

  return {
    ...compteurs,
    trackingToken: candidatureSignee.trackingToken,
    credentials: {
      school: { email: vitrine.email, password: MDP_ECOLE },
      admin: { email: admin.email, password: MDP_ADMIN },
    },
  };
}

// Runner CLI (exécuté seulement si lancé directement, pas au require).
async function runCli() {
  require('dotenv').config({ quiet: true });
  try {
    const r = await seedDemo();
    console.log('Données de démo prêtes :');
    console.log(`  ${r.schools} auto-écoles, ${r.listings} annonces, ${r.applications} candidatures, ${r.alerts} alertes, ${r.signedContracts} contrat signé.`);
    console.log('\nComptes de démonstration :');
    console.log(`  École vitrine : ${r.credentials.school.email} / ${r.credentials.school.password}`);
    console.log(`  Admin         : ${r.credentials.admin.email} / ${r.credentials.admin.password}`);
    console.log('\nURLs clés :');
    console.log('  Carte des annonces : http://localhost:3000/annonces?vue=carte');
    console.log('  Tableau de bord    : http://localhost:3000/tableau-de-bord');
    console.log('  Administration     : http://localhost:3000/admin');
    console.log(`  Suivi candidat (contrat signé) : http://localhost:3000/suivi/${r.trackingToken}`);
    console.log('  Alertes email      : http://localhost:3000/alertes');
    await prisma.$disconnect();
  } catch (err) {
    console.error(`Échec du seed : ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) runCli();

module.exports = { seedDemo, DEMO_DOMAIN };
