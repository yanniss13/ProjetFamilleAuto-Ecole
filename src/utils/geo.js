// Petites fonctions geographiques partagees (recherche par rayon du Lot E).
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Distance en kilometres entre deux points (formule de haversine).
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Boite englobante autour d'un point : pre-filtre SQL grossier (la boite contient
// toujours le cercle du rayon ; l'affinage exact se fait ensuite par haversine).
function bboxAround(lat, lng, radiusKm) {
  const dLat = radiusKm / 111.32; // 1 degre de latitude ~= 111,32 km
  const cosLat = Math.max(0.01, Math.cos(toRad(lat))); // evite une division par ~0 aux poles
  const dLng = radiusKm / (111.32 * cosLat);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

module.exports = { haversineKm, bboxAround };
