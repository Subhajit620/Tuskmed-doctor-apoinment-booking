const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../db/prisma');
const { ApiError } = require('../utils/errors');

function signSession(account) {
  return jwt.sign({ sub: account.id, role: account.role }, env.jwtSecret, { expiresIn: '7d' });
}

function setSessionCookie(res, account) {
  const token = signSession(account);
  res.cookie(env.sessionCookieName, token, {
    httpOnly: true,
    secure:false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(env.sessionCookieName);
}

/** Requires a valid session; attaches req.account (fresh from DB). */
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[env.sessionCookieName];
    if (!token) throw new ApiError(401, 'Not authenticated', 'NO_SESSION');
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw new ApiError(401, 'Session expired or invalid', 'BAD_SESSION');
    }
    const account = await prisma.account.findUnique({ where: { id: payload.sub } });
    if (!account) throw new ApiError(401, 'Account not found', 'NO_ACCOUNT');
    req.account = account;
    next();
  } catch (err) {
    next(err);
  }
}

/** Role gate - call after requireAuth. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.account) {
      return next(new ApiError(401, 'Not authenticated', 'NO_SESSION'));
    }
    // Allow if role is matched or user is ADMIN
    if (roles.includes(req.account.role) || req.account.role === 'ADMIN') {
      return next();
    }
    return next(new ApiError(403, 'Forbidden for this role', 'FORBIDDEN_ROLE'));
  };
}

module.exports = { signSession, setSessionCookie, clearSessionCookie, requireAuth, requireRole };
