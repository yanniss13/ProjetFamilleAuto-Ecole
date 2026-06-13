// Upload du CV (candidature) via multer.
// - PDF uniquement ;
// - taille max 5 Mo ;
// - nom de fichier RÉGÉNÉRÉ (jamais le nom fourni par le client), extension figée .pdf.
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, `${name}.pdf`);
  },
});

// On refuse silencieusement les non-PDF : le contrôleur vérifiera la présence de
// req.file et renverra une erreur de validation claire.
function fileFilter(req, file, cb) {
  cb(null, file.mimetype === 'application/pdf');
}

const uploadCv = multer({ storage, fileFilter, limits: { fileSize: MAX_BYTES } }).single('cv');

module.exports = { uploadCv, UPLOAD_DIR, MAX_BYTES };
