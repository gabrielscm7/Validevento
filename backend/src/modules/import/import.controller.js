const importService = require('./import.service');

/**
 * Lida com a requisição de upload e processamento do arquivo CSV.
 */
async function importCSV(req, res) {
  try {
    const { event_id } = req.body;
    
    if (!event_id) {
      // Excluir arquivo enviado se faltar dados obrigatórios
      if (req.file) {
        require('fs').unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Parâmetro event_id é obrigatório.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo CSV (campo: file) não fornecido.' });
    }

    const result = await importService.importCSV(event_id, req.file.path);
    
    // Retorna o resumo da importação conforme RF-01
    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro no controller de importação:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  importCSV
};
