// Carte de localisation de l'auto-école (page détail d'une annonce).
// Initialise Leaflet à partir des coordonnées portées par #map (data-lat / data-lng).
(function () {
  var el = document.getElementById('map');
  if (!el || typeof L === 'undefined') return;

  var lat = parseFloat(el.getAttribute('data-lat'));
  var lng = parseFloat(el.getAttribute('data-lng'));
  if (!isFinite(lat) || !isFinite(lng)) return;

  // Icône définie explicitement : sinon Leaflet ne résout pas le chemin des images
  // (marqueur cassé) quand les assets sont servis depuis /vendor/leaflet/.
  var icon = L.icon({
    iconUrl: '/vendor/leaflet/images/marker-icon.png',
    iconRetinaUrl: '/vendor/leaflet/images/marker-icon-2x.png',
    shadowUrl: '/vendor/leaflet/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  var map = L.map('map').setView([lat, lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  var marker = L.marker([lat, lng], { icon: icon }).addTo(map);
  var label = el.getAttribute('data-label');
  if (label) marker.bindPopup(label);
})();
