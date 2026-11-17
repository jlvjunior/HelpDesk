const jwt = require('jsonwebtoken');
const config = require('./config');

// Valida o token emitido pelo ticket-service (mesmo segredo) e preenche req.user.
function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'autenticação necessária' });
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: p.sub, name: p.name, email: p.email, role: p.role };
    next();
  } catch {
    res.status(401).json({ error: 'sessão inválida ou expirada' });
  }
}

const isStaff = (user) => ['admin', 'operador'].includes(user.role);

module.exports = { authenticate, isStaff };
