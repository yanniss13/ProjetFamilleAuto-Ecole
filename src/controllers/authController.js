// Authentification auto-école (email + mot de passe, vérification email, reset).
// Suit docs/DESIGN.md : validation serveur, bcrypt, jetons HACHÉS à usage unique et
// expirants, régénération de session à la connexion, réponses génériques anti-énumération.
const { validateRegister, validateLogin } = require('../validators/schoolValidator');
const password = require('../utils/password');
const schoolService = require('../services/schoolService');
const tokens = require('../services/tokens');
const mailer = require('../services/mailer');
const geocoder = require('../services/geocoder');

// Durées de validité des jetons (cf. emails).
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const RESET_TTL_MS = 60 * 60 * 1000; // 1 h
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

// Hash bcrypt « leurre » : comparé quand l'email est inconnu, pour que la connexion
// prenne un temps comparable qu'on connaisse ou non le compte (anti-énumération par
// timing). Calculé une seule fois, à la demande.
let dummyHashPromise = null;
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = password.hash('moniteur-connect-dummy');
  return dummyHashPromise;
}

// -------------------------------- Inscription --------------------------------

function showRegister(req, res) {
  res.render('auth/register', { title: 'Inscription', errors: {}, values: {} });
}

async function register(req, res, next) {
  try {
    const { isValid, errors, value } = validateRegister(req.body);
    const values = { businessName: value.businessName, email: value.email, siret: value.siret, phone: req.body.phone, address: req.body.address };

    if (!isValid) {
      return res.status(400).render('auth/register', { title: 'Inscription', errors, values });
    }

    // Unicité email / SIRET (les contraintes @unique en base nous protègent en dernier ressort).
    const [byEmail, bySiret] = await Promise.all([
      schoolService.findByEmail(value.email),
      schoolService.findBySiret(value.siret),
    ]);
    if (byEmail) errors.email = 'Un compte existe déjà avec cet email.';
    if (bySiret) errors.siret = 'Un compte existe déjà avec ce SIRET.';
    if (Object.keys(errors).length > 0) {
      return res.status(400).render('auth/register', { title: 'Inscription', errors, values });
    }

    const passwordHash = await password.hash(value.password);
    const { raw, hash } = tokens.generateToken();

    // Géocode l'adresse si fournie (non bloquant : échec -> coords nulles, carte masquée).
    const { latitude, longitude } = await geocoder.coordsFor(value.address);

    await schoolService.create({
      businessName: value.businessName,
      email: value.email,
      siret: value.siret,
      phone: value.phone,
      address: value.address,
      latitude,
      longitude,
      passwordHash,
      verifyTokenHash: hash,
      verifyTokenExpiry: new Date(Date.now() + VERIFY_TTL_MS),
    });

    await mailer.sendVerification(value.email, raw);

    req.flash('success', 'Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.');
    res.redirect('/connexion');
  } catch (err) {
    next(err);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const hash = tokens.hashToken(req.params.token);
    const school = await schoolService.findByVerifyTokenHash(hash);

    const valid =
      school &&
      school.verifyTokenExpiry &&
      school.verifyTokenExpiry > new Date();

    if (!valid) {
      return res
        .status(400)
        .render('auth/verify-notice', { title: 'Vérification de l’email', status: 'invalid' });
    }

    // Idempotent : marque vérifié et consomme le jeton (usage unique).
    await schoolService.update(school.id, {
      emailVerified: true,
      verifyTokenHash: null,
      verifyTokenExpiry: null,
    });

    res.render('auth/verify-notice', { title: 'Vérification de l’email', status: 'success' });
  } catch (err) {
    next(err);
  }
}

// --------------------------------- Connexion ---------------------------------

function showLogin(req, res) {
  res.render('auth/login', { title: 'Connexion', errors: {}, values: {} });
}

async function login(req, res, next) {
  try {
    const { isValid, errors, value } = validateLogin(req.body);
    const values = { email: value.email };
    if (!isValid) {
      return res.status(400).render('auth/login', { title: 'Connexion', errors, values });
    }

    const school = await schoolService.findByEmail(value.email);
    // Message générique (anti-énumération) : on ne distingue pas email inconnu /
    // mauvais mot de passe. On compare malgré tout pour limiter l'oracle temporel.
    const ok = await password.compare(value.password, school ? school.passwordHash : await getDummyHash());

    if (!school || !ok) {
      return res
        .status(401)
        .render('auth/login', { title: 'Connexion', errors: { global: 'Email ou mot de passe incorrect.' }, values });
    }

    if (!school.emailVerified) {
      return res.status(403).render('auth/login', {
        title: 'Connexion',
        errors: { global: 'Veuillez confirmer votre adresse email avant de vous connecter.' },
        values,
      });
    }

    // Régénération de session à la connexion (anti fixation de session).
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.schoolId = school.id;
      req.flash('success', `Bienvenue, ${school.businessName}.`);
      res.redirect('/tableau-de-bord');
    });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/connexion'));
}

// ---------------------------- Mot de passe oublié ----------------------------

function showForgot(req, res) {
  res.render('auth/forgot', { title: 'Mot de passe oublié', errors: {} });
}

async function forgot(req, res, next) {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const school = email ? await schoolService.findByEmail(email) : null;

    if (school) {
      const { raw, hash } = tokens.generateToken();
      await schoolService.update(school.id, {
        resetTokenHash: hash,
        resetTokenExpiry: new Date(Date.now() + RESET_TTL_MS),
      });
      await mailer.sendReset(school.email, raw);
    }

    // Réponse TOUJOURS identique, qu'un compte existe ou non (anti-énumération).
    req.flash('success', 'Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.');
    res.redirect('/connexion');
  } catch (err) {
    next(err);
  }
}

function showReset(req, res) {
  res.render('auth/reset', { title: 'Nouveau mot de passe', errors: {} });
}

async function reset(req, res, next) {
  try {
    const hash = tokens.hashToken(req.params.token);
    const school = await schoolService.findByResetTokenHash(hash);
    const valid = school && school.resetTokenExpiry && school.resetTokenExpiry > new Date();

    if (!valid) {
      req.flash('error', 'Lien de réinitialisation invalide ou expiré. Veuillez en demander un nouveau.');
      return res.redirect('/mot-de-passe-oublie');
    }

    const pwd = req.body.password || '';
    const confirm = req.body.passwordConfirm || '';
    const errors = {};
    if (!pwd) errors.password = 'Le mot de passe est obligatoire.';
    else if (pwd.length < PASSWORD_MIN) errors.password = `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`;
    else if (Buffer.byteLength(pwd, 'utf8') > PASSWORD_MAX) errors.password = `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX} caractères.`;
    if (pwd !== confirm) errors.passwordConfirm = 'Les mots de passe ne correspondent pas.';

    if (Object.keys(errors).length > 0) {
      return res.status(400).render('auth/reset', { title: 'Nouveau mot de passe', errors });
    }

    const passwordHash = await password.hash(pwd);
    // Change le mot de passe et consomme le jeton (usage unique).
    await schoolService.update(school.id, {
      passwordHash,
      resetTokenHash: null,
      resetTokenExpiry: null,
    });

    req.flash('success', 'Mot de passe réinitialisé. Vous pouvez vous connecter.');
    res.redirect('/connexion');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  showRegister,
  register,
  verifyEmail,
  showLogin,
  login,
  logout,
  showForgot,
  forgot,
  showReset,
  reset,
};
