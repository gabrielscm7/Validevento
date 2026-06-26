const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const importController = require('./import.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');

// Criar pasta de upload temporária se não existir
const uploadDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_EXTENSIONS = ['.csv', '.json', '.xml', '.xlsx'];

// Configurar multer com diskStorage para preservar a extensão original
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error('Formato não suportado. Use: CSV, JSON, XML ou XLSX.'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
});

const router = express.Router();

// POST /api/import/csv — aceita CSV, JSON, XML, XLSX
router.post(
  '/csv',
  authMiddleware,
  requireRole('admin'),
  upload.single('file'),
  importController.importFile
);

module.exports = router;
