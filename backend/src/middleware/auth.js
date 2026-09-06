const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/database');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Acesso negado. Token de autorização não fornecido.' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Erro de token. O formato deve ser Bearer <token>.' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    req.user = {
      id: decoded.id,
      name: decoded.name,
      role: decoded.role,
      tenant_id: decoded.tenant_id || null,
      email: decoded.email || null,
    };
    // tenant_id null = usuário Master (proprietário)
    req.tenantId = req.user.tenant_id;

    // Se o usuário pertence a um tenant, o tenant precisa estar ativo.
    if (req.tenantId) {
      try {
        const tenantRes = await db.query(
          'SELECT active FROM clients WHERE id = $1',
          [req.tenantId]
        );
        if (tenantRes.rowCount === 0 || tenantRes.rows[0].active === false) {
          return res.status(403).json({ error: 'tenant_suspended' });
        }
      } catch (dbError) {
        console.error('Falha ao verificar tenant:', dbError.message);
        return res.status(500).json({ error: 'Erro ao verificar a situação do cliente.' });
      }
    }

    next();
  } catch (error) {
    console.error('Falha de verificação de JWT:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessão expirada. Por favor, faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
};

module.exports = authMiddleware;
