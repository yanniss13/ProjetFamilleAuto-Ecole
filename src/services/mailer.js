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

// Échappe le texte fourni par l'utilisateur avant interpolation dans le HTML d'un email
// (nom du candidat, titre d'annonce). Évite une injection HTML/lien dans un email lu par
// l'auto-école ou le candidat. Les sujets restent en clair (non HTML), donc non échappés.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ------------------------- Habillage HTML commun -------------------------
// Contraintes des clients mail : CSS inline uniquement, mise en page par tableaux,
// AUCUNE ressource externe (image, police, feuille de style, script). Les couleurs
// reprennent la charte du site (public/css/style.css).
// `title` est échappé ici ; `contentHtml` et `footerHtml` sont fournis par
// l'appelant, qui a déjà passé `esc()` sur tout texte utilisateur interpolé.
const EMAIL_FONT = "Arial, 'Segoe UI', sans-serif";

function emailLayout({ title, contentHtml, cta = null, footerHtml = '' }) {
  const bouton = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 8px;">
        <tr><td style="border-radius:6px;background-color:#2563eb;">
          <a href="${cta.url}" style="display:inline-block;padding:12px 24px;font-family:${EMAIL_FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:12px;color:#6b7280;text-align:center;word-break:break-all;">
        Si le bouton ne fonctionne pas, copiez ce lien : <a href="${cta.url}" style="color:#2563eb;">${cta.url}</a>
      </p>`
    : '';
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background-color:#f4f6f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
        <tr>
          <td style="background-color:#2563eb;border-radius:8px 8px 0 0;padding:16px 28px;">
            <span style="font-family:${EMAIL_FONT};font-size:18px;font-weight:bold;color:#ffffff;">MoniteurConnect</span>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:28px;">
            <h1 style="margin:0 0 16px;font-family:${EMAIL_FONT};font-size:20px;line-height:1.3;color:#111827;">${esc(title)}</h1>
            <div style="font-family:${EMAIL_FONT};font-size:14px;line-height:1.6;color:#374151;">${contentHtml}</div>
            ${bouton}
            ${footerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 8px;text-align:center;">
            <p style="margin:0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;color:#6b7280;">
              MoniteurConnect — auto-écoles &amp; moniteurs indépendants<br>
              Email automatique, merci de ne pas y répondre.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

// --- Emails métier (tous habillés par emailLayout) ---

function sendVerification(email, rawToken) {
  const link = `${APP_URL}/verifier-email/${rawToken}`;
  return send(
    email,
    'Confirmez votre adresse email',
    emailLayout({
      title: 'Bienvenue sur MoniteurConnect',
      contentHtml: `<p>Votre compte auto-école vient d’être créé.</p>
        <p>Confirmez votre adresse email pour activer votre espace et publier vos annonces.
        Ce lien est valable 24 heures.</p>`,
      cta: { label: 'Vérifier mon adresse', url: link },
    }),
    { link }
  );
}

function sendReset(email, rawToken) {
  const link = `${APP_URL}/reinitialiser/${rawToken}`;
  return send(
    email,
    'Réinitialisez votre mot de passe',
    emailLayout({
      title: 'Réinitialisation du mot de passe',
      contentHtml: `<p>Vous avez demandé à réinitialiser votre mot de passe.
        Ce lien est valable 1 heure et à usage unique.</p>
        <p>Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet email :
        votre mot de passe actuel reste inchangé.</p>`,
      cta: { label: 'Choisir un nouveau mot de passe', url: link },
    }),
    { link }
  );
}

// Notifie l'auto-école qu'une candidature a été déposée sur son annonce.
function sendApplicationNotification(schoolEmail, listingTitle, applicantName) {
  const link = `${APP_URL}/tableau-de-bord`;
  return send(
    schoolEmail,
    `Nouvelle candidature — ${listingTitle}`,
    emailLayout({
      title: 'Vous avez reçu une candidature',
      contentHtml: `<p><strong>${esc(applicantName)}</strong> vient de postuler à votre annonce
        « ${esc(listingTitle)} ».</p>
        <p>Retrouvez son CV et ses pièces dans votre espace pour lui répondre rapidement —
        les meilleurs profils partent vite.</p>`,
      cta: { label: 'Ouvrir mon tableau de bord', url: link },
    }),
    { link }
  );
}

// Invite le candidat à lire et signer son contrat en ligne (page de suivi).
function sendSignatureInvitation(applicantEmail, applicantName, listingTitle, token) {
  const link = `${APP_URL}/suivi/${token}`;
  return send(
    applicantEmail,
    `Votre contrat est prêt à signer — ${listingTitle}`,
    emailLayout({
      title: 'Votre contrat est prêt',
      contentHtml: `<p>Bonjour ${esc(applicantName)},</p>
        <p>L’auto-école a établi et signé votre contrat pour « ${esc(listingTitle)} ».</p>
        <p>Lisez-le attentivement puis signez-le en ligne depuis votre page de suivi —
        vous recevrez ensuite le document final signé par les deux parties.</p>`,
      cta: { label: 'Lire et signer mon contrat', url: link },
    }),
    { link }
  );
}

// Envoie le contrat signé par les deux parties (PDF final) à un destinataire.
function sendSignedContract(to, name, listingTitle, pdfPath) {
  return send(
    to,
    `Contrat signé — ${listingTitle}`,
    emailLayout({
      title: 'Contrat signé par les deux parties',
      contentHtml: `<p>Bonjour ${esc(name)},</p>
        <p>Le contrat lié à « ${esc(listingTitle)} » a été signé par les deux parties.</p>
        <p>Vous trouverez le document final en pièce jointe — conservez-le précieusement.
        Son intégrité est garantie par une empreinte numérique inscrite dans le document.</p>`,
    }),
    { attachments: [{ filename: 'contrat-signe.pdf', path: pdfPath, contentType: 'application/pdf' }] }
  );
}

// Confirme au candidat la réception de sa candidature + lien de suivi.
function sendApplicationConfirmation(applicantEmail, applicantName, listingTitle, token) {
  const link = token ? `${APP_URL}/suivi/${token}` : null;
  return send(
    applicantEmail,
    `Candidature reçue — ${listingTitle}`,
    emailLayout({
      title: 'Candidature bien reçue',
      contentHtml: `<p>Bonjour ${esc(applicantName)},</p>
        <p>Votre candidature à l’annonce « ${esc(listingTitle)} » a bien été transmise à
        l’auto-école.</p>
        ${link ? '<p>Vous pouvez suivre son avancement à tout moment, sans créer de compte :</p>' : ''}`,
      cta: link ? { label: 'Suivre ma candidature', url: link } : null,
    }),
    { link }
  );
}

// Informe le candidat que sa candidature est acceptée (le contrat suit, envoyé par l'école).
function sendApplicationAccepted(applicantEmail, applicantName, listingTitle, token) {
  const link = token ? `${APP_URL}/suivi/${token}` : null;
  return send(
    applicantEmail,
    `Candidature acceptée — ${listingTitle}`,
    emailLayout({
      title: 'Bonne nouvelle : candidature acceptée',
      contentHtml: `<p>Bonjour ${esc(applicantName)},</p>
        <p>Votre candidature à « ${esc(listingTitle)} » a été <strong>acceptée</strong>.
        L’auto-école prépare votre contrat : vous recevrez une invitation à le signer en ligne.</p>`,
      cta: link ? { label: 'Voir le suivi de mon dossier', url: link } : null,
    }),
    { link }
  );
}

// Informe le candidat que sa candidature n'a pas été retenue.
function sendApplicationRejected(applicantEmail, applicantName, listingTitle, token) {
  const link = token ? `${APP_URL}/suivi/${token}` : null;
  return send(
    applicantEmail,
    `Votre candidature — ${listingTitle}`,
    emailLayout({
      title: 'Réponse à votre candidature',
      contentHtml: `<p>Bonjour ${esc(applicantName)},</p>
        <p>Votre candidature à « ${esc(listingTitle)} » n’a pas été retenue cette fois-ci.
        Merci de l’intérêt porté à cette auto-école.</p>
        <p>D’autres annonces sont publiées chaque semaine — vous pouvez aussi créer une
        alerte email pour être prévenu(e) automatiquement.</p>`,
      cta: link ? { label: 'Voir le suivi', url: link } : null,
    }),
    { link }
  );
}

// Confirme l'abonnement à une alerte (double opt-in) : l'alerte n'est active
// qu'après le clic. Le jeton part en clair dans le lien, seul son hash est en base.
function sendAlertConfirmation(email, department, keyword, rawToken) {
  const link = `${APP_URL}/alertes/confirmer/${rawToken}`;
  return send(
    email,
    'Confirmez votre alerte MoniteurConnect',
    emailLayout({
      title: 'Activez votre alerte email',
      contentHtml: `<p>Vous avez demandé une alerte pour les annonces du département
        <strong>${esc(department)}</strong>${keyword ? ` (mot-clé « ${esc(keyword)} »)` : ''}.</p>
        <p>Confirmez votre adresse pour l’activer : vous recevrez ensuite un email à chaque
        nouvelle annonce correspondante.</p>`,
      cta: { label: 'Activer mon alerte', url: link },
      footerHtml: `<p style="margin:16px 0 0;font-family:${EMAIL_FONT};font-size:12px;color:#6b7280;">
        Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet email —
        aucune alerte ne sera activée.</p>`,
    }),
    { link }
  );
}

// Alerte : une nouvelle annonce correspond aux critères de l'abonné. Le lien de
// désabonnement figure dans CHAQUE email (obligation d'opt-out).
function sendListingAlert(email, listing, unsubscribeToken) {
  const link = `${APP_URL}/annonces/${listing.id}`;
  const unsubscribeLink = `${APP_URL}/alertes/desabonner/${unsubscribeToken}`;
  return send(
    email,
    `Nouvelle annonce — ${listing.title}`,
    emailLayout({
      title: 'Une annonce correspond à votre alerte',
      contentHtml: `<p><strong>${esc(listing.title)}</strong><br>
        ${esc(listing.city)} (${esc(listing.department)})</p>`,
      cta: { label: 'Voir l’annonce et postuler', url: link },
      footerHtml: `<p style="margin:16px 0 0;font-family:${EMAIL_FONT};font-size:12px;color:#6b7280;text-align:center;">
        <a href="${unsubscribeLink}" style="color:#6b7280;">Se désabonner de cette alerte</a></p>`,
    }),
    { link }
  );
}

module.exports = {
  send,
  emailLayout,
  sendVerification,
  sendReset,
  sendApplicationNotification,
  sendSignatureInvitation,
  sendSignedContract,
  sendApplicationConfirmation,
  sendApplicationAccepted,
  sendApplicationRejected,
  sendAlertConfirmation,
  sendListingAlert,
  maskEmail,
  esc,
  APP_URL,
};
