// Authentification administrateur (login isolé, session adminId, anti-énumération).
const { validateAdminLogin } = require('../validators/adminValidator');
const password = require('../utils/password');
const adminService = require('../services/adminService');

let dummyHashPromise = null;
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = password.hash('moniteur-connect-admin-dummy');
  return dummyHashPromise;
}

function showLogin(req, res) {
  res.render('admin/login', { title: 'Connexion admin', errors: {}, values: {} });
}

async function login(req, res, next) {
  try {
    const { isValid, errors, value } = validateAdminLogin(req.body);
    const values = { email: value.email };
    if (!isValid) {
      return res.status(400).render('admin/login', { title: 'Connexion admin', errors, values });
    }
    const admin = await adminService.findByEmail(value.email);
    const good = await password.compare(value.password, admin ? admin.passwordHash : await getDummyHash());
    if (!admin || !good) {
      return res.status(401).render('admin/login', {
        title: 'Connexion admin', errors: { global: 'Email ou mot de passe incorrect.' }, values,
      });
    }
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.adminId = admin.id;
      req.flash('success', 'Connecté à l’espace administration.');
      res.redirect('/admin');
    });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/admin/connexion'));
}

module.exports = { showLogin, login, logout };
