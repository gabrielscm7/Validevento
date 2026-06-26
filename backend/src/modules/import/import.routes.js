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

// Configurar multer
const upload = multer({ 
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024 // limite de 10MB
  },
  fileFilter: (req, file, cb) => {
    // Apenas arquivos CSV
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Apenas arquivos no formato CSV (.csv) são aceitos.'));
    }
    cb(null, true);
  }
});

const router = express.Router();

// POST /api/import/csv - Exclusivo para Administradores
router.post(
  '/csv', 
  authMiddleware, 
  requireRole('admin'), 
  upload.single('file'), 
  importController.importCSV
);

module.exports = router;
