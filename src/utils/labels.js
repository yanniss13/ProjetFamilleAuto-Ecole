'use strict';

// Libellés lisibles des valeurs stockées en base (partagés par les vues et l'admin).
const CONTRACT_LABELS = Object.freeze({
  cdi: 'CDI', cdd: 'CDD', freelance: 'Indépendant', apprentissage: 'Apprentissage',
});

function contractLabel(type) {
  return CONTRACT_LABELS[type] || type || '';
}

module.exports = { CONTRACT_LABELS, contractLabel };
