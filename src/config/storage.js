// Stockage privé des fichiers téléversés (CV, pièces d'identité, contrats).
// Hors de public/ : ces fichiers contiennent des données personnelles (RGPD) et ne sont
// JAMAIS servis statiquement. L'accès passe par des routes protégées (école propriétaire)
// ou, pour le contrat, par une pièce jointe email au candidat.
const path = require('path');
const fs = require('fs');

const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage');
const SUBDIRS = { cv: 'cv', id: 'id', license: 'license', teaching: 'teaching', contracts: 'contracts', signatures: 'signatures' };

// Crée l'arborescence au démarrage (idempotent).
for (const sub of Object.values(SUBDIRS)) {
  fs.mkdirSync(path.join(STORAGE_DIR, sub), { recursive: true });
}

// Résout un chemin relatif stocké en base (ex. "cv/ab12.pdf") en chemin absolu, en
// refusant toute tentative de remontée hors de storage/ (anti path traversal).
function resolveStored(relPath) {
  const abs = path.resolve(STORAGE_DIR, relPath);
  if (abs !== STORAGE_DIR && !abs.startsWith(STORAGE_DIR + path.sep)) {
    return null;
  }
  return abs;
}

// Supprime un fichier du stockage privé en best-effort : tolère l'absence et ne lève
// jamais (une erreur disque ne doit pas empêcher une suppression logique en base).
function deleteStored(relPath) {
  if (!relPath) return;
  const abs = resolveStored(relPath);
  if (!abs) return;
  try {
    fs.rmSync(abs, { force: true });
  } catch (err) {
    console.warn(`deleteStored: échec suppression ${relPath}:`, err.message);
  }
}

module.exports = { STORAGE_DIR, SUBDIRS, resolveStored, deleteStored };
