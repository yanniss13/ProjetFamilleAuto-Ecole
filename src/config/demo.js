// Mode démonstration : instance publique remise à zéro par le seed à chaque
// démarrage (voir scripts/demo-start.js). Les comptes ci-dessous sont ceux que
// le seed crée ; ils ne sont affichés qu'avec DEMO_MODE=true.
const DEMO_DOMAIN = 'demo.moniteur-connect.example';

const DEMO_ACCOUNTS = Object.freeze({
  school: Object.freeze({ email: `ecole.vitrine@${DEMO_DOMAIN}`, password: 'demo1234' }),
  admin: Object.freeze({ email: `admin@${DEMO_DOMAIN}`, password: 'admin1234' }),
});

// Lu à chaque requête (et non au chargement) : la valeur exacte "true" seule
// active le mode, pour qu'une faute de frappe ne publie jamais d'identifiants.
function isDemoMode() {
  return process.env.DEMO_MODE === 'true';
}

module.exports = { DEMO_DOMAIN, DEMO_ACCOUNTS, isDemoMode };
