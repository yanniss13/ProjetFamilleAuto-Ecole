// Configuration de l'application Express : sécurité, moteur de vues, session, routes.
// Le démarrage du serveur est dans server.js.
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const flash = require('./middlewares/flash');
const csrf = require('./middlewares/csrf');
const routes = require('./routes');
const prisma = require('./config/prisma');
const PrismaSessionStore = require('./config/sessionStore');

const app = express();

// En production, derrière un reverse-proxy HTTPS : lit X-Forwarded-* (cookie secure
// correct + rate-limiter basé sur la vraie IP client).
const isProd = process.env.NODE_ENV === 'production';
if (isProd) app.set('trust proxy', 1);

// En-têtes HTTP de sécurité, dont une Content-Security-Policy stricte (defaults helmet :
// default-src/script-src 'self', pas de JS inline). Le `style-src` par défaut de helmet
// conserve 'unsafe-inline' (non durci ici) ; seul le JS inline est bloqué. On autorise
// en plus les tuiles OpenStreetMap chargées par Leaflet sur la page détail d'une annonce.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
      },
    },
  })
);

// Moteur de vues Twig. autoescape activé : toute {{ variable }} est échappée
// (anti-XSS stocké). Usages de |raw limités aux blocs de DONNÉES JSON — #map-data
// (listings/index.twig) et #stats-data (tableaux de bord école/admin) : toujours du
// JSON.stringify avec « < » échappé côté serveur, jamais du HTML.
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'twig');
app.set('twig options', { autoescape: true });

// Corps des formulaires (urlencoded). Les formulaires multipart (upload CV) sont
// gérés au cas par cas par multer (voir middlewares/upload.js).
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Session (SESSION_SECRET garanti présent par le fail-fast de server.js).
// Store persistant en base (table Session) : survit aux redémarrages et
// fonctionne en multi-process, contrairement au MemoryStore par défaut.
app.use(
  session({
    store: new PrismaSessionStore(prisma),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 4, // 4 h
    },
  })
);

app.use(flash); // messages flash disponibles dans les vues
app.use(csrf); // jeton CSRF (exposé aux vues + vérifié sur POST/PUT/PATCH/DELETE)

// Routeurs applicatifs (public + auth + espace auto-école).
app.use(routes);

// 404 puis gestionnaire d'erreurs (toujours en dernier).
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Page introuvable' });
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('errors/500', { title: 'Erreur' });
});

module.exports = app;
