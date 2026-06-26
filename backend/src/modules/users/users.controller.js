const usersService = require('./users.service');

async function list(req, res) {
  try {
    const users = await usersService.listUsers();
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function create(req, res) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email e password são obrigatórios.' });
    const user = await usersService.createUser({ name, email, password, role });
    return res.status(201).json(user);
  } catch (error) {
    if (error.constraint === 'users_email_key') return res.status(409).json({ error: 'E-mail já cadastrado.' });
    return res.status(500).json({ error: error.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const user = await usersService.updateUser(id, req.body);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;
    const user = await usersService.deleteUser(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    return res.status(200).json({ message: 'Usuário desativado.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { list, create, update, remove };
