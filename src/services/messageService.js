'use strict';

// Messagerie d'une candidature (lot N) : accès aux données du fil école ↔ moniteur.
const prisma = require('../config/prisma');

const MAX_BODY = 2000;
const AUTHORS = new Set(['school', 'applicant']);
const OPEN_STATUSES = new Set(['pending', 'accepted']);

// Le fil reste ouvert tant que la candidature n'est pas refusée.
function isThreadOpen(application) {
  return Boolean(application) && OPEN_STATUSES.has(application.status);
}

function validateBody(raw) {
  // Les navigateurs envoient les retours à la ligne en \r\n alors que la zone de
  // saisie (maxlength) les compte pour 1 : on normalise avant de mesurer.
  const value = typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim() : '';
  if (!value) return { error: 'Le message est vide.' };
  if (value.length > MAX_BODY) return { error: `Le message dépasse ${MAX_BODY} caractères.` };
  return { value };
}

function assertAuthor(author) {
  if (!AUTHORS.has(author)) throw new TypeError('Auteur de message inconnu.');
}

function create(applicationId, author, body) {
  assertAuthor(author);
  return prisma.message.create({ data: { applicationId, author, body } });
}

function listForApplication(applicationId) {
  return prisma.message.findMany({
    where: { applicationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

// Le lecteur marque comme lus les messages de l'autre partie ; renvoie le nombre marqué.
async function markReadBy(applicationId, reader) {
  assertAuthor(reader);
  const other = reader === 'school' ? 'applicant' : 'school';
  const { count } = await prisma.message.updateMany({
    where: { applicationId, author: other, readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}

module.exports = { MAX_BODY, isThreadOpen, validateBody, create, listForApplication, markReadBy };
