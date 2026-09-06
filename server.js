/**
 * 汽车配件信息平台 - 后端服务主入口
 *
 * 职责：
 *  - C 端：配件列表（分类/状态/搜索/排序/分页）、配件详情（含适配车型）
 *  - 车型库：全部车型（品牌分组），支持车型选择引导
 *  - B 端（后台）：admin 密码登录（token）、配件增删改、上下架、统计、分类/品牌
 *
 * 默认后台密码：admin123
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const compression = require('compression');
const database = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== 高并发：轻量内存缓存 ====================
// 读多写少场景，用内存缓存降低数据库压力。
// - CACHE_TTL：读缓存有效期（秒）
// - 写操作(增删改/上下架)后调用 purgeCache() 立即失效，保证数据一致
const CACHE_TTL = 30; // 秒
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
// 写操作后清理所有读缓存（简单可靠）
function purgeCache() {
  cache.clear();
}

// ==================== 中间件 ====================
app.use(cors());
app.use(compression()); // gzip 压缩响应体，减小传输体积、降低带宽与网络延迟
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态资源：后台管理页（可选）与占位图无需托管，图片走 picsum
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 图片上传 ====================

// 上传目录（不存在则自动创建）
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 将 uploads/ 目录暴露为静态资源，访问地址 /uploads/xxx.jpg
// 文件名含时间戳+随机数（唯一且不可变），可放心设置长时间缓存与 immutable，
// 浏览器/CDN 命中缓存后大幅降低回源压力
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

// multer 配置：磁盘存储，时间戳 + 随机数命名，仅允许图片
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg').toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 限制 5MB
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error('仅支持 JPG/PNG/GIF/WebP 图片'), ok);
  }
});

// ==================== Admin 鉴权 ====================

// 后台管理员账号（演示用）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
// 客户端可携带的固定 token（演示用，实际生产建议 JWT + 过期）
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'part-platform-secret';
const ADMIN_TOKEN = crypto
  .createHmac('sha256', TOKEN_SECRET)
  .update('admin-session')
  .digest('hex');

/**
 * 校验管理员 token
 */
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token === ADMIN_TOKEN) {
    next();
  } else {
    res.status(401).json({ success: false, message: '未授权，请先登录' });
  }
}

// ==================== C 端 API ====================

/**
 * GET /api/products
 * 配件列表
 * 查询参数: category / status / keyword / brand / sort(price_asc|price_desc|sales) / page / limit
 */
app.get('/api/products', async (req, res) => {
  try {
    const { category, status, keyword, brand, sort, page, limit } = req.query;
    // 读缓存：同一查询参数组合命中则直接返回，避免重复查库
    const cacheKey = 'products:' + JSON.stringify(req.query);
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const result = await database.getParts({
      category, status, keyword, brand, sort,
      page: page ? parseInt(page) : null,
      limit: limit ? parseInt(limit) : null
    });
    const body = { success: true, ...result };
    cacheSet(cacheKey, body);
    res.json(body);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /api/products/:id
 * 配件详情（含适配车型 fitModels）
 */
app.get('/api/products/:id', async (req, res) => {
  try {
    const cacheKey = 'part:' + req.params.id;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const part = await database.getPartById(req.params.id);
    if (!part) return res.status(404).json({ success: false, message: '配件不存在' });
    const body = { success: true, data: part };
    cacheSet(cacheKey, body);
    res.json(body);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /api/categories
 * 分类列表（5 个一级分类 + 子分类）
 */
app.get('/api/categories', async (req, res) => {
  const cached = cacheGet('categories');
  if (cached) return res.json(cached);
  const cats = await database.getCategories();
  const body = { success: true, data: cats };
  cacheSet('categories', body, 600); // 分类几乎不变，缓存 10 分钟
  res.json(body);
});

/**
 * GET /api/vehicles
 * 车型库（分组），用于车型选择引导页
 */
app.get('/api/vehicles', async (req, res) => {
  const cached = cacheGet('vehicles');
  if (cached) return res.json(cached);
  const vehicles = await database.getAllVehicles();
  const body = { success: true, data: vehicles };
  cacheSet('vehicles', body, 600);
  res.json(body);
});

/**
 * GET /api/brands
 * 全部品牌（用于筛选）
 */
app.get('/api/brands', async (req, res) => {
  const cached = cacheGet('brands');
  if (cached) return res.json(cached);
  const brands = await database.getAllBrands();
  const body = { success: true, data: brands };
  cacheSet('brands', body, 600);
  res.json(body);
});

// ==================== B 端（后台）API ====================

/**
 * POST /api/admin/login
 * 密码登录，返回 token
 */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, data: { token: ADMIN_TOKEN, username: 'admin' } });
  } else {
    res.status(401).json({ success: false, message: '密码错误' });
  }
});

/**
 * POST /api/admin/upload  （需鉴权）
 * 上传图片，返回可直接访问的完整 URL
 * 表单字段名：file
 */
app.post('/api/admin/upload', authRequired, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: '未选择文件' });
    }
    const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({
      success: true,
      message: '上传成功',
      data: { url, path: '/uploads/' + req.file.filename, filename: req.file.filename }
    });
  });
});

