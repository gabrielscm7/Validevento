/**
 * Controller de dashboard (Fase 3 — v2).
 * Rotas escopadas por evento: req.event é anexado pelo eventAccess.
 */
const dashboardService = require('./dashboard.service');

function sendError(res, error) {
  return res.status(error.status || 500).json({ error: error.message });
}

async function getSummary(req, res) {
  try {
    const data = await dashboardService.getSummary(req.event.id, req.tenantId);
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function getFlow(req, res) {
  try {
    const data = await dashboardService.getFlow(req.event.id, req.tenantId, {
      date: req.query.date,
    });
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function getBatches(req, res) {
  try {
    const data = await dashboardService.getBatches(req.event.id, req.tenantId);
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function getAlerts(req, res) {
  try {
    const data = await dashboardService.getAlerts(req.event.id, req.tenantId, {
      limit: req.query.limit,
    });
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function getTerminals(req, res) {
  try {
    const data = await dashboardService.getTerminals(req.event.id, req.tenantId);
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function getLiveFeed(req, res) {
  try {
    const data = await dashboardService.getLiveFeed(req.event.id, req.tenantId, {
      limit: req.query.limit,
    });
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function getSpeed(req, res) {
  try {
    const data = await dashboardService.getSpeed(req.event.id, req.tenantId);
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  getSummary,
  getFlow,
  getBatches,
  getAlerts,
  getTerminals,
  getLiveFeed,
  getSpeed,
};
