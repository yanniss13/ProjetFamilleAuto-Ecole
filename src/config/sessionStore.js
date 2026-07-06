// Store de sessions express-session adossé à Prisma (table Session).
// Remplace le MemoryStore par défaut, inadapté à la production (fuite mémoire,
// sessions perdues au redémarrage, incompatible multi-process). Fonctionne à
// l'identique en SQLite (dev) et PostgreSQL (prod), sans dépendance supplémentaire.
const { Store } = require('express-session');

// Purge périodique des sessions expirées (best-effort ; l'expiration est de toute
// façon contrôlée à la lecture, la purge évite seulement que la table grossisse).
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// Filet de sécurité si la session n'a pas de cookie.maxAge/expires exploitable
// (aligné sur le maxAge configuré dans app.js).
const FALLBACK_TTL_MS = 4 * 60 * 60 * 1000;

class PrismaSessionStore extends Store {
  constructor(prisma) {
    super();
    this.prisma = prisma;
    const timer = setInterval(() => {
      this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
    }, CLEANUP_INTERVAL_MS);
    timer.unref(); // ne retient pas le process (tests, arrêt propre)
  }

  _expiresAt(session) {
    const cookie = session && session.cookie;
    if (cookie && cookie.expires) return new Date(cookie.expires);
    if (cookie && typeof cookie.maxAge === 'number') return new Date(Date.now() + cookie.maxAge);
    return new Date(Date.now() + FALLBACK_TTL_MS);
  }

  get(sid, cb) {
    this.prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        if (!row) return cb(null, null);
        if (row.expiresAt <= new Date()) {
          // Expirée : supprimée au passage, non restituée.
          return this.prisma.session.deleteMany({ where: { sid } }).then(() => cb(null, null), () => cb(null, null));
        }
        cb(null, JSON.parse(row.data));
      })
      .catch(cb);
  }

  set(sid, session, cb) {
    const data = JSON.stringify(session);
    const expiresAt = this._expiresAt(session);
    this.prisma.session
      .upsert({ where: { sid }, update: { data, expiresAt }, create: { sid, data, expiresAt } })
      .then(() => cb && cb(null))
      .catch(cb);
  }

  destroy(sid, cb) {
    this.prisma.session
      .deleteMany({ where: { sid } })
      .then(() => cb && cb(null))
      .catch(cb);
  }

  // Prolonge l'expiration sans réécrire les données (appelé par express-session
  // quand resave:false).
  touch(sid, session, cb) {
    this.prisma.session
      .updateMany({ where: { sid }, data: { expiresAt: this._expiresAt(session) } })
      .then(() => cb && cb(null))
      .catch(cb);
  }
}

module.exports = PrismaSessionStore;
