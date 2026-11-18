'use strict';

// Messagerie d'une candidature (lot N). Côté moniteur, le jeton de suivi fait
// office d'accès ; côté école, la candidature est toujours scopée à l'école
// connectée (une candidature d'une autre école répond 404).
const applicationService = require('../services/applicationService');
const messageService = require('../services/messageService');
const realtimeService = require('../services/realtimeService');
const mailer = require('../services/mailer');
const { parseId, notFound } = require('../utils/http');

const CLOSED_MESSAGE = 'Cette candidature a été refusée : la messagerie est en lecture seule.';

function schoolThreadPath(application) {
  return `/mes-annonces/${application.listingId}/candidatures/${application.id}/messages`;
}

// Enregistre le message, prévient l'autre partie en direct et par email
// (best-effort : un email non parti n'annule pas le message déjà en base).
async function deliver(application, author, body) {
  await messageService.create(application.id, author, body);
  realtimeService.publishApplicationUpdate(application, realtimeService.EVENT_TYPES.MESSAGE_CREATED);
  const title = application.listing.title;
  try {
    if (author === 'applicant') {
      const school = application.listing.school;
      await mailer.sendNewMessage(school.email, school.businessName, title, `${mailer.APP_URL}${schoolThreadPath(application)}`);
    } else if (application.trackingToken) {
      await mailer.sendNewMessage(application.applicantEmail, application.applicantName, title,
        `${mailer.APP_URL}/suivi/${application.trackingToken}`);
    }
  } catch (err) {
    console.error('Notification de message non envoyée :', err.code || err.message);
  }
}

// --- Côté moniteur (lien de suivi) ---

async function postFromApplicant(req, res, next) {
  try {
    const token = req.params.token;
    const application = await applicationService.findByTrackingToken(token);
    if (!application) return notFound(res);
    const back = `/suivi/${token}`;
    if (!messageService.isThreadOpen(application)) {
      req.flash('error', CLOSED_MESSAGE);
      return res.redirect(back);
    }
    const checked = messageService.validateBody(req.body.body);
    if (checked.error) {
      return res.status(400).render('tracking/show', {
        title: 'Suivi de candidature', application, messageError: checked.error, messageDraft: req.body.body,
      });
    }
    await deliver(application, 'applicant', checked.value);
    req.flash('success', 'Message envoyé.');
    res.redirect(`${back}#messages`);
  } catch (err) {
    next(err);
  }
}

// --- Côté école ---

async function loadOwned(req) {
  const listingId = parseId(req.params.id);
  const applicationId = parseId(req.params.appId);
  if (!listingId || !applicationId) return null;
  const application = await applicationService.findOwnedById(req.school.id, applicationId);
  if (!application || application.listingId !== listingId) return null;
  return application;
}

async function renderSchoolThread(req, res, application, extra = {}) {
  await messageService.markReadBy(application.id, 'school');
  const messages = await messageService.listForApplication(application.id);
  res.render('dashboard/messages', {
    title: `Messages — ${application.applicantName}`,
    application, listing: application.listing, messages, threadPath: schoolThreadPath(application), ...extra,
  });
}

async function showForSchool(req, res, next) {
  try {
    const application = await loadOwned(req);
    if (!application) return notFound(res);
    await renderSchoolThread(req, res, application);
  } catch (err) {
    next(err);
  }
}

async function postFromSchool(req, res, next) {
  try {
    const application = await loadOwned(req);
    if (!application) return notFound(res);
    const back = schoolThreadPath(application);
    if (!messageService.isThreadOpen(application)) {
      req.flash('error', CLOSED_MESSAGE);
      return res.redirect(back);
    }
    const checked = messageService.validateBody(req.body.body);
    if (checked.error) {
      res.status(400);
      return renderSchoolThread(req, res, application, { messageError: checked.error, messageDraft: req.body.body });
    }
    await deliver(application, 'school', checked.value);
    req.flash('success', 'Message envoyé.');
    res.redirect(`${back}#messages`);
  } catch (err) {
    next(err);
  }
}

// Liste seule (sans formulaire) pour le rafraîchissement temps réel du fil école.
async function schoolFragment(req, res, next) {
  try {
    const application = await loadOwned(req);
    if (!application) return notFound(res);
    await messageService.markReadBy(application.id, 'school');
    const messages = await messageService.listForApplication(application.id);
    res.render('partials/messages-list', { messages, viewer: 'school', application, listing: application.listing });
  } catch (err) {
    next(err);
  }
}

module.exports = { postFromApplicant, showForSchool, postFromSchool, schoolFragment, schoolThreadPath };
