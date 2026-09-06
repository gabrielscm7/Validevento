const authService = require('./auth.service');
const { auditLog } = require('../../middleware/audit');

/**
 * Controller de autenticação (login por CPF + verificação de e-mail + recuperação)
 */

async function login(req, res) {
  try {
    const { cpf, password } = req.body;
    const result = await authService.login(cpf, password);
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 401;
    return res.status(status).json({ error: error.code || error.message });
  }
}

async function verifyEmail(req, res) {
  try {
    const { token, password } = req.body;
    const result = await authService.verifyEmail(token, password);
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({ error: error.code || error.message });
  }
}

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;
    const result = await authService.resetPassword(token, password);
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.code || error.message });
  }
}

/**
 * Retorna as informações do usuário atual baseado no token JWT
 */
async function me(req, res) {
  try {
    const user = await authService.getById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno do servidor ao buscar dados do usuário.' });
  }
}

async function logout(req, res) {
  await auditLog(req, 'auth.logout', 'user', req.user ? req.user.id : null);
  return res.status(200).json({ message: 'Logout realizado com sucesso no servidor (limpe o token localmente).' });
}

module.exports = {
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  me,
  logout,
};
