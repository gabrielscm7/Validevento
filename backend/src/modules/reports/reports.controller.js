/**
 * Controller de relatórios (Fase 3).
 */
const reportsService = require('./reports.service');
const { auditLog } = require('../../middleware/audit');

function sendError(res, error) {
  return res.status(error.status || 500).json({ error: error.message });
}

// GET /api/events/:eventId/reports/md
async function md(req, res) {
  try {
    const event = req.event;
    const content = await reportsService.buildMarkdown(event.id, req.tenantId);
    if (content === null) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }

    const dateStr = new Date(event.date).toISOString().slice(0, 10);
    const filename = `relatorio-${reportsService.slugify(event.name)}-${dateStr}.md`;

    req.params.eventId = event.id;
    await auditLog(req, 'report_exported', 'event', event.id, { format: 'md' });

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(content);
  } catch (error) {
    console.error('Erro ao gerar relatório Markdown:', error.message);
    return sendError(res, error);
  }
}

// GET /api/events/:eventId/reports/csv
async function csv(req, res) {
  try {
    const event = req.event;
    const content = await reportsService.buildCsv(event.id, req.tenantId);

    const dateStr = new Date(event.date).toISOString().slice(0, 10);
    const filename = `log-${reportsService.slugify(event.name)}-${dateStr}.csv`;

    req.params.eventId = event.id;
    await auditLog(req, 'report_exported', 'event', event.id, { format: 'csv' });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(content);
  } catch (error) {
    console.error('Erro ao gerar relatório CSV:', error.message);
    return sendError(res, error);
  }
}

// GET /api/events/:eventId/reports/audit
async function audit(req, res) {
  try {
    const data = await reportsService.listAudit(
      req.event.id,
      req.tenantId,
      req.query.limit
    );
    return res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao listar auditoria:', error.message);
    return sendError(res, error);
  }
}

module.exports = { md, csv, audit };
