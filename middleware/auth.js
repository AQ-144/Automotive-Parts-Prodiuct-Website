/**
 * 后台鉴权中间件（对应优化项 OP-P0-04）
 *
 * 校验流程：
 *  1. 读取 Authorization: Bearer <token>
 *  2. 校验 JWT 签名、有效期与类型
 *  3. 比对数据库中的 token_version，实现退出登录/改密后的令牌吊销
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const database = require('../database');

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) {
      return res.status(401).json({ success: false, message: '未授权，请先登录' });
    }

    const payload = jwt.verify(token, config.jwt.secret);
    if (payload.type !== 'access') {
      return res.status(401).json({ success: false, message: '登录状态无效，请重新登录' });
    }

    const user = await database.getAdminUserById(payload.sub);
    if (!user || Number(user.token_version) !== Number(payload.ver)) {
      return res.status(401).json({ success: false, message: '登录状态已失效，请重新登录' });
    }

    req.admin = {
      id: user.id,
      username: user.username,
      role: user.role
    };
    return next();
  } catch (e) {
    // 签名错误、过期、格式错误统一返回 401，避免暴露内部细节
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }
}

module.exports = { authRequired };
