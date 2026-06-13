// Pages publiques générales.
function home(req, res) {
  res.render('index', { title: 'Accueil' });
}

module.exports = { home };
