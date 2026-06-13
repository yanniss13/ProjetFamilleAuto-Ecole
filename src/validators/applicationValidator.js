// Validation serveur — candidature (Application). Le CV (req.file) est vérifié
// séparément dans le contrôleur (présence + type PDF via multer).
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
  if (!applicantEmail) errors.applicantEmail = "L'email est obligatoire.";
  else if (!isValidEmail(applicantEmail)) errors.applicantEmail = "L'email n'est pas valide.";
  if (!message) errors.message = 'Un message est obligatoire.';

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: { applicantName, applicantEmail, applicantPhone: applicantPhone || null, message },
  };
}

module.exports = { validateApplication };
