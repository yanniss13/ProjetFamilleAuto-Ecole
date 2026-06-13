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

module.exports = { geocode, coordsFor };
