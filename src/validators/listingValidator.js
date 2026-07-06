// Validation serveur — annonce (Listing).
const CONTRACT_TYPES = ['cdi', 'cdd', 'freelance', 'apprentissage'];

// Longueurs maximales des champs texte libres (protège la base et l'affichage).
const MAX = { title: 150, description: 5000, city: 100, compensation: 100 };

// Code département français : 2 ou 3 chiffres (DOM), ou Corse 2A/2B.
const DEPARTMENT_RX = /^(\d{2,3}|2A|2B)$/;

function tooLong(max) {
  return `Ce champ ne doit pas dépasser ${max} caractères.`;
}

function validateListing(body) {
  const errors = {};
  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  const city = (body.city || '').trim();
  const department = (body.department || '').trim().toUpperCase();
  const contractType = (body.contractType || '').trim();
  const compensation = (body.compensation || '').trim();
  const hoursRaw = (body.hoursPerWeek != null ? String(body.hoursPerWeek) : '').trim();

  if (!title) errors.title = 'Le titre est obligatoire.';
  else if (title.length > MAX.title) errors.title = tooLong(MAX.title);
  if (!description) errors.description = 'La description est obligatoire.';
  else if (description.length > MAX.description) errors.description = tooLong(MAX.description);
  if (!city) errors.city = 'La ville est obligatoire.';
  else if (city.length > MAX.city) errors.city = tooLong(MAX.city);
  if (!department) errors.department = 'Le département est obligatoire.';
  else if (!DEPARTMENT_RX.test(department)) errors.department = 'Département invalide (ex. 13, 75, 2A, 971).';
  if (compensation.length > MAX.compensation) errors.compensation = tooLong(MAX.compensation);

  let contract = null;
  if (contractType) {
    if (!CONTRACT_TYPES.includes(contractType)) errors.contractType = 'Type de contrat invalide.';
    else contract = contractType;
  }

  let hoursPerWeek = null;
  if (hoursRaw !== '') {
    const n = Number(hoursRaw);
    if (!Number.isInteger(n) || n <= 0 || n > 60) errors.hoursPerWeek = 'Volume horaire invalide (1 à 60).';
    else hoursPerWeek = n;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      title,
      description,
      city,
      department,
      contractType: contract,
      compensation: compensation || null,
      hoursPerWeek,
    },
  };
}

module.exports = { validateListing, CONTRACT_TYPES };
