// Jetons pour la vérification d'email et la réinitialisation de mot de passe.
// On envoie le jeton EN CLAIR par email, mais on ne stocke que son HASH en base
// (comme un mot de passe) : une fuite de la base ne permet pas de forger un lien.
const crypto = require('crypto');

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Retourne { raw, hash } : `raw` part dans le lien email, `hash` est stocké.
function generateToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}

// Jeton opaque non hashé (lien de suivi candidat) : non sensible (ne révèle que le statut,
// déjà en base), donc stockable en clair pour pouvoir reconstruire le lien dans les emails.
function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashToken, generateToken, generateOpaqueToken };