/**
 * GET /api/admin/stats  （需鉴权）
 * 后台首页统计：总数/在售/停售/总销量
 */
app.get('/api/admin/stats', authRequired, async (req, res) => {
  const cached = cacheGet('stats');
  if (cached) return res.json(cached);
  const stats = await database.getStats();
  const body = { success: true, data: stats };
  cacheSet('stats', body, CACHE_TTL);
  res.json(body);
});

/**
 * GET /api/admin/products  （需鉴权）
 * 配件管理列表（含停售/在售筛选）
 */
app.get('/api/admin/products', authRequired, async (req, res) => {
  try {
    const { category, status, keyword, page, limit } = req.query;
    const result = await database.getParts({
      category, status, keyword,
      page: page ? parseInt(page) : null,
      limit: limit ? parseInt(limit) : 20
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /api/admin/products/:id  （需鉴权）
 * 用于编辑回填
 */
app.get('/api/admin/products/:id', authRequired, async (req, res) => {
  const part = await database.getPartById(req.params.id);
  if (!part) return res.status(404).json({ success: false, message: '配件不存在' });
  res.json({ success: true, data: part });
});

/**
 * POST /api/admin/products  （需鉴权）
 * 新增配件
 */
app.post('/api/admin/products', authRequired, async (req, res) => {
  try {
    const p = _normalizeFromBody(req.body);
    const result = await database.addPart(p);
    purgeCache(); // 数据变更，清空读缓存
    res.json({ success: true, message: '新增成功', data: { id: result.id } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * PUT /api/admin/products/:id  （需鉴权）
 * 更新配件
 */
app.put('/api/admin/products/:id', authRequired, async (req, res) => {
  try {
    const p = _normalizeFromBody(req.body);
    const result = await database.updatePart(req.params.id, p);
    if (!result.updated) return res.status(404).json({ success: false, message: '配件不存在' });
    purgeCache(); // 数据变更，清空读缓存
    res.json({ success: true, message: '更新成功' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * DELETE /api/admin/products/:id  （需鉴权）
 * 删除配件
 */
app.delete('/api/admin/products/:id', authRequired, async (req, res) => {
  const result = await database.deletePart(req.params.id);
  if (!result.deleted) return res.status(404).json({ success: false, message: '配件不存在' });
  purgeCache(); // 数据变更，清空读缓存
  res.json({ success: true, message: '删除成功' });
});

/**
 * PATCH /api/admin/products/:id/status  （需鉴权）
 * 上下架切换  body: { status: 'on_sale' | 'off_shelf' }
 */
app.patch('/api/admin/products/:id/status', authRequired, async (req, res) => {
  const { status } = req.body || {};
  if (!['on_sale', 'off_shelf'].includes(status)) {
    return res.status(400).json({ success: false, message: 'status 参数无效' });
  }
  const result = await database.togglePartStatus(req.params.id, status);
  if (!result.updated) return res.status(404).json({ success: false, message: '配件不存在' });
  purgeCache(); // 状态变更，清空读缓存
  res.json({ success: true, message: '状态已更新' });
});

/**
 * 将前端提交的表单标准化为数据库字段（含 JSON 字段解析）
 */
function _normalizeFromBody(body) {
  const parseArr = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; }
    catch (e) { return String(v).split(',').map(s => s.trim()).filter(Boolean); }
  };
  const parseObj = (v) => {
    if (!v) return {};
    if (typeof v === 'object' && !Array.isArray(v)) return v;
    if (Array.isArray(v)) { // [ {key,value}, ... ]
      const obj = {};
      v.forEach(i => { if (i && i.key) obj[i.key] = i.value !== undefined ? i.value : ''; });
      return obj;
    }
    try { const o = JSON.parse(v); return o || {}; } catch (e) { return {}; }
  };
  return {
    name: body.name || '',
    category: body.category || 'maintenance',
    main_image: body.main_image || (body.images && body.images[0]) || '',
    images: parseArr(body.images || body.main_image),
    price: parseFloat(body.price) || 0,
    original_price: parseFloat(body.original_price) || 0,
    stock: parseInt(body.stock) || 0,
    status: body.status || 'on_sale',
    oem_code: body.oem_code || '',
    brand: body.brand || '',
    specs: parseObj(body.specs),
    fitModels: parseArr(body.fitModels),
    description: body.description || ''
  };
}

// ==================== 404 / 错误处理 ====================
app.use((req, res) => res.status(404).json({ success: false, message: '请求的资源不存在' }));
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, message: '服务器内部错误: ' + err.message });
});

// ==================== 启动 ====================
async function startServer() {
  try {
    await database.initDatabase();
    app.listen(PORT, () => {
      console.log('========================================');
      console.log('汽车配件信息平台服务已启动');
      console.log(`访问地址:  http://localhost:${PORT}`);
      console.log(`API 地址:  http://localhost:${PORT}/api`);
      console.log(`后台密码:  ${ADMIN_PASSWORD}`);
      console.log('========================================');
    });
  } catch (e) {
    console.error('服务器启动失败:', e);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  await database.closeDatabase();
  process.exit(0);
});