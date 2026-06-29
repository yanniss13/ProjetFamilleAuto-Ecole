// Validation serveur — connexion admin.
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateAdminLogin(body) {
  const errors = {};
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email) errors.email = "L'email est obligatoire.";
  else if (!isValidEmail(email)) errors.email = "L'email n'est pas valide.";
  if (!password) errors.password = 'Le mot de passe est obligatoire.';
  return { isValid: Object.keys(errors).length === 0, errors, value: { email, password } };
}

module.exports = { validateAdminLogin };
