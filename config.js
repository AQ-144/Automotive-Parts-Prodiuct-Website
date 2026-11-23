/**
 * 统一配置中心
 *
 * 设计目标（对应优化项 OP-P0-06）：
 *  - 所有密钥与运行参数来自环境变量，.env 仅用于本地调试且不提交
 *  - 启动时校验关键配置，生产环境缺失配置时快速失败，避免“带病上线”
 *  - 去掉代码中的默认密码、默认密钥与敏感日志
 */

const path = require('path');

// 固定读取项目根目录的 .env，避免 PM2/Docker 工作目录不同导致配置丢失；
// 已存在的环境变量优先级高于 .env，便于生产环境注入
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

/** 布尔型环境变量解析 */
function toBool(value, defaultValue = false) {
  if (value === undefined || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

/** 整数型环境变量解析 */
function toInt(value, defaultValue) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : defaultValue;
}

/** 逗号分隔列表解析 */
function toList(value, defaultValue = []) {
  if (!value) return defaultValue;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const isProd = process.env.NODE_ENV === 'production';

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || '';
const jwtSecret = process.env.JWT_SECRET || '';
const refreshSecret = process.env.REFRESH_TOKEN_SECRET || '';

// ==================== 启动校验 ====================
const errors = [];

if (!adminPassword && !adminPasswordHash) {
  errors.push('必须配置 ADMIN_PASSWORD 或 ADMIN_PASSWORD_HASH');
}
if (!jwtSecret) {
  errors.push('必须配置 JWT_SECRET');
}
if (!refreshSecret) {
  errors.push('必须配置 REFRESH_TOKEN_SECRET');
}
if (jwtSecret && jwtSecret.length < 32) {
  errors.push('JWT_SECRET 长度至少 32 位');
}
if (refreshSecret && refreshSecret.length < 32) {
  errors.push('REFRESH_TOKEN_SECRET 长度至少 32 位');
}
if (isProd && adminPasswordHash && !/^\$2[aby]\$/.test(adminPasswordHash)) {
  errors.push('ADMIN_PASSWORD_HASH 必须是 bcrypt 哈希（以 $2a/$2b/$2y 开头）');
}

if (errors.length) {
  console.error('配置校验失败：\n - ' + errors.join('\n - '));
  process.exit(1);
}

module.exports = {
  isProd,
  port: toInt(process.env.PORT, 3000),
  // 部署在 Nginx/负载均衡之后时置为 true，限流才能拿到真实客户端 IP
  trustProxy: toBool(process.env.TRUST_PROXY, false),

  admin: {
    username: adminUsername,
    password: adminPassword,
    passwordHash: adminPasswordHash
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    refreshSecret,
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
  },

  // 浏览器跨域白名单；同源请求与小程序（无 Origin）不受影响
  corsOrigins: toList(process.env.CORS_ORIGINS, [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ]),

  upload: {
    dir: path.join(__dirname, 'uploads'),
    maxMb: toInt(process.env.UPLOAD_MAX_MB, 5)
  },

  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, 'parts.db'),

  rateLimit: {
    global: toInt(process.env.GLOBAL_RATE_LIMIT, 600),
    login: toInt(process.env.LOGIN_RATE_LIMIT, 5),
    inquiry: toInt(process.env.INQUIRY_RATE_LIMIT, 10)
  }
};
