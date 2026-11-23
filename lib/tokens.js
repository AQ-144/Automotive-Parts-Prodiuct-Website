/**
 * 令牌与密码工具（对应优化项 OP-P0-04）
 *
 * - Access Token：短有效期，携带 token_version，可在退出/改密后整体失效
 * - Refresh Token：长有效期，仅用于换取新的 Access Token
 * - 密码：bcrypt 哈希存储，禁止明文落库
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');

/** 签发 Access Token */
function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      role: user.role,
      ver: user.token_version,
      type: 'access'
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/** 签发 Refresh Token */
function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      ver: user.token_version,
      type: 'refresh'
    },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
}

/** 校验 Refresh Token，并确认类型正确 */
function verifyRefreshToken(token) {
  const payload = jwt.verify(token, config.jwt.refreshSecret);
  if (payload.type !== 'refresh') {
    throw new Error('令牌类型错误');
  }
  return payload;
}

/** 生成 bcrypt 哈希 */
function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

/** 校验密码 */
function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** 统一签发登录态 */
function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  return {
    // token 字段保留给小程序旧逻辑使用，等价于 accessToken
    token: accessToken,
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.expiresIn
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashPassword,
  verifyPassword,
  issueTokens
};
