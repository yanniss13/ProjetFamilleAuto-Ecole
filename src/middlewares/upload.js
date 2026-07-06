// Upload des pièces de candidature via multer :
//   - cv           : CV, PDF uniquement ;
//   - idCard       : pièce d'identité, PDF/JPG/PNG ;
//   - license      : permis de conduire, PDF/JPG/PNG ;
//   - teachingCard : carte/autorisation d'enseigner, PDF/JPG/PNG.
// Taille max 5 Mo/fichier, nom RÉGÉNÉRÉ (jamais celui du client), extension dérivée du
// mimetype, stockage dans le dossier PRIVÉ storage/ (jamais sous public/).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const { STORAGE_DIR, SUBDIRS } = require('../config/storage');

const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo par fichier

const PDF_ONLY = { 'application/pdf': '.pdf' };
const IMG_OR_PDF = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

// Champ de formulaire -> { sous-dossier de stockage, types mimetype acceptés }.
const FIELDS = {
  cv: { sub: SUBDIRS.cv, types: PDF_ONLY },
  idCard: { sub: SUBDIRS.id, types: IMG_OR_PDF },
  license: { sub: SUBDIRS.license, types: IMG_OR_PDF },
  teachingCard: { sub: SUBDIRS.teaching, types: IMG_OR_PDF },
};

function allowedExt(fieldname, mimetype) {
  const f = FIELDS[fieldname];
  return f ? f.types[mimetype] || null : null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const f = FIELDS[file.fieldname];
    cb(null, path.join(STORAGE_DIR, f ? f.sub : SUBDIRS.cv));
  },
  filename: (req, file, cb) => {
    const ext = allowedExt(file.fieldname, file.mimetype) || '.bin';
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

// Refuse silencieusement les types non autorisés : le contrôleur vérifiera la présence
// des fichiers et renverra des erreurs de validation claires.
function fileFilter(req, file, cb) {
  cb(null, allowedExt(file.fieldname, file.mimetype) !== null);
}

// Chemin relatif (stocké en base) à partir d'un fichier multer.
function relPathOf(file) {
  const f = FIELDS[file.fieldname];
  return `${f ? f.sub : SUBDIRS.cv}/${file.filename}`;
}

const uploadApplicationFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
}).fields([
  { name: 'cv', maxCount: 1 },
  { name: 'idCard', maxCount: 1 },
  { name: 'license', maxCount: 1 },
  { name: 'teachingCard', maxCount: 1 },
]);

// Signatures binaires (magic bytes) attendues par extension. Le mimetype annoncé par
// le client est déclaratif et falsifiable : on vérifie le CONTENU réel du fichier.
const SIGNATURES = {
  '.pdf': [Buffer.from('%PDF')],
  '.jpg': [Buffer.from([0xff, 0xd8, 0xff])],
  '.png': [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
};

// Les premiers octets du fichier écrit correspondent-ils à son extension ?
async function matchesSignature(file) {
  const sigs = SIGNATURES[path.extname(file.filename)];
  if (!sigs) return false;
  const fh = await fs.promises.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(8);
    const { bytesRead } = await fh.read(buf, 0, 8, 0);
    return sigs.some((sig) => bytesRead >= sig.length && buf.subarray(0, sig.length).equals(sig));
  } finally {
    await fh.close();
  }
}

// Supprime (disque + req.files) tout fichier dont le contenu ne correspond pas au type
// annoncé ; le contrôleur signalera alors le champ comme manquant/invalide.
async function discardMismatched(req) {
  for (const [field, files] of Object.entries(req.files || {})) {
    for (const file of files) {
      if (!(await matchesSignature(file))) {
        fs.unlink(file.path, () => {});
        delete req.files[field];
        req.uploadError = req.uploadError || 'Le contenu d’un fichier ne correspond pas à son format annoncé.';
      }
    }
  }
}

// Wrapper : transforme les erreurs multer (fichier trop gros, etc.) en message de
// validation (req.uploadError) au lieu de faire échouer la requête (500), puis vérifie
// les magic bytes des fichiers acceptés. Les erreurs inattendues sont propagées.
function handleApplicationUpload(req, res, next) {
  uploadApplicationFiles(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.uploadError =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Un fichier dépasse la taille maximale (5 Mo).'
          : 'Un fichier envoyé est invalide.';
      return next();
    }
    if (err) return next(err);
    discardMismatched(req).then(() => next(), next);
  });
}

module.exports = { handleApplicationUpload, relPathOf, MAX_BYTES };
