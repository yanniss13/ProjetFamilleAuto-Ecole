// Upload des pièces de candidature via multer :
//   - cv           : CV, PDF uniquement ;
//   - idCard       : pièce d'identité, PDF/JPG/PNG ;
//   - license      : permis de conduire, PDF/JPG/PNG ;
//   - teachingCard : carte/autorisation d'enseigner, PDF/JPG/PNG.
// Taille max 5 Mo/fichier, nom RÉGÉNÉRÉ (jamais celui du client), extension dérivée du
// mimetype, stockage dans le dossier PRIVÉ storage/ (jamais sous public/).
const path = require('path');
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

// Wrapper : transforme les erreurs multer (fichier trop gros, etc.) en message de
// validation (req.uploadError) au lieu de faire échouer la requête (500). Les erreurs
// inattendues sont propagées normalement.
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
    next();
  });
}

module.exports = { handleApplicationUpload, relPathOf, MAX_BYTES };
