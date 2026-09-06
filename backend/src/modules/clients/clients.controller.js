const clientsService = require('./clients.service');

async function list(req, res) {
  try {
    const clients = await clientsService.listClients();
    return res.status(200).json(clients);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function create(req, res) {
  try {
    const client = await clientsService.createClient(req.body);
    return res.status(201).json(client);
  } catch (error) {
    if (error.constraint === 'clients_email_key') {
      return res.status(409).json({ error: 'E-mail já cadastrado para outro cliente.' });
    }
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
}

async function detail(req, res) {
  try {
    const { id } = req.params;
    const client = await clientsService.getClientById(id);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    return res.status(200).json(client);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const client = await clientsService.updateClient(id, req.body);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    return res.status(200).json(client);
  } catch (error) {
    if (error.constraint === 'clients_email_key') {
      return res.status(409).json({ error: 'E-mail já cadastrado para outro cliente.' });
    }
    return res.status(500).json({ error: error.message });
  }
}

async function suspend(req, res) {
  try {
    const { id } = req.params;
    // Suspensão bloqueia login de todos os usuários do tenant
    const client = await clientsService.setActive(id, false);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    return res.status(200).json(client);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function activate(req, res) {
  try {
    const { id } = req.params;
    const client = await clientsService.setActive(id, true);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    return res.status(200).json(client);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function usage(req, res) {
  try {
    const { id } = req.params;
    const result = await clientsService.getUsage(id);
    if (!result) return res.status(404).json({ error: 'Cliente não encontrado.' });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  list,
  create,
  detail,
  update,
  suspend,
  activate,
  usage,
};
