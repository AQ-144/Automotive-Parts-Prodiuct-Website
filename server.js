/**
 * 汽车配件信息平台 - 后端服务主入口
 *
 * 职责：
 *  - C 端：配件列表（分类/状态/搜索/排序/分页/价格区间/车型筛选）、配件详情（含适配车型）
 *  - 车型库：全部车型（品牌分组），支持车型选择引导
 *  - 询价单：提交、后台查询与状态流转（核心业务闭环）
 *  - B 端：JWT 登录/刷新/退出、配件增删改、上下架、统计、分类/品牌、图片上传
 *
 * 安全基线（对应 OP-P0-04）：
 *  - bcrypt 密码哈希、JWT 短令牌 + Refresh Token、token_version 吊销
 *  - 登录/询价限流、CORS 白名单、helmet 安全头、错误信息脱敏、上传魔数校验
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const compression = require('compression');
const helmet = require('helmet');
const rateLimitModule = require('express-rate-limit');
const rateLimit = rateLimitModule.rateLimit || rateLimitModule;

const config = require('./config');
const database = require('./database');
const { authRequired } = require('./middleware/auth');
const {
  issueTokens,
  verifyRefreshToken,
  hashPassword,
  verifyPassword
} = require('./lib/tokens');
const inquiryRoutes = require('./routes/inquiries');

const app = express();

// ==================== 基础安全与性能中间件 ====================
app.disable('x-powered-by');
// 部署在 Nginx 后时由 TRUST_PROXY 开启，限流才能拿到真实 IP
app.set('trust proxy', config.trustProxy ? 1 : false);

// 安全响应头；后台页面尚未重建，暂关闭 CSP 避免误伤内联脚本
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS 白名单：浏览器跨域仅放行配置来源；小程序请求无 Origin，直接放行
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: false
}));

app.use(compression());

// 请求体限制，避免超大 JSON 占用内存
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ==================== 限流 ====================
// 全局限流：兜底防刷
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimit.global,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: '请求过于频繁，请稍后再试' }
});
app.use('/api', globalLimiter);

// 登录/刷新接口限流：防止暴力破解
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimit.login,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // 只统计失败尝试：正常登录/刷新不会挤占额度
  skipSuccessfulRequests: true,
  message: { success: false, message: '登录尝试过于频繁，请 1 分钟后再试' }
});

// ==================== 高并发：轻量内存缓存 ====================
// 读多写少场景，用内存缓存降低数据库压力。
// - CACHE_TTL：读缓存有效期（秒）
// - 写操作（增删改/上下架）后调用 purgeCache() 立即失效，保证数据一致
const CACHE_TTL = 30;
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.expire > Date.now()) return hit.data;
  if (hit) cache.delete(key);
  return null;
}

function cacheSet(key, data, ttl = CACHE_TTL) {
  cache.set(key, { data, expire: Date.now() + ttl * 1000 });
}

function purgeCache() {
  cache.clear();
}

// ==================== 静态资源 ====================
app.use(express.static(path.join(__dirname, 'public')));

// 上传目录：生产环境建议切换对象存储（OP-P1-03），本地目录仅作开发回退
const UPLOAD_DIR = config.upload.dir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

// ==================== 图片上传（魔数校验） ====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error('仅支持 JPG/PNG/GIF/WebP 图片'), ok);
  }
});

/**
 * 通过文件头识别真实图片类型，防止“改扩展名/伪造 MIME”上传
 * 返回扩展名，无法识别则返回 null
 */
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngMagic.every((byte, i) => buffer[i] === byte)) return 'png';

  // GIF: GIF87a / GIF89a
  const head6 = buffer.slice(0, 6).toString('ascii');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'gif';

  // WebP: RIFF....WEBP
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

// ==================== 工具 ====================
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function positiveInt(value, fallback = null) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

// ==================== C 端 API ====================

/**
 * GET /api/products
 * 配件列表
 * 查询参数: category / status / keyword / brand / sort
 *          minPrice / maxPrice / vehicleId / page / limit
 */
