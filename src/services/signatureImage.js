// Validation et écriture des images de signature (export PNG du pad canvas).
// Aucune confiance dans le client : préfixe data URL, base64, magic bytes PNG et
// taille sont vérifiés avant toute écriture. Stockage PRIVÉ (storage/signatures/),
// noms régénérés — mêmes règles que les pièces de candidature.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { STORAGE_DIR, SUBDIRS } = require('../config/storage');

const PREFIX = 'data:image/png;base64,';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 200 * 1024; // 200 Ko : très large pour un trait de signature
const MIN_BYTES = 50; // garde-fou contre un contenu manifestement vide

// Décode et valide une signature transmise par formulaire. Buffer PNG, ou null.
function decodeSignature(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX)) return null;
  const b64 = dataUrl.slice(PREFIX.length);
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return null;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < MIN_BYTES || buf.length > MAX_BYTES) return null;
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return buf;
}

// Écrit la signature dans le stockage privé ; renvoie le chemin relatif (stocké en base).
async function saveSignature(buf) {
  const filename = `${crypto.randomBytes(16).toString('hex')}.png`;
  await fs.promises.writeFile(path.join(STORAGE_DIR, SUBDIRS.signatures, filename), buf);
  return `${SUBDIRS.signatures}/${filename}`;
}

module.exports = { decodeSignature, saveSignature, MAX_BYTES };
