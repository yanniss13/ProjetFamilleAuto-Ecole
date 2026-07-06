// Validation serveur — candidature (Application). Le CV (req.file) est vérifié
// séparément dans le contrôleur (présence + type PDF via multer).

// Longueurs maximales des champs texte libres (254 = maximum RFC pour un email).
const MAX = { applicantName: 100, applicantEmail: 254, applicantPhone: 30, message: 3000 };

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateApplication(body) {
  const errors = {};
  const applicantName = (body.applicantName || '').trim();
  const applicantEmail = (body.applicantEmail || '').trim().toLowerCase();
  const applicantPhone = (body.applicantPhone || '').trim();
  const message = (body.message || '').trim();

  if (!applicantName) errors.applicantName = 'Votre nom est obligatoire.';
  else if (applicantName.length > MAX.applicantName) errors.applicantName = `Le nom ne doit pas dépasser ${MAX.applicantName} caractères.`;
  if (!applicantEmail) errors.applicantEmail = "L'email est obligatoire.";
  else if (applicantEmail.length > MAX.applicantEmail || !isValidEmail(applicantEmail)) errors.applicantEmail = "L'email n'est pas valide.";
  if (applicantPhone.length > MAX.applicantPhone) errors.applicantPhone = `Le téléphone ne doit pas dépasser ${MAX.applicantPhone} caractères.`;
  if (!message) errors.message = 'Un message est obligatoire.';
  else if (message.length > MAX.message) errors.message = `Le message ne doit pas dépasser ${MAX.message} caractères.`;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: { applicantName, applicantEmail, applicantPhone: applicantPhone || null, message },
  };
}

module.exports = { validateApplication };