app.get('/api/products', asyncHandler(async (req, res) => {
  const { category, status, keyword, brand, sort, minPrice, maxPrice, vehicleId } = req.query;

  // 读缓存：同一查询参数组合命中则直接返回
  const cacheKey = 'products:' + JSON.stringify(req.query);
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const result = await database.getParts({
    category,
    status,
    keyword,
    brand,
    sort,
    minPrice,
    maxPrice,
    vehicleId,
    page: positiveInt(req.query.page, null),
    // 单页最多 100 条，避免一次拉取过多数据
    limit: Math.min(positiveInt(req.query.limit, 100), 100)
  });

  const body = { success: true, ...result };
  cacheSet(cacheKey, body);
  return res.json(body);
}));

/**
 * GET /api/products/:id
 * 配件详情（含适配车型 fitModels）
 */
app.get('/api/products/:id', asyncHandler(async (req, res) => {
  const cacheKey = 'part:' + req.params.id;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const part = await database.getPartById(req.params.id);
  if (!part) {
    return res.status(404).json({ success: false, message: '配件不存在' });
  }

  const body = { success: true, data: part };
  cacheSet(cacheKey, body);
  return res.json(body);
}));

/**
 * GET /api/categories
 * 分类列表（来自数据库，5 个一级分类 + 子分类）
 */
app.get('/api/categories', asyncHandler(async (req, res) => {
  const cached = cacheGet('categories');
  if (cached) return res.json(cached);

  const cats = await database.getCategories();
  const body = { success: true, data: cats };
  cacheSet('categories', body, 600);
  return res.json(body);
}));

/**
 * GET /api/vehicles
 * 车型库（分组），用于车型选择引导页
 */
app.get('/api/vehicles', asyncHandler(async (req, res) => {
  const cached = cacheGet('vehicles');
  if (cached) return res.json(cached);

  const vehicles = await database.getAllVehicles();
  const body = { success: true, data: vehicles };
  cacheSet('vehicles', body, 600);
  return res.json(body);
}));

/**
 * GET /api/brands
 * 全部品牌（用于筛选）
 */
app.get('/api/brands', asyncHandler(async (req, res) => {
  const cached = cacheGet('brands');
  if (cached) return res.json(cached);

  const brands = await database.getAllBrands();
  const body = { success: true, data: brands };
  cacheSet('brands', body, 600);
  return res.json(body);
}));

/**
 * GET /api/health
 * 健康检查：进程存活 + 数据库可用
 */
app.get('/api/health', asyncHandler(async (req, res) => {
  const db = await database.healthCheck();
  return res.status(db.ok ? 200 : 503).json({
    success: db.ok,
    data: { status: db.ok ? 'ok' : 'error', db: db.ok ? 'ok' : 'error', uptime: process.uptime() }
  });
}));

// ==================== 询价单 ====================

// 公开接口：提交询价
app.use('/api/inquiries', inquiryRoutes.public);
// 后台接口：查询与状态流转
app.use('/api/admin/inquiries', authRequired, inquiryRoutes.admin);

// ==================== 后台登录态 ====================

/**
 * POST /api/admin/login
 * body: { username?, password }
 * 返回 accessToken / refreshToken；token 字段兼容小程序旧逻辑
 */
app.post('/api/admin/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};

  if (!password) {
    return res.status(400).json({ success: false, message: '请输入密码' });
  }

  const loginName = String(username || config.admin.username).trim();
  const user = await database.getAdminUserByUsername(loginName);
  const ok = user ? await verifyPassword(String(password), user.password_hash) : false;

  // 账号不存在与密码错误返回同一提示，避免账号枚举
  if (!ok) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  return res.json({
    success: true,
    data: {
      ...issueTokens(user),
      username: user.username,
      role: user.role
    }
  });
}));

/**
 * POST /api/admin/refresh
 * body: { refreshToken }
 */
app.post('/api/admin/refresh', loginLimiter, asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ success: false, message: '缺少 refreshToken' });
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (e) {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }

  const user = await database.getAdminUserById(payload.sub);
  if (!user || Number(user.token_version) !== Number(payload.ver)) {
    return res.status(401).json({ success: false, message: '登录状态已失效，请重新登录' });
  }

  return res.json({ success: true, data: issueTokens(user) });
}));

