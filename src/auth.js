// Autenticação: hash de senha (scrypt) e token assinado estilo JWT (HMAC-SHA256).
const crypto = require('node:crypto');

// Em produção isto viria de um segredo gerenciado. Para o estudo, aceita env ou usa um default.
const SECRET = process.env.SESSION_SECRET || 'troque-este-segredo-em-producao';
const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 horas

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 32).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function signToken({ sub, role }) {
  const payload = b64({ sub, role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data; // { sub, role, exp }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
