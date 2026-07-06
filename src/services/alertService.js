// Alertes email des moniteurs (Lot I) : abonnement double opt-in, désabonnement,
// et notification à la publication d'une annonce.
const prisma = require('../config/prisma');
const { generateToken, hashToken, generateOpaqueToken } = require('./tokens');
const mailer = require('./mailer');

// Crée ou réutilise l'alerte (unicité email + département + mot-clé normalisé).
// Renvoie { alert, rawConfirmToken } : null si l'alerte est déjà confirmée (rien à
// renvoyer), régénéré si elle attend encore sa confirmation (le dernier email gagne).
async function subscribe(email, department, keyword) {
  const cleanKeyword = (keyword || '').trim();
  const keywordLower = cleanKeyword.toLowerCase();
  const existing = await prisma.alert.findUnique({
    where: { email_department_keywordLower: { email, department, keywordLower } },
  });
  if (existing && existing.confirmedAt) return { alert: existing, rawConfirmToken: null };

  const { raw, hash } = generateToken();
  if (existing) {
    const alert = await prisma.alert.update({ where: { id: existing.id }, data: { confirmTokenHash: hash } });
    return { alert, rawConfirmToken: raw };
  }
  try {
    const alert = await prisma.alert.create({
      data: {
        email,
        department,
        keyword: cleanKeyword || null,
        keywordLower,
        confirmTokenHash: hash,
        unsubscribeToken: generateOpaqueToken(),
      },
    });
    return { alert, rawConfirmToken: raw };
  } catch (err) {
    // P2002 : deux POST identiques simultanés — on repart sur la ligne gagnante.
    if (err.code === 'P2002') return subscribe(email, department, keyword);
    throw err;
  }
}

// Active l'alerte du jeton (reçu en clair, hashé pour le lookup). Idempotent : le
// jeton est conservé après confirmation, un re-clic renvoie la même alerte active.
async function confirmByToken(rawToken) {
  const alert = await prisma.alert.findUnique({ where: { confirmTokenHash: hashToken(rawToken) } });
  if (!alert) return null;
  if (alert.confirmedAt) return alert;
  return prisma.alert.update({ where: { id: alert.id }, data: { confirmedAt: new Date() } });
}

function findByUnsubscribeToken(token) {
  return prisma.alert.findUnique({ where: { unsubscribeToken: token } });
}

// Suppression réelle de la ligne (RGPD) — pas de corbeille, pas de soft delete.
async function deleteByUnsubscribeToken(token) {
  const { count } = await prisma.alert.deleteMany({ where: { unsubscribeToken: token } });
  return count > 0;
}

module.exports = { subscribe, confirmByToken, findByUnsubscribeToken, deleteByUnsubscribeToken };
