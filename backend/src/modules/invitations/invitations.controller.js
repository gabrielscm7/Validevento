/**
 * Controller de ingressos de emergência (Fase 2).
 */
const invitationsService = require('./invitations.service');
const { auditLog } = require('../../middleware/audit');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    error: error.code || error.message,
    details: error.code ? error.message : undefined,
  });
}

// GET /api/events/:eventId/master-ticket
async function getMasterTicket(req, res) {
  try {
    const mt = await invitationsService.getMasterTicket(req.event.id);
    if (!mt) return res.status(404).json({ error: 'master_ticket_not_found', message: 'Ingresso master não criado.' });
    return res.status(200).json(mt);
  } catch (error) {
    return sendError(res, error);
  }
}

// POST /api/events/:eventId/master-ticket
async function createMasterTicket(req, res) {
  try {
    const { max_uses } = req.body;
    const mt = await invitationsService.upsertMasterTicket({
      eventId: req.event.id,
      createdBy: req.user.id,
      maxUses: max_uses === undefined ? null : max_uses,
    });

    req.params.eventId = req.event.id;
    await auditLog(req, 'master_ticket_created', 'master_ticket', req.event.id, { max_uses: mt.max_uses });

    return res.status(201).json(mt);
  } catch (error) {
    return sendError(res, error);
  }
}

// DELETE /api/events/:eventId/master-ticket
async function deactivateMasterTicket(req, res) {
  try {
    const mt = await invitationsService.deactivateMasterTicket(req.event.id);
    if (!mt) return res.status(404).json({ error: 'master_ticket_not_found', message: 'Ingresso master não está ativo.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'master_ticket_deactivated', 'master_ticket', req.event.id, {});

    return res.status(200).json(mt);
  } catch (error) {
    return sendError(res, error);
  }
}

// POST /api/events/:eventId/invitations
async function createInvitation(req, res) {
  try {
    const { display_name, cpf } = req.body;
    const invitation = await invitationsService.createInvitation({
      eventId: req.event.id,
      tenantId: req.event.tenant_id,
      displayName: display_name,
      cpf,
      createdBy: req.user.id,
    });

    req.params.eventId = req.event.id;
    await auditLog(req, 'invitation_created', 'ticket', invitation.id, {
      origin: invitation.origin,
      display_name: invitation.display_name,
    });

    return res.status(201).json(invitation);
  } catch (error) {
    return sendError(res, error);
  }
}

// POST /api/events/:eventId/invitations/bulk (multipart CSV)
async function bulkInvitations(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Arquivo não fornecido (campo: file).' });
    }

    const { parse } = require('csv-parse');
    const content = file.buffer.toString('utf8');

    const records = await new Promise((resolve, reject) => {
      parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    const rows = records.map((r, i) => ({ ...r, __line: i + 2 }));

    const result = await invitationsService.bulkInvitations({
      eventId: req.event.id,
      tenantId: req.event.tenant_id,
      rows,
      createdBy: req.user.id,
    });

    req.params.eventId = req.event.id;
    await auditLog(req, 'bulk_invitation_created', 'ticket', req.event.id, {
      count: result.inserted,
      errors: result.errors.length,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  getMasterTicket,
  createMasterTicket,
  deactivateMasterTicket,
  createInvitation,
  bulkInvitations,
};
