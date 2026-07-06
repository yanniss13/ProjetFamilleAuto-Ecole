// Carte des annonces (/annonces?vue=carte) : lit le bloc JSON #map-data et affiche un
// marqueur par auto-école (popup = ses annonces ouvertes), plus le cercle du rayon si
// une ville est recherchée. Aucune donnée n'est insérée en HTML : DOM + textContent.
(function () {
  var el = document.getElementById('listings-map');
  var dataEl = document.getElementById('map-data');
  if (!el || !dataEl || typeof L === 'undefined') return;

  var data;
  try {
    data = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }

  // Icône explicite : sinon Leaflet ne résout pas le chemin des images (marqueur
  // cassé) quand les assets sont servis depuis /vendor/leaflet/.
  var icon = L.icon({
    iconUrl: '/vendor/leaflet/images/marker-icon.png',
    iconRetinaUrl: '/vendor/leaflet/images/marker-icon-2x.png',
    shadowUrl: '/vendor/leaflet/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  var map = L.map(el);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  var bounds = [];
  (data.schools || []).forEach(function (s) {
    var marker = L.marker([s.latitude, s.longitude], { icon: icon }).addTo(map);
    bounds.push([s.latitude, s.longitude]);

    var div = document.createElement('div');
    var name = document.createElement('strong');
    name.textContent = s.schoolName;
    div.appendChild(name);
    var ul = document.createElement('ul');
    ul.className = 'map-popup-listings';
    (s.listings || []).forEach(function (l) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '/annonces/' + encodeURIComponent(l.id);
      a.textContent = l.title + ' — ' + l.city;
      li.appendChild(a);
      ul.appendChild(li);
    });
    div.appendChild(ul);
    marker.bindPopup(div);
  });

  if (data.center) {
    var circle = L.circle([data.center.lat, data.center.lng], {
      radius: data.center.radiusKm * 1000,
      color: '#1d4ed8',
      fillColor: '#1d4ed8',
      fillOpacity: 0.08,
      weight: 1.5,
    }).addTo(map);
    map.fitBounds(circle.getBounds(), { padding: [20, 20] });
  } else if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40] });
  } else {
    map.setView([46.6, 2.4], 6); // vue France par défaut
  }
})();
