// Géocodage d'adresse via Nominatim (OpenStreetMap) — gratuit, sans clé.
// Appelé UNIQUEMENT à l'enregistrement d'une adresse (inscription / profil), jamais à
// l'affichage, pour respecter la politique d'usage OSM (≈ 1 requête par enregistrement).
// Tout échec renvoie null : le géocodage ne doit jamais bloquer l'action de l'utilisateur.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'MoniteurConnect/1.0 (+https://moniteur-connect.local)';

// Renvoie { lat, lng } ou null. Désactivable en test via GEOCODING_DISABLED=1.
async function geocode(address) {
  const q = (address || '').trim();
  if (!q) return null;
  if (process.env.GEOCODING_DISABLED === '1') return null;

  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=fr&q=${encodeURIComponent(q)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

// Variante prête pour la persistance : renvoie toujours { latitude, longitude }
// (null/null si l'adresse est vide ou non localisable). Évite de dupliquer le mapping
// { lat, lng } -> { latitude, longitude } chez les appelants.
async function coordsFor(address) {
  const c = await geocode(address);
  return { latitude: c ? c.lat : null, longitude: c ? c.lng : null };
}

// Cache memoire du geocodage des RECHERCHES utilisateur ("autour de : ville").
// Politique d'usage Nominatim : une meme ville n'est geocodee qu'une fois par TTL.
// Les echecs sont aussi mis en cache, plus brievement (une faute de frappe repetee
// ne doit pas marteler l'API). Taille bornee, eviction de l'entree la plus ancienne.
const CACHE_MAX = 200;
const CACHE_TTL_OK_MS = 24 * 60 * 60 * 1000; // 24 h
const CACHE_TTL_FAIL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map();

async function geocodeCached(ville) {
  const key = (ville || '').trim().toLowerCase();
  if (!key) return null;

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.coords;

  const coords = await geocode(key);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { coords, expiresAt: Date.now() + (coords ? CACHE_TTL_OK_MS : CACHE_TTL_FAIL_MS) });
  return coords;
}

module.exports = { geocode, coordsFor, geocodeCached };
