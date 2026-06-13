// Envoi des emails (vérification, réinitialisation, notification de candidature).
// Si SMTP_HOST n'est pas configuré => mode dev : on n'envoie rien et on affiche le
// lien dans la console (pratique pour tester sans serveur mail).
const nodemailer = require('nodemailer');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const FROM = process.env.MAIL_FROM || 'MoniteurConnect <no-reply@moniteur-connect.local>';
const SMTP_CONFIGURE = Boolean(process.env.SMTP_HOST);

const transporter = SMTP_CONFIGURE
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465, // 465 = TLS direct, sinon STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

// Masque un email pour les logs : jean.dupont@mail.fr -> j***@m***.fr
function maskEmail(email) {
  const [local, domaine] = String(email || '').split('@');
  if (!domaine) return '***';
  const parts = domaine.split('.');
  const tld = parts.length > 1 ? '.' + parts[parts.length - 1] : '';
  return `${(local && local[0]) || '*'}***@${(parts[0] && parts[0][0]) || '*'}***${tld}`;
}

// Envoi générique. Ne logge jamais le contenu/jeton, seulement l'email masqué.
// Renvoie true si l'email est parti (ou, en mode dev sans SMTP, s'il a été « traité »
// et journalisé), false uniquement en cas d'échec réel d'envoi SMTP.
// `link` et `attachments` sont optionnels.
async function send(to, subject, html, { link = null, attachments = null } = {}) {
  if (!SMTP_CONFIGURE) {
    console.warn(`[mail:DEV] SMTP non configuré — "${subject}" pour ${maskEmail(to)} non envoyé.`);
    if (link) console.warn(`[mail:DEV] Lien : ${link}`);
    if (attachments) console.warn(`[mail:DEV] Pièce(s) jointe(s) : ${attachments.map((a) => a.path).join(', ')}`);
    return true; // dev : considéré comme traité (journalisé) — ne bloque pas le flux applicatif
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html, ...(attachments ? { attachments } : {}) });
    console.log(`[mail] "${subject}" envoyé à ${maskEmail(to)}`);
    return true;
  } catch (e) {
    console.error(`[mail] ÉCHEC "${subject}" -> ${maskEmail(to)} : ${e.code || e.message || 'erreur'}`);
    return false;
  }
}

// --- Emails métier (le corps HTML pourra être enrichi à l'implémentation) ---

function sendVerification(email, rawToken) {
  const link = `${APP_URL}/verifier-email/${rawToken}`;
  return send(
    email,
    'Confirmez votre adresse email',
    `<p>Bienvenue sur MoniteurConnect.</p>
     <p>Confirmez votre adresse (lien valable 24 h) :</p>
     <p><a href="${link}">Vérifier mon adresse</a></p>`,
    { link }
  );
}

function sendReset(email, rawToken) {
  const link = `${APP_URL}/reinitialiser/${rawToken}`;
  return send(
    email,
    'Réinitialisez votre mot de passe',
    `<p>Vous avez demandé à réinitialiser votre mot de passe.</p>
     <p>Lien valable 1 h, usage unique :</p>
     <p><a href="${link}">Choisir un nouveau mot de passe</a></p>`,
    { link }
  );
}

// Notifie l'auto-école qu'une candidature a été déposée sur son annonce.
function sendApplicationNotification(schoolEmail, listingTitle, applicantName) {
  return send(
    schoolEmail,
    `Nouvelle candidature — ${listingTitle}`,
    `<p>Vous avez reçu une candidature de <strong>${applicantName}</strong> pour votre annonce
     « ${listingTitle} ».</p>
     <p>Connectez-vous à votre tableau de bord pour la consulter.</p>`
  );
}

// Envoie le contrat (PDF) au candidat en pièce jointe (déclenché manuellement par l'école).
function sendContractToApplicant(applicantEmail, applicantName, listingTitle, pdfPath) {
  return send(
    applicantEmail,
    `Votre contrat — ${listingTitle}`,
    `<p>Bonjour ${applicantName},</p>
     <p>Votre candidature à l'annonce « ${listingTitle} » a été acceptée. Vous trouverez votre
     contrat en pièce jointe.</p>
     <p>Merci de le relire ; en cas de question, répondez directement à l'auto-école.</p>`,
    { attachments: [{ filename: 'contrat.pdf', path: pdfPath, contentType: 'application/pdf' }] }
  );
}

module.exports = {
  send,
  sendVerification,
  sendReset,
  sendApplicationNotification,
  sendContractToApplicant,
  maskEmail,
  APP_URL,
};
