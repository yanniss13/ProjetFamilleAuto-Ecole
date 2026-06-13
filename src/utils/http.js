// Petits helpers HTTP partagés par les contrôleurs.

// Convertit un paramètre d'URL en identifiant numérique valide, ou null.
function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Répond par la page 404 (ressource inexistante ou non autorisée, sans distinction).
function notFound(res) {
  return res.status(404).render('errors/404', { title: 'Introuvable' });
}

module.exports = { parseId, notFound };
