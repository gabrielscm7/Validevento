/**
 * Controller dos terminais genéricos (acesso por slug).
 *
 * As rotas públicas reutilizam os serviços existentes de validação, sync e
 * portões, passando `validatorId = null` (não há usuário logado).
 */
const terminalsService = require('./terminals.service');
const validationService = require('../validation/validation.service');
const syncService = require('../sync/sync.service');
const gatesService = require('../gates/gates.service');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    error: error.code || error.message,
    details: error.code ? error.message : undefined,
  });
}

/** Middleware: resolve :slug → terminal genérico de um evento ativo. */
async function resolveGenericTerminal(req, res, next) {
  try {
    const row = await terminalsService.findGenericBySlug(req.params.slug);
    if (!row) {
      return res.status(404).json({
        error: 'terminal_not_found',
        details: 'Link inválido ou terminal não encontrado.',
      });
    }
    if (row.deleted_at) {
      return res.status(410).json({
        error: 'terminal_deleted',
        details: 'Este terminal foi removido e não pode mais ser usado.',
      });
    }
    if (row.suspended) {
      return res.status(403).json({
        error: 'terminal_suspended',
        details: 'Acesso suspenso. Fale com o responsável pelo evento.',
      });
    }
    if (row.event_status !== 'active') {
      return res.status(403).json({
        error: 'event_not_active',
        details: 'Este evento não está ativo no momento.',
      });
    }
    req.genericRow = row;
    req.genericTerminal = {
      terminalId: row.id,
      eventId: row.event_id,
      tenantId: row.tenant_id,
    };
    return next();
  } catch (error) {
    console.error('Erro ao resolver terminal genérico:', error.message);
    return res.status(500).json({ error: 'resolve_terminal_failed', details: error.message });
  }
}

// ── Autenticados (admin/supervisor/master) ──

async function createGeneric(req, res) {
  try {
    const terminal = await terminalsService.createGeneric(
      req.event.id,
      req.body?.name
    );
    return res.status(201).json(terminal);
  } catch (error) {
    return sendError(res, error);
  }
}

async function list(req, res) {
  try {
    const terminals = await terminalsService.listTerminals(req.event.id);
    return res.status(200).json(terminals);
  } catch (error) {
    return sendError(res, error);
  }
}

// ── Públicos (por slug) ──

