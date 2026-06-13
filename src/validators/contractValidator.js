// Validation serveur — termes du contrat (saisis à l'acceptation d'une candidature).
const CONTRACT_TYPES = ['freelance', 'cdi', 'cdd', 'apprentissage', 'generic'];

// Parse une date d'input HTML (type=date -> "YYYY-MM-DD"). Renvoie un Date ou null.
function parseDate(raw) {
  const s = (raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Date optionnelle : vide -> null ; fournie mais invalide -> erreur + null.
function optionalDate(raw, label, errors, key) {
  const s = (raw || '').trim();
  if (!s) return null;
  const d = parseDate(s);
  if (!d) {
    errors[key] = `${label} est invalide.`;
    return null;
  }
  return d;
}

function parseOptionalInt(raw, { min, max }) {
  const s = (raw != null ? String(raw) : '').trim();
  if (s === '') return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false };
  return { ok: true, value: n };
}

function validateContract(body) {
  const errors = {};

  const type = CONTRACT_TYPES.includes((body.type || '').trim()) ? body.type.trim() : '';
  if (!type) errors.type = 'Type de contrat invalide.';

  const startDate = parseDate(body.startDate);
  if (!startDate) errors.startDate = 'La date de début est obligatoire et doit être valide.';

  let endDate = null;
  let motif = (body.motif || '').trim() || null;
  if (type === 'cdd') {
    endDate = parseDate(body.endDate);
    if (!endDate) errors.endDate = 'La date de fin est obligatoire pour un CDD.';
    else if (startDate && endDate <= startDate) errors.endDate = 'La date de fin doit être postérieure à la date de début.';
    if (!motif) errors.motif = 'Le motif de recours est obligatoire pour un CDD.';
  } else {
    endDate = null;
    motif = null;
  }

  const grossSalary = (body.grossSalary || '').trim();
  if (!grossSalary) errors.grossSalary = 'La rémunération est obligatoire.';

  const workplace = (body.workplace || '').trim();
  if (!workplace) errors.workplace = 'Le lieu de travail est obligatoire.';

  const schoolAddress = (body.schoolAddress || '').trim();
  if (!schoolAddress) errors.schoolAddress = "L'adresse de l'auto-école est obligatoire.";

  const applicantAddress = (body.applicantAddress || '').trim();
  if (!applicantAddress) errors.applicantAddress = "L'adresse du candidat est obligatoire.";

  const hours = parseOptionalInt(body.weeklyHours, { min: 1, max: 60 });
  if (!hours.ok) errors.weeklyHours = 'Volume horaire invalide (1 à 60).';

  const trial = parseOptionalInt(body.trialPeriodWeeks, { min: 0, max: 104 });
  if (!trial.ok) errors.trialPeriodWeeks = "Période d'essai invalide (0 à 104 semaines).";

  let providerSiret = (body.providerSiret || '').replace(/\D/g, '') || null;
  if (type === 'freelance') {
    if (!providerSiret) errors.providerSiret = 'Le SIRET du prestataire est obligatoire pour un contrat freelance.';
    else if (providerSiret.length !== 14) errors.providerSiret = 'Le SIRET doit contenir 14 chiffres.';
  }

  const extraClauses = (body.extraClauses || '').trim() || null;

  // --- Identité du candidat (tous optionnels) ---
  const birthDate = optionalDate(body.birthDate, 'La date de naissance', errors, 'birthDate');
  const birthPlace = (body.birthPlace || '').trim() || null;
  const nationality = (body.nationality || '').trim() || null;
  const teachingAuthNumber = (body.teachingAuthNumber || '').trim() || null;
  const teachingAuthValidUntil = optionalDate(body.teachingAuthValidUntil, "La date de validité de l'autorisation", errors, 'teachingAuthValidUntil');
  const licenseNumber = (body.licenseNumber || '').trim() || null;
  const licenseCategories = (body.licenseCategories || '').trim() || null;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      type,
      startDate,
      endDate,
      motif,
      grossSalary,
      weeklyHours: hours.value,
      trialPeriodWeeks: trial.value,
      workplace,
      providerSiret,
      schoolAddress,
      applicantAddress,
      extraClauses,
      birthDate,
      birthPlace,
      nationality,
      teachingAuthNumber,
      teachingAuthValidUntil,
      licenseNumber,
      licenseCategories,
    },
  };
}

module.exports = { validateContract, CONTRACT_TYPES };
