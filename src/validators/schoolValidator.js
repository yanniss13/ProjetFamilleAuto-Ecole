// Validation serveur — inscription / connexion d'une auto-école.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // limite bcrypt (octets)

// Longueurs maximales des champs texte libres (254 = maximum RFC pour un email).
const MAX = { businessName: 150, email: 254, phone: 30, address: 250 };

function normalizeSiret(value) {
  return (value || '').replace(/\D/g, '');
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRegister(body) {
  const errors = {};
  const businessName = (body.businessName || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const siret = normalizeSiret(body.siret);
  const phone = (body.phone || '').trim();
  const address = (body.address || '').trim();
  const password = body.password || '';
  const passwordConfirm = body.passwordConfirm || '';

  if (!businessName) errors.businessName = 'La raison sociale est obligatoire.';
  else if (businessName.length > MAX.businessName) errors.businessName = `La raison sociale ne doit pas dépasser ${MAX.businessName} caractères.`;

  if (!email) errors.email = "L'email est obligatoire.";
  else if (email.length > MAX.email || !isValidEmail(email)) errors.email = "L'email n'est pas valide.";

  if (!siret) errors.siret = 'Le SIRET est obligatoire.';
  else if (siret.length !== 14) errors.siret = 'Le SIRET doit contenir 14 chiffres.';

  if (phone.length > MAX.phone) errors.phone = `Le téléphone ne doit pas dépasser ${MAX.phone} caractères.`;
  if (address.length > MAX.address) errors.address = `L'adresse ne doit pas dépasser ${MAX.address} caractères.`;

  if (!password) errors.password = 'Le mot de passe est obligatoire.';
  else if (password.length < PASSWORD_MIN) errors.password = `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`;
  else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX) errors.password = `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX} caractères.`;

  if (password !== passwordConfirm) errors.passwordConfirm = 'Les mots de passe ne correspondent pas.';

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: { businessName, email, siret, phone: phone || null, address: address || null, password },
  };
}

// Profil éditable (adresse + téléphone) — tous deux optionnels.
function validateProfile(body) {
  const errors = {};
  const phone = (body.phone || '').trim();
  const address = (body.address || '').trim();
  if (phone.length > MAX.phone) errors.phone = `Le téléphone ne doit pas dépasser ${MAX.phone} caractères.`;
  if (address.length > MAX.address) errors.address = `L'adresse ne doit pas dépasser ${MAX.address} caractères.`;
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: { phone: phone || null, address: address || null },
  };
}

function validateLogin(body) {
  const errors = {};
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email) errors.email = "L'email est obligatoire.";
  if (!password) errors.password = 'Le mot de passe est obligatoire.';
  return { isValid: Object.keys(errors).length === 0, errors, value: { email, password } };
}

module.exports = { validateRegister, validateProfile, validateLogin, normalizeSiret };
