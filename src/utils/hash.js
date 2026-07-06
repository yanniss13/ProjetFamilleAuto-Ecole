// Empreintes de documents (preuve d'intégrité pour la signature électronique).
const crypto = require('crypto');

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Présentation lisible d'une empreinte : groupes de 8 caractères hexadécimaux.
function formatHash(hex) {
  return String(hex || '').replace(/(.{8})(?=.)/g, '$1 ');
}

module.exports = { sha256Hex, formatHash };