async function join(req, res) {
  try {
    const row = req.genericRow;
    const eventConfig = await terminalsService.getEventConfig(row.event_id);
    return res.status(200).json({
      terminal_id: row.id,
      terminal_name: row.name,
      event_id: row.event_id,
      event_name: row.event_name,
      event_date: row.event_date,
      event_location: row.location,
      logo_url: row.logo_url,
      event_config: eventConfig,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function open(req, res) {
  try {
    const { operator_name } = req.body || {};
    const result = await terminalsService.openOrGetTerminal(req.params.slug, operator_name);

    if (result.error) {
      const statusMap = {
        terminal_not_found: 404,
        terminal_deleted: 410,
        terminal_suspended: 403,
      };
      return res.status(statusMap[result.error] || 400).json({
        error: result.error,
        details: `Terminal não disponível: ${result.error}`,
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

async function suspend(req, res) {
  try {
    const { terminalId } = req.params;
    const suspended = req.body?.suspended !== false;
    const row = await terminalsService.setSuspended(terminalId, suspended, req.user.id);
    if (!row) return res.status(404).json({ error: 'terminal_not_found' });
    return res.status(200).json(row);
  } catch (error) {
    return sendError(res, error);
  }
}

async function remove(req, res) {
  try {
    const { terminalId } = req.params;
    const deleted = await terminalsService.softDelete(terminalId);
    if (!deleted) return res.status(404).json({ error: 'terminal_not_found' });
    return res.status(200).json({ deleted: true });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getQRCode(req, res) {
  try {
    const { slug } = req.params;
    const { format } = req.query;

    if (format === 'png') {
      const buffer = await terminalsService.generateQRBuffer(slug);
      res.setHeader('Content-Type', 'image/png');
      return res.send(buffer);
    }

    const result = await terminalsService.generateQRCode(slug);
    return res.status(200).json(result);
  } catch (err) {
    if (err.message === 'terminal_not_found') {
      return res.status(404).json({ error: 'terminal_not_found' });
    }
    return res.status(500).json({ error: 'qr_generation_failed' });
  }
}

async function gates(req, res) {
  try {
    const data = await gatesService.listGates(req.genericTerminal.eventId);
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function getGate(req, res) {
  try {
    const data = await gatesService.getTerminalGate({
      eventId: req.genericTerminal.eventId,
      terminalId: req.genericTerminal.terminalId,
    });
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function setGate(req, res) {
  try {
    const data = await gatesService.setTerminalGate({
      eventId: req.genericTerminal.eventId,
      terminalId: req.genericTerminal.terminalId,
      gateId: req.body?.gate_id ?? null,
    });
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function snapshot(req, res) {
  try {
    const data = await syncService.getSnapshot(
      req.genericTerminal.eventId,
      req.query.since,
      req.genericTerminal.tenantId,
      req.genericTerminal.terminalId
    );
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function logs(req, res) {
  try {
    const list_ = req.body?.logs;
    if (!Array.isArray(list_)) {
      return res.status(400).json({ error: 'logs deve ser um array.' });
    }
    const result = await syncService.processOfflineLogs(
      req.genericTerminal.eventId,
      req.genericTerminal.terminalId,
      null,
      list_,
      req.genericTerminal.tenantId
    );
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

async function heartbeat(req, res) {
  try {
    await syncService.registerHeartbeat(
      req.genericTerminal.eventId,
      req.genericTerminal.terminalId,
      req.body?.name,
      req.genericTerminal.tenantId
    );
    return res.status(200).json({ ok: true, terminal_id: req.genericTerminal.terminalId });
  } catch (error) {
    return sendError(res, error);
  }
}

async function lookup(req, res) {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Parâmetro code é obrigatório.' });
    const result = await validationService.lookupTicket(
      req.genericTerminal.eventId,
      code,
      req.genericTerminal.tenantId
    );
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

async function search(req, res) {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Forneça o parâmetro q (busca por nome).' });
    const results = await validationService.searchTickets(
      req.genericTerminal.eventId,
      q,
      req.genericTerminal.tenantId
    );
    return res.status(200).json({ results });
  } catch (error) {
    return sendError(res, error);
  }
}

async function qrcode(req, res) {
  try {
    const { ticket_code } = req.body || {};
    if (!ticket_code) {
      return res.status(400).json({ error: 'Parâmetro ticket_code é obrigatório.' });
    }
    const result = await validationService.validateQRCode(
      req.genericTerminal.eventId,
      req.genericTerminal.terminalId,
      null,
      ticket_code,
      req.genericTerminal.tenantId
    );
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

async function manual(req, res) {
  try {
    const { ticket_id } = req.body || {};
    if (!ticket_id) {
      return res.status(400).json({ error: 'Parâmetro ticket_id é obrigatório.' });
    }
    const result = await validationService.validateManual(
      req.genericTerminal.eventId,
      req.genericTerminal.terminalId,
      null,
      ticket_id,
      req.genericTerminal.tenantId
    );
    if (result.status === 'not_found') {
      return res.status(404).json({ error: 'Ticket não encontrado.' });
    }
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

async function checkout(req, res) {
  try {
    const { ticket_code } = req.body || {};
    if (!ticket_code) {
      return res.status(400).json({ error: 'Parâmetro ticket_code é obrigatório.' });
    }
    const result = await validationService.checkout({
      eventId: req.genericTerminal.eventId,
      terminalId: req.genericTerminal.terminalId,
      validatorId: null,
      ticketCode: ticket_code,
      tenantId: req.genericTerminal.tenantId,
    });
    if (result.error) {
      return res.status(422).json({ error: result.error });
    }
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

async function master(req, res) {
  try {
    const { beneficiary_name } = req.body || {};
    if (!beneficiary_name) {
      return res.status(400).json({ error: 'Parâmetro beneficiary_name é obrigatório.' });
    }
    const result = await validationService.useMaster({
      eventId: req.genericTerminal.eventId,
      terminalId: req.genericTerminal.terminalId,
      validatorId: null,
      beneficiaryName: beneficiary_name,
      tenantId: req.genericTerminal.tenantId,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

async function undo(req, res) {
  try {
    const { ticket_code } = req.body || {};
    if (!ticket_code) {
      return res.status(400).json({ error: 'Parâmetro ticket_code é obrigatório.' });
    }
    const result = await validationService.undoValidation({
      eventId: req.genericTerminal.eventId,
      terminalId: req.genericTerminal.terminalId,
      reversedBy: null,
      ticketCode: ticket_code,
      tenantId: req.genericTerminal.tenantId,
    });
    if (result.error) {
      const statusMap = {
        not_found: 404,
        nothing_to_undo: 422,
        already_checked_out: 422,
        undo_window_expired: 422,
        not_undoable_by_terminal: 403,
      };
      return res.status(statusMap[result.error] || 422).json({ error: result.error });
    }
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  resolveGenericTerminal,
  createGeneric,
  list,
  join,
  open,
  suspend,
  remove,
  getQRCode,
  gates,
  getGate,
  setGate,
  snapshot,
  logs,
  heartbeat,
  lookup,
  search,
  qrcode,
  manual,
  checkout,
  undo,
  master,
};
