// Verification d'un SIRET au repertoire Sirene via l'API publique "Recherche
// d'entreprises" (https://recherche-entreprises.api.gouv.fr - gratuite, sans cle).
// Ne leve JAMAIS : tout probleme reseau/API renvoie { status: 'error' } ; l'appelant
// traite cet etat comme "non verifie" (la verification n'est jamais bloquante).
// Desactivable via SIRET_LOOKUP_DISABLED=1 (tests, hors-ligne).
const API_URL = 'https://recherche-entreprises.api.gouv.fr/search';
const USER_AGENT = 'MoniteurConnect/1.0 (+https://moniteur-connect.local)';

// Cache memoire (meme motif que le geocodeur) : un SIRET donne n'est interroge
// qu'une fois par heure. Les erreurs expirent vite : une panne passagere ne doit
// pas coller au SIRET pendant une heure.
const CACHE_MAX = 500;
const CACHE_TTL_OK_MS = 60 * 60 * 1000; // 1 h
const CACHE_TTL_ERR_MS = 60 * 1000; // 1 min
const cache = new Map();

const ERROR_RESULT = { status: 'error', name: null, address: null };

async function fetchLookup(siret) {
  if (process.env.SIRET_LOOKUP_DISABLED === '1') return { ...ERROR_RESULT };
  try {
    const url = `${API_URL}?q=${encodeURIComponent(siret)}&page=1&per_page=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ...ERROR_RESULT };

    const data = await res.json();
    const result = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!result) return { status: 'not_found', name: null, address: null };

    const etab = Array.isArray(result.matching_etablissements) ? result.matching_etablissements[0] : null;
    const name = result.nom_complet || result.nom_raison_sociale || null;
    const address = (etab && etab.adresse) || null;
    const closed = Boolean(etab && etab.etat_administratif === 'F'); // 'A' = actif, 'F' = ferme
    return { status: closed ? 'closed' : 'verified', name, address };
  } catch {
    return { ...ERROR_RESULT };
  }
}

async function lookupSiret(siret) {
  const key = String(siret || '').replace(/\D/g, '');
  if (key.length !== 14) return { status: 'not_found', name: null, address: null };

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await fetchLookup(key);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + (value.status === 'error' ? CACHE_TTL_ERR_MS : CACHE_TTL_OK_MS) });
  return value;
}

module.exports = { lookupSiret };
