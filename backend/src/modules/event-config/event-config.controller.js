/**
 * Controller de configuração de evento (Fase 2).
 */
const eventConfigService = require('./event-config.service');
const { auditLog } = require('../../middleware/audit');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    error: error.code || error.message,
    details: error.code ? error.message : undefined,
  });
}

// GET /api/events/:eventId/config
async function getConfig(req, res) {
  try {
    const config = await eventConfigService.getConfig(req.event.id);
    if (!config) {
      // Eventos criados pela Fase 2 sempre possuem config; eventos legados não.
      // Nesse caso devolve a config padrão (sem persistir).
      return res.status(200).json(await eventConfigService.ensureConfig(req.event.id));
    }
    return res.status(200).json(config);
  } catch (error) {
    return sendError(res, error);
  }
}

// PUT /api/events/:eventId/config
async function updateConfig(req, res) {
  try {
    const config = await eventConfigService.updateConfig(req.event.id, req.body);
    if (!config) return res.status(404).json({ error: 'Evento não encontrado.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'event_config_updated', 'event_config', req.event.id, req.body);

    return res.status(200).json(config);
  } catch (error) {
    return sendError(res, error);
  }
}

// PATCH /api/events/:eventId/config/checkout
async function toggleCheckout(req, res) {
  try {
    const { checkout_enabled } = req.body;
    const config = await eventConfigService.toggleCheckout(req.event.id, checkout_enabled);
    if (!config) return res.status(404).json({ error: 'Evento não encontrado.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'checkout_toggled', 'event_config', req.event.id, { checkout_enabled: config.checkout_enabled });

    return res.status(200).json(config);
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = { getConfig, updateConfig, toggleCheckout };
