// Espace d'administration : supervision et modération (protégé par requireAdmin + loadAdmin).
// La modération (listes + actions) est ajoutée en Task 4.

// GET /admin
async function dashboard(req, res, next) {
  try {
    res.render('admin/dashboard', { title: 'Administration', stats: null });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard };
