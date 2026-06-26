const importService = require('./import.service');

/**
 * Lida com a requisição de upload e processamento do arquivo (CSV, JSON, XML, XLSX).
 */
async function importFile(req, res) {
  try {
    const { event_id } = req.body;

    if (!event_id) {
      if (req.file) {
        require('fs').unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Parâmetro event_id é obrigatório.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não fornecido (campo: file).' });
    }

    const result = await importService.importFile(event_id, req.file.path);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro no controller de importação:', error.message);
    if (req.file) {
      try { require('fs').unlinkSync(req.file.path); } catch { /* ignore */ }
    }
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  importFile,
};
