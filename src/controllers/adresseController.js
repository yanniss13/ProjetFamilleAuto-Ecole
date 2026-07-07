// Relais interne de l'API Adresse : la CSP impose un appel meme-origine depuis le
// navigateur, et l'autocompletion reste volontairement non bloquante.
const adresseService = require('../services/adresse');

// GET /api/adresse?q=...
async function search(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) {
      return res.status(400).json({ erreur: 'Requête trop courte.' });
    }

    const resultats = await adresseService.searchAddress(q);
    res.json({ resultats });
  } catch (err) {
    next(err);
  }
}

module.exports = { search };
