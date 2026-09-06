/**
 * Controller de equipe do evento (Fase 2).
 */
const eventTeamService = require('./event-team.service');
const { auditLog } = require('../../middleware/audit');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    error: error.code || error.message,
    details: error.code ? error.message : undefined,
  });
}

// GET /api/events/:eventId/team
async function list(req, res) {
  try {
    const team = await eventTeamService.listTeam(req.event.id);
    return res.status(200).json(team);
  } catch (error) {
    return sendError(res, error);
  }
}

// POST /api/events/:eventId/team
async function add(req, res) {
  try {
    const { user_id, role_override } = req.body;
    if (!user_id) return res.status(400).json({ error: 'missing_fields', details: 'user_id é obrigatório.' });

    const team = await eventTeamService.addMember({
      eventId: req.event.id,
      tenantId: req.event.tenant_id,
      userId: user_id,
      roleOverride: role_override,
    });

    req.params.eventId = req.event.id;
    await auditLog(req, 'team_member_added', 'event_team', req.event.id, {
      user_id: user_id,
      role_override: role_override || null,
    });

    return res.status(201).json(team);
  } catch (error) {
    return sendError(res, error);
  }
}

// DELETE /api/events/:eventId/team/:userId
async function remove(req, res) {
  try {
    const { userId } = req.params;
    const removed = await eventTeamService.removeMember({
      eventId: req.event.id,
      userId,
    });

    if (!removed) return res.status(404).json({ error: 'Membro não encontrado na equipe.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'team_member_removed', 'event_team', req.event.id, { user_id: userId });

    return res.status(200).json({ message: 'Membro removido da equipe.' });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = { list, add, remove };
