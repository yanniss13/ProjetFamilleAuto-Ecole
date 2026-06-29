// Pagination partagée : taille de page, calcul des bornes, et construction d'URL
// conservant les paramètres de requête courants.
const PAGE_SIZE = 20;

function parsePage(raw) {
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function paginate(page, total) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  return { page: current, pageCount, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

function pageUrl(basePath, query, page) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') params.append(k, v);
  }
  params.set('page', String(page));
  return `${basePath}?${params.toString()}`;
}

module.exports = { PAGE_SIZE, parsePage, paginate, pageUrl };