/**
 * POST /api/admin/logout （需鉴权）
 * 递增 token_version，使该账号已签发的令牌全部失效
 */
app.post('/api/admin/logout', authRequired, asyncHandler(async (req, res) => {
  await database.bumpAdminTokenVersion(req.admin.id);
  return res.json({ success: true, message: '已退出登录' });
}));

/**
 * GET /api/admin/me （需鉴权）
 */
app.get('/api/admin/me', authRequired, (req, res) => {
  res.json({ success: true, data: req.admin });
});

// ==================== 后台上传 ====================

/**
 * POST /api/admin/upload  （需鉴权）
 * 表单字段名：file
 * 先做 MIME 白名单，再做文件魔数校验，最后按真实类型落盘
 */
app.post('/api/admin/upload', authRequired, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: '未选择文件' });
    }

    const type = detectImageType(req.file.buffer);
    if (!type) {
      return res.status(400).json({
        success: false,
        message: '文件内容不是有效的图片，仅支持 JPG/PNG/GIF/WebP'
      });
    }

    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${type}`;
    try {
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
    } catch (e) {
      return res.status(500).json({ success: false, message: '图片保存失败' });
    }

    const url = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
    return res.json({
      success: true,
      message: '上传成功',
      data: { url, path: '/uploads/' + filename, filename }
    });
  });
});

// ==================== 后台：统计与配件管理 ====================

/**
 * GET /api/admin/stats （需鉴权）
 * 后台首页统计：总数/在售/停售/总销量
 */
app.get('/api/admin/stats', authRequired, asyncHandler(async (req, res) => {
  const cached = cacheGet('stats');
  if (cached) return res.json(cached);

  const stats = await database.getStats();
  const body = { success: true, data: stats };
  cacheSet('stats', body, CACHE_TTL);
  return res.json(body);
}));

/**
 * GET /api/admin/products （需鉴权）
 * 配件管理列表（含停售/在售筛选）
 */
app.get('/api/admin/products', authRequired, asyncHandler(async (req, res) => {
  const { category, status, keyword } = req.query;
  const result = await database.getParts({
    category,
    status,
    keyword,
    page: positiveInt(req.query.page, 1),
    limit: Math.min(positiveInt(req.query.limit, 20), 100)
  });
  return res.json({ success: true, ...result });
}));

/**
 * GET /api/admin/products/:id （需鉴权）
 * 用于编辑回填
 */
app.get('/api/admin/products/:id', authRequired, asyncHandler(async (req, res) => {
  const part = await database.getPartById(req.params.id);
  if (!part) {
    return res.status(404).json({ success: false, message: '配件不存在' });
  }
  return res.json({ success: true, data: part });
}));

/**
 * POST /api/admin/products （需鉴权）
 * 新增配件
 */
app.post('/api/admin/products', authRequired, asyncHandler(async (req, res) => {
  const part = normalizePartBody(req.body);
  if (!part.name) {
    return res.status(400).json({ success: false, message: '配件名称不能为空' });
  }

  const result = await database.addPart(part);
  purgeCache();
  return res.json({ success: true, message: '新增成功', data: { id: result.id } });
}));

/**
 * PUT /api/admin/products/:id （需鉴权）
 * 更新配件
 */
app.put('/api/admin/products/:id', authRequired, asyncHandler(async (req, res) => {
  const part = normalizePartBody(req.body);
  if (!part.name) {
    return res.status(400).json({ success: false, message: '配件名称不能为空' });
  }

  const result = await database.updatePart(req.params.id, part);
  if (!result.updated) {
    return res.status(404).json({ success: false, message: '配件不存在' });
  }

  purgeCache();
  return res.json({ success: true, message: '更新成功' });
}));

/**
 * DELETE /api/admin/products/:id （需鉴权）
 */
app.delete('/api/admin/products/:id', authRequired, asyncHandler(async (req, res) => {
  const result = await database.deletePart(req.params.id);
  if (!result.deleted) {
    return res.status(404).json({ success: false, message: '配件不存在' });
  }

  purgeCache();
  return res.json({ success: true, message: '删除成功' });
}));

/**
 * PATCH /api/admin/products/:id/status （需鉴权）
 * body: { status: 'on_sale' | 'off_shelf' }
 */
app.patch('/api/admin/products/:id/status', authRequired, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['on_sale', 'off_shelf'].includes(status)) {
    return res.status(400).json({ success: false, message: 'status 参数无效' });
  }

  const result = await database.togglePartStatus(req.params.id, status);
  if (!result.updated) {
    return res.status(404).json({ success: false, message: '配件不存在' });
  }

  purgeCache();
  return res.json({ success: true, message: '状态已更新' });
}));

/**
 * 将前端提交的表单标准化为数据库字段（含 JSON 字段解析）
 */
function normalizePartBody(body) {
  const parseArr = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return String(v).split(',').map((s) => s.trim()).filter(Boolean);
    }
  };

  const parseObj = (v) => {
    if (!v) return {};
    if (typeof v === 'object' && !Array.isArray(v)) return v;
    if (Array.isArray(v)) {
      const obj = {};
      v.forEach((item) => {
        if (item && item.key) obj[item.key] = item.value !== undefined ? item.value : '';
      });
      return obj;
    }
    try {
      return JSON.parse(v) || {};
    } catch (e) {
      return {};
    }
  };

  return {
    name: String(body.name || '').trim(),
    category: body.category || 'maintenance',
    main_image: body.main_image || (body.images && body.images[0]) || '',
    images: parseArr(body.images || body.main_image),
    price: parseFloat(body.price) || 0,
    original_price: parseFloat(body.original_price) || 0,
    stock: parseInt(body.stock, 10) || 0,
    status: body.status === 'off_shelf' ? 'off_shelf' : 'on_sale',
    oem_code: body.oem_code || '',
    brand: body.brand || '',
    specs: parseObj(body.specs),
    fitModels: parseArr(body.fitModels),
    description: body.description || ''
  };
}

// ==================== 404 / 错误处理 ====================

app.use((req, res) => {
  res.status(404).json({ success: false, message: '请求的资源不存在' });
});

app.use((err, req, res, next) => {
  // 详细错误只进服务端日志，响应体不暴露堆栈、SQL、文件路径
  console.error('服务器错误:', err);

  if (res.headersSent) return next(err);

  // JSON 解析失败等客户端错误
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: '请求体格式错误' });
  }
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ success: false, message: err.message || '请求失败' });
  }

  return res.status(500).json({ success: false, message: '服务器内部错误' });
});

// ==================== 启动 ====================

/**
 * 初始化管理员账号：
 *  - 首次启动时按环境变量创建 bcrypt 账号
 *  - 开发环境配置了 ADMIN_PASSWORD 时，以环境变量为准同步密码哈希
 */
async function ensureAdminAccount() {
  const { username, password, passwordHash } = config.admin;
  const hash = passwordHash || await hashPassword(password);

  const existing = await database.getAdminUserByUsername(username);
  if (!existing) {
    await database.createAdminUser({ username, passwordHash: hash, role: 'admin' });
    console.log(`管理员账号已初始化: ${username}`);
    return;
  }

  if (!passwordHash && password) {
    await database.updateAdminPasswordHash(existing.id, hash);
  }
}

async function startServer() {
  try {
    await database.initDatabase();
    await ensureAdminAccount();

    app.listen(config.port, () => {
      console.log('========================================');
      console.log('汽车配件信息平台服务已启动');
      console.log(`环境:      ${config.isProd ? 'production' : 'development'}`);
      console.log(`访问地址:  http://localhost:${config.port}`);
      console.log(`API 地址:  http://localhost:${config.port}/api`);
      console.log(`健康检查:  http://localhost:${config.port}/api/health`);
      console.log('后台密码不再输出，请通过 .env 中的 ADMIN_PASSWORD / ADMIN_PASSWORD_HASH 管理');
      console.log('========================================');
    });
  } catch (e) {
    console.error('服务器启动失败:', e);
    process.exit(1);
  }
}

startServer();

async function shutdown() {
  console.log('\n正在关闭服务器...');
  await database.closeDatabase();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
