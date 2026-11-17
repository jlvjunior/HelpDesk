const { scryptSync, randomBytes, timingSafeEqual } = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');

const ROLES = ['admin', 'operador', 'usuario'];
const STAFF = ['admin', 'operador']; // perfis que atendem chamados

// Senhas guardadas como hash scrypt com salt aleatório (nunca em texto puro).
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.name, email: user.email, role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
}

// Exige "Authorization: Bearer <token>" válido e preenche req.user.
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

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'permissão insuficiente para esta ação' });

const isStaff = (user) => STAFF.includes(user.role);
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at });

module.exports = { ROLES, STAFF, hashPassword, verifyPassword, signToken, authenticate, requireRole, isStaff, publicUser };
