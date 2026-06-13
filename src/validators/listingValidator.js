// Validation serveur — annonce (Listing).
const CONTRACT_TYPES = ['cdi', 'cdd', 'freelance', 'apprentissage'];

function validateListing(body) {
  const errors = {};
  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  const city = (body.city || '').trim();
  const department = (body.department || '').trim();
  const contractType = (body.contractType || '').trim();
  const compensation = (body.compensation || '').trim();
  const hoursRaw = (body.hoursPerWeek != null ? String(body.hoursPerWeek) : '').trim();

  if (!title) errors.title = 'Le titre est obligatoire.';
  if (!description) errors.description = 'La description est obligatoire.';
  if (!city) errors.city = 'La ville est obligatoire.';
  if (!department) errors.department = 'Le département est obligatoire.';

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
