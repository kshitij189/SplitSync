const jwt = require('jsonwebtoken');

// In-memory blacklist for refresh tokens (use Redis in production)
const blacklistedTokens = new Set();

function generateAccessToken(user) {
  return jwt.sign(
    { user_id: user.id, username: user.username },
    process.env.SECRET_KEY,
    { expiresIn: process.env.ACCESS_TOKEN_LIFETIME || '30m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { user_id: user.id, username: user.username, type: 'refresh' },
    process.env.SECRET_KEY,
    { expiresIn: process.env.REFRESH_TOKEN_LIFETIME || '7d' }
  );
}

function generateTokens(user) {
  return {
    access: generateAccessToken(user),
    refresh: generateRefreshToken(user),
  };
}

function blacklistToken(token) {
  blacklistedTokens.add(token);
}

function isBlacklisted(token) {
  return blacklistedTokens.has(token);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  blacklistToken,
  isBlacklisted,
};
