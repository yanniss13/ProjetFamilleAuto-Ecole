// Statistiques des tableaux de bord (Lot H) : agrégats et séries hebdomadaires.
// Le bucketing par semaine se fait en JS (portable SQLite/PostgreSQL — pas de
// fonctions de date SQL), et toutes les requêtes de séries sont bornées à 84 jours.
const prisma = require('../config/prisma');

const WEEKS = 12; // fenêtre des séries hebdomadaires
const SERIES_DAYS = WEEKS * 7; // 84 jours — borne toutes les requêtes de séries

// Lundi 00:00 (heure locale) de la semaine contenant `d`.
function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // getDay() : 0 = dimanche
  return x;
}

// Regroupe des dates par semaine (lundi comme début). Renvoie exactement `weeks`
// entrées ordonnées de la plus ancienne à la semaine courante, semaines vides à 0,
// label = lundi de la semaine au format JJ/MM. Dates hors fenêtre : ignorées.
function weeklyBuckets(dates, weeks) {
  const currentMonday = mondayOf(new Date());
  const buckets = [];
  const indexByMonday = new Map();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const monday = new Date(currentMonday);
    monday.setDate(monday.getDate() - i * 7);
    const label = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`;
    indexByMonday.set(monday.getTime(), buckets.length);
    buckets.push({ label, count: 0 });
  }
  for (const date of dates) {
    const idx = indexByMonday.get(mondayOf(date).getTime());
    if (idx !== undefined) buckets[idx].count += 1;
  }
  return buckets;
}

// Pourcentage entier arrondi, 0 si le total est nul (jamais NaN — compte tout neuf).
function rate(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

module.exports = { weeklyBuckets, rate };
