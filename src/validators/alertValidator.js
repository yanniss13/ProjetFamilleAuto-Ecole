// Validation serveur — alerte email moniteur.
const MAX = { email: 254, keyword: 100 };
// Même règle département que les annonces : 2-3 chiffres ou Corse 2A/2B.
const DEPARTMENT_RX = /^(\d{2,3}|2A|2B)$/;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateAlert(body) {
  const errors = {};
  const email = (body.email || '').trim().toLowerCase();
  const department = (body.department || '').trim().toUpperCase();
  const keyword = (body.keyword || '').trim();

  if (!email) errors.email = 'L’email est obligatoire.';
  else if (email.length > MAX.email || !isValidEmail(email)) errors.email = 'L’email n’est pas valide.';
  if (!department) errors.department = 'Le département est obligatoire.';
  else if (!DEPARTMENT_RX.test(department)) errors.department = 'Département invalide (ex. 13, 75, 2A, 971).';
  if (keyword.length > MAX.keyword) errors.keyword = `Le mot-clé ne doit pas dépasser ${MAX.keyword} caractères.`;

  return { isValid: Object.keys(errors).length === 0, errors, value: { email, department, keyword } };
}

module.exports = { validateAlert };
