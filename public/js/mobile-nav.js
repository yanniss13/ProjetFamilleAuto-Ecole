'use strict';

// Une seule fonction synchronise l'etat visuel et l'etat annonce aux lecteurs
// d'ecran, afin d'eviter qu'un menu paraisse ferme tout en restant declare ouvert.
function setMenuState(navbar, toggle, open) {
  navbar.classList.toggle('navbar-mobile-open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
}

function initMobileNav(doc, win) {
  var navbar = doc.querySelector('.navbar');
  var toggle = doc.getElementById('navigation-toggle');
  var nav = doc.getElementById('navigation-principale');
  if (!navbar || !toggle || !nav) return;

  // Sans JavaScript, le bouton reste masque et les liens restent visibles.
  // On ne replie la navigation qu'apres avoir confirme que le script fonctionne.
  toggle.hidden = false;
  navbar.classList.add('nav-enhanced');
  setMenuState(navbar, toggle, false);

  toggle.addEventListener('click', function () {
    setMenuState(navbar, toggle, toggle.getAttribute('aria-expanded') !== 'true');
  });

  doc.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenuState(navbar, toggle, false);
      toggle.focus();
    }
  });

  doc.addEventListener('click', function (event) {
    if (!navbar.contains(event.target)) setMenuState(navbar, toggle, false);
  });

  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) setMenuState(navbar, toggle, false);
  });

  var desktop = win.matchMedia('(min-width: 601px)');
  var fermeSurDesktop = function (event) {
    if (event.matches) setMenuState(navbar, toggle, false);
  };
  if (desktop.addEventListener) desktop.addEventListener('change', fermeSurDesktop);
  else desktop.addListener(fermeSurDesktop);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setMenuState: setMenuState, initMobileNav: initMobileNav };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  initMobileNav(document, window);
}
