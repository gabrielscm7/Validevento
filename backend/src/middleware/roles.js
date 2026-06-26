/**
 * Middleware para restringir rotas com base no perfil (role) do usuário.
 * @param {...string} allowedRoles - Perfis permitidos (ex: 'admin', 'supervisor', 'validator')
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado no contexto da requisição.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acesso negado. Perfil '${req.user.role}' não possui permissão para esta rota.`
      });
    }

    next();
  };
};

module.exports = requireRole;
