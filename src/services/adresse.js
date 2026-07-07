// Relais de l'API Adresse (adresse.data.gouv.fr) pour respecter la CSP stricte :
// le navigateur n'appelle que notre origine. Le service ne leve jamais, car
// l'autocompletion ne doit pas bloquer la saisie manuelle.
const API_URL = 'https://api-adresse.data.gouv.fr/search/';
const USER_AGENT = 'MoniteurConnect/1.0 (+https://moniteur-connect.local)';

const CACHE_MAX = 500;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const cache = new Map();

function normalizeQuery(q) {
  return String(q || '').trim().toLowerCase();
}

function timeoutSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(3000);
  }
  return undefined;
}

function mapFeature(feature) {
  const properties = feature && feature.properties ? feature.properties : {};
  const label = properties.label ? String(properties.label) : '';
  if (!label) return null;
  return {
    label,
    city: properties.city ? String(properties.city) : '',
    postcode: properties.postcode ? String(properties.postcode) : '',
  };
}

async function fetchAddress(q) {
  try {
    const url = `${API_URL}?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: timeoutSignal() });
    if (!res.ok) return [];

    const data = await res.json();
    const features = data && Array.isArray(data.features) ? data.features : [];
    return features.map(mapFeature).filter(Boolean).slice(0, 5);
  } catch {
    return [];
  }
}

async function searchAddress(q) {
  const key = normalizeQuery(q);
  if (key.length < 3 || process.env.ADRESSE_LOOKUP_DISABLED === '1') return [];

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await fetchAddress(key);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

module.exports = { searchAddress };
