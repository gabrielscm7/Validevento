/**
 * Middleware de acesso a eventos (Fase 2).
 *
 * Verifica se o usuário autenticado pode acessar o evento identificado por
 * req.params.eventId (ou req.params.id). Regras:
 *  - Master (role 'master') acessa qualquer evento.
 *  - Admin do mesmo tenant acessa qualquer evento do tenant.
 *  - Supervisor/validador precisa estar na equipe do evento (event_team).
 *
 * Em caso de sucesso, anexa req.event (linha completa) e req.eventRole
 * (role efetiva: role_override da equipe quando houver, senão a role base).
 * Usar este middleware em TODOS os endpoints que recebem :id de evento.
 */
const db = require('../config/database');
const { isValidUUIDv4 } = require('../utils/validation');

function notFound(res) {
  return res.status(404).json({ error: 'Evento não encontrado.' });
}

function forbidden(res) {
  return res.status(403).json({ error: 'not_in_event_team', message: 'Acesso negado: usuário não faz parte da equipe deste evento.' });
}

// Apenas perfis operacionais são restritos a eventos ativos.
// Admin e master passam independente do status (draft/closed).
const RESTRICTED_ROLES = ['validator', 'supervisor'];

async function eventAccess(req, res, next) {
  try {
    const eventId = req.params.eventId || req.params.id;
    if (!eventId) {
      return res.status(400).json({ error: 'Identificador do evento é obrigatório.' });
    }
    if (!isValidUUIDv4(eventId)) {
      return notFound(res);
    }

    const result = await db.query(
      `SELECT * FROM events WHERE id = $1`,
      [eventId]
    );

    if (result.rowCount === 0) {
      return notFound(res);
    }
    const event = result.rows[0];

    const { role, tenant_id: userTenantId } = req.user;
    const userId = req.user.id;

    // Master (sistema) tem acesso global, mas respeita o cliente selecionado
    // (header X-Tenant-Id). Se um tenant foi forçado, só acessa eventos dele.
    if (role === 'master') {
      if (req.forcedTenantId && event.tenant_id !== req.forcedTenantId) {
        return notFound(res);
      }
      req.event = event;
      req.eventRole = 'master';
      return next();
    }

    // Usuários de tenant só acessam eventos do próprio tenant
    if (event.tenant_id !== userTenantId) {
      return notFound(res);
    }

    // Admin do tenant tem acesso a todos os eventos do tenant
    if (role === 'admin') {
      req.event = event;
      req.eventRole = 'admin';
      return next();
    }

    // Demais perfis: precisa estar na equipe do evento
    const teamResult = await db.query(
      `SELECT role_override FROM event_team
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );

    if (teamResult.rowCount === 0) {
      return forbidden(res);
    }

    const roleOverride = teamResult.rows[0].role_override;

    // Eventos em draft/closed são inacessíveis para validator/supervisor.
    if (RESTRICTED_ROLES.includes(role) && event.status !== 'active') {
      return res.status(403).json({
        error: 'Este evento não está ativo.',
        event_status: event.status,
      });
    }

    req.event = event;
    req.eventRole = roleOverride || role;
    return next();
  } catch (error) {
    console.error('Falha no eventAccess:', error.message);
    return res.status(500).json({ error: 'Erro ao verificar acesso ao evento.' });
  }
}

/**
 * Restringe rotas de evento com base na role EFETIVA (req.eventRole),
 * que considera o role_override atribuído pela equipe.
 */
function requireEventRole(...allowedRoles) {
  return (req, res, next) => {
    const effective = req.eventRole || (req.user && req.user.role);
    if (!allowedRoles.includes(effective)) {
      return res.status(403).json({
        error: `Acesso negado. Perfil '${effective}' não possui permissão para esta rota.`,
      });
    }
    next();
  };
}

/**
 * Variante para rotas que não recebem o evento na URL (ex.: /api/validation,
 * /api/sync), mas informam o event_id no body ou na query. Reaproveita a
 * lógica de eventAccess injetando params.eventId.
 */
async function eventAccessFromInput(req, res, next) {
  const eventId = (req.body && req.body.event_id) || (req.query && req.query.event_id);
  if (!eventId || !isValidUUIDv4(eventId)) {
    return res.status(400).json({ error: 'invalid_event_id', details: 'event_id é obrigatório e deve ser um UUID válido.' });
  }
  req.params.eventId = eventId;
  return eventAccess(req, res, next);
}

/**
 * Variante que requer tenant_id explícito para MASTER.
 * Usada em rotas admin onde o contexto de cliente é obrigatório: o master
 * precisa ter selecionado um cliente (header X-Tenant-Id) para acessar eventos.
 * Para os demais perfis o comportamento é idêntico ao de eventAccess.
 */
async function eventAccessRequireTenant(req, res, next) {
  try {
    const eventId = req.params.eventId || req.params.id;
    if (!eventId) {
      return res.status(400).json({ error: 'Identificador do evento é obrigatório.' });
    }
    if (!isValidUUIDv4(eventId)) {
      return notFound(res);
    }

    const result = await db.query(
      `SELECT * FROM events WHERE id = $1`,
      [eventId]
    );

    if (result.rowCount === 0) {
      return notFound(res);
    }
    const event = result.rows[0];

    const { role, tenant_id: userTenantId } = req.user;

    if (role === 'master') {
      // MASTER sem cliente selecionado = acesso negado
      if (!req.forcedTenantId) {
        return res.status(403).json({
          error: 'tenant_context_required',
          message: 'MASTER deve selecionar um cliente antes de acessar eventos.',
        });
      }
      // Cliente selecionado diferente do dono do evento = não encontrado
      if (event.tenant_id !== req.forcedTenantId) {
        return notFound(res);
      }
      req.event = event;
      req.eventRole = 'master';
      return next();
    }

    // Demais perfis: reaproveita a checagem padrão
    return eventAccess(req, res, next);
  } catch (error) {
    console.error('Falha no eventAccessRequireTenant:', error.message);
    return res.status(500).json({ error: 'Erro ao verificar acesso ao evento.' });
  }
}

/**
 * Extrai forcedTenantId do header X-Tenant-Id (setado pelo frontend após a
 * seleção do cliente pelo MASTER). Ignora valores não-UUID.
 */
function withForcedTenantId(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];
  if (tenantId && isValidUUIDv4(tenantId)) {
    req.forcedTenantId = tenantId;
  }
  next();
}

module.exports = {
  eventAccess,
  requireEventRole,
  eventAccessFromInput,
  eventAccessRequireTenant,
  withForcedTenantId,
};
