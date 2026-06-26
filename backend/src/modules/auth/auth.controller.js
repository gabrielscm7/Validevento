const authService = require('./auth.service');

/**
 * Controller para autenticação
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro de login:', error.message);
    return res.status(401).json({ error: error.message });
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
    console.error('Erro ao recuperar perfil:', error.message);
    return res.status(500).json({ error: 'Erro interno do servidor ao buscar dados do usuário.' });
  }
}

module.exports = {
  login,
  me
};
