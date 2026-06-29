// Confirmation de soumission sans handler inline (compatible CSP). Tout <form data-confirm="...">
// demande confirmation avant envoi.
document.addEventListener(
  'submit',
  function (e) {
    var form = e.target;
    if (form && form.matches && form.matches('form[data-confirm]')) {
      if (!window.confirm(form.getAttribute('data-confirm'))) {
        e.preventDefault();
      }
    }
  },
  true
);
