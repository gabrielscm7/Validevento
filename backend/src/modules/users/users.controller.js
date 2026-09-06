const usersService = require('./users.service');
const { auditLog } = require('../../middleware/audit');

async function list(req, res) {
  try {
    // Admin vê somente seu tenant; master vê todos
    const tenantId = req.user.role === 'master' ? (req.query.tenant_id || null) : req.tenantId;
    const users = await usersService.listUsers(tenantId);
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function create(req, res) {
  try {
    const { name, cpf, email, role, tenant_id } = req.body;

    // Master precisa informar para qual tenant o usuário será criado;
    // admin cria somente dentro do próprio tenant.
    const tenantId = req.user.role === 'master' ? (tenant_id || null) : req.tenantId;

    // Admin não cria outros admins (RN-08 / RF-02)
    if (req.user.role === 'admin' && role === 'admin') {
      return res.status(403).json({ error: 'Somente o Master pode criar administradores.' });
    }

    const user = await usersService.createUser({ tenantId, name, cpf, email, role });

    await auditLog(req, 'user.create', 'user', user.id, { email: user.email, role: user.role });

    return res.status(201).json(user);
  } catch (error) {
    const status = error.status || 500;
    const body = { error: error.code || error.message };
    if (error.code === 'quota_exceeded') {
      body.resource = error.resource;
      body.used = error.used;
      body.max = error.max;
    }
    return res.status(status).json(body);
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.user.role === 'master' ? null : req.tenantId;
    const user = await usersService.updateUser(id, tenantId, req.body);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function deactivate(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.user.role === 'master' ? null : req.tenantId;
    const user = await usersService.deactivateUser(id, tenantId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    return res.status(200).json({ message: 'Usuário desativado.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { list, create, update, deactivate };
