/**
 * 汽车配件信息平台 - 数据库模块
 *
 * 表结构：
 *  - parts                 配件主表
 *  - categories            一级分类（数据入库，不再硬编码在代码逻辑中）
 *  - sub_categories        二级分类
 *  - vehicle_models        车型库（品牌-车系-年份，用于车型选择器）
 *  - product_fit_models    配件<->车型 多对多适配关系表
 *  - admin_users           后台管理员（bcrypt 密码 + token_version）
 *  - inquiries             询价单（核心业务闭环）
 *
 * 说明：specs / images / items 以 JSON 文本存储，读取时解析。
 */

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const config = require('./config');

const CATEGORY_SEED = require('./data/categories.json');
const VEHICLE_SEED = require('./data/vehicles.json');

// 数据库文件路径由配置中心统一提供
const dbPath = config.dbPath;

// 创建数据库连接
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功:', dbPath);
  }
});

/* ==================== Promise 化数据库操作 ==================== */

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onDone(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/* ==================== 常量与演示数据 ==================== */

// 配件演示数据（覆盖 5 个分类，共 29 条）
const SEED_PARTS = [
  // ===== 保养件 maintenance =====
  { name: '全合成机油 5W-30 4L', category: 'maintenance', sub: '机油', price: 158, originalPrice: 198, stock: 120, oem: 'SN5W30', brand: '嘉实多', sales: 342,
    specs: { 'SAE标号': '5W-30', 'API等级': 'SN PLUS', '容量': '4L', '适用': '汽油发动机' },
    desc: '全合成机油，低温启动顺畅，高温油膜稳定，有效保护发动机，延长换油周期至10000公里。' },
  { name: '机油滤清器 OEM款', category: 'maintenance', sub: '机滤', price: 25, originalPrice: 35, stock: 200, oem: 'OF-689', brand: '马勒', sales: 500,
    specs: { '过滤精度': '20μm', '螺纹': '3/4-16', '适用': '多数主流车型' },
    desc: '高密度滤纸，过滤效率高，附带密封圈，安装便捷，推荐与机油同步更换。' },
  { name: '空调滤芯（活性炭）', category: 'maintenance', sub: '空调滤', price: 45, originalPrice: 60, stock: 80, oem: 'CA-1122', brand: '曼牌', sales: 210,
    specs: { '类型': '活性炭', '尺寸': '190×190×30mm', '换装周期': '6个月' },
    desc: '含活性炭层，可有效吸附车内甲醛与异味，阻挡花粉与PM2.5。' },
  { name: '空气滤芯 高流量', category: 'maintenance', sub: '空滤', price: 55, originalPrice: 70, stock: 66, oem: 'A-2388', brand: 'KN', sales: 150,
    specs: { '类型': '高流量干式', '尺寸': '230×200×45mm', '适用': '涡轮车型更佳' },
    desc: '高流量设计提升进气效率，含尘量高时建议早更换，保护节气门。' },
  { name: '双铱金火花塞 4支装', category: 'maintenance', sub: '火花塞', price: 168, originalPrice: 220, stock: 45, oem: 'SP-976', brand: 'NGK', sales: 98,
    specs: { '材质': '双铱金', '间隙': '0.8mm', '热值': '6', '数量': '4支' },
    desc: '双铱金电极寿命更长，点火更稳定，动力响应快，油耗更低。' },
  { name: '刹车油 DOT4 1L', category: 'maintenance', sub: '刹车油', price: 48, originalPrice: 60, stock: 150, oem: 'BF-DOT4', brand: '博世', sales: 88,
    specs: { '规格': 'DOT4', '容量': '1L', '沸点': '≥260°C', '换装周期': '2年' },
    desc: '高沸点配方，抗气阻性能优异，保障雨天与长下坡制动安全。' },
  { name: '防冻液 -35°C 4L', category: 'maintenance', sub: '防冻液', price: 58, originalPrice: 72, stock: 90, oem: 'CF-35', brand: '壳牌', sales: 132,
    specs: { '冰点': '-35°C', '沸点': '108°C', '容量': '4L', '适用': '四季通用' },
    desc: '防冻、防沸、防腐蚀三合一，适合国内多数气候区域。' },
  { name: '变速箱油 ATF 4L', category: 'maintenance', sub: '变速箱油', price: 168, originalPrice: 210, stock: 30, oem: 'ATF-VI', brand: '爱信', sales: 45,
    specs: { '类型': 'ATF VI', '容量': '4L', '适用': '6-8速自动变速箱' },
    desc: '专为自动变速箱设计，换挡平顺，抗剪切性能稳定。' },

  // ===== 易损件 wear =====
  { name: '无骨雨刮 24+18寸', category: 'wear', sub: '雨刮', price: 39, originalPrice: 55, stock: 300, oem: 'WW-2418', brand: '博世', sales: 620,
    specs: { '尺寸': '24+18寸', '类型': '无骨', '胶条材质': '天然橡胶' },
    desc: '无骨一体式设计，刮拭均匀无死角，静音耐用。' },
  { name: 'LED灯泡 H7 8000K', category: 'wear', sub: '灯泡', price: 89, originalPrice: 120, stock: 120, oem: 'LED-H7', brand: '欧司朗', sales: 250,
    specs: { '型号': 'H7', '色温': '8000K', '功率': '25W', '亮度': '6000流明' },
    desc: '即插即用，超亮白光，散热风扇设计，寿命长达30000小时。' },
  { name: '运动型轮胎 205/55 R16', category: 'wear', sub: '轮胎', price: 399, originalPrice: 480, stock: 40, oem: 'T-2055516', brand: '米其林', sales: 75,
    specs: { '规格': '205/55 R16', '速度级别': 'V', '载重指数': '91', '花纹': 'Pilot Sport' },
    desc: '干湿地抓地力出色，静音舒适，适合家用轿车。' },
  { name: '陶瓷刹车片 前轮', category: 'wear', sub: '刹车片', price: 129, originalPrice: 165, stock: 88, oem: 'BP-CER', brand: '奔德士', sales: 176,
    specs: { '材质': '陶瓷', '位置': '前轮', '噪音': '低', '适用': '碟刹' },
    desc: '低尘低噪，制动线性，粉尘少，轮毂更干净。' },
  { name: '通风刹车盘 前轮', category: 'wear', sub: '刹车盘', price: 189, originalPrice: 240, stock: 35, oem: 'BD-VENT', brand: 'TRW', sales: 60,
    specs: { '类型': '通风盘', '位置': '前轮', '直径': '300mm', '适用': '碟刹' },
    desc: '通风结构散热快，高温制动稳定，不易变形。' },
  { name: '正时皮带套装', category: 'wear', sub: '皮带', price: 210, originalPrice: 260, stock: 28, oem: 'TB-SET', brand: '盖茨', sales: 42,
    specs: { '内容': '皮带+张紧轮+惰轮', '换装周期': '6万公里', '适用': '主流B级车' },
    desc: '原厂配套品质，静音耐用，配套张紧轮同步更换更安心。' },
  { name: '免维护蓄电池 60AH', category: 'wear', sub: '电瓶', price: 299, originalPrice: 380, stock: 25, oem: 'BAT-60', brand: '瓦尔塔', sales: 90,
    specs: { '容量': '60Ah', 'CCA': '580A', '接线': '正极右', '适用': '多数家用车' },
    desc: '免维护设计，低温启动能力强，质保24个月。' },

  // ===== 维修件 repair =====
  { name: '后减震器 总成', category: 'repair', sub: '减震器', price: 268, originalPrice: 320, stock: 20, oem: 'S-REAR16', brand: 'KYB', sales: 33,
    specs: { '位置': '后轮', '类型': '油压', '行程': '180mm', '适用': '紧凑型轿车' },
    desc: '油压减震，阻尼适中，提升行车稳定性与滤震质感。' },
  { name: '转向助力油泵', category: 'repair', sub: '转向系统', price: 358, originalPrice: 420, stock: 12, oem: 'PS-PUMP', brand: '采埃孚', sales: 18,
    specs: { '类型': '液压助力', '额定压力': '80bar', '适用': '多数液压助力车型' },
    desc: '匹配液压助力转向系统，输出稳定，噪声低。' },
  { name: '燃油泵总成', category: 'repair', sub: '燃油泵', price: 208, originalPrice: 250, stock: 22, oem: 'FP-TOTAL', brand: '博世', sales: 26,
    specs: { '流量': '110L/h', '电压': '12V', '适用': '多点电喷车型' },
    desc: '供给压力稳定，含滤网一体式总成，安装便利。' },
  { name: '电子水泵', category: 'repair', sub: '水泵', price: 238, originalPrice: 290, stock: 18, oem: 'WP-ELE', brand: '盖茨', sales: 15,
    specs: { '驱动': '电子', '电压': '12V', '适用': '涡轮增压车型' },
    desc: '电子控制精确散热，降低冷启动磨损，耐用性更佳。' },
  { name: '起动机 1.2kW', category: 'repair', sub: '起动机', price: 328, originalPrice: 390, stock: 14, oem: 'ST-1.2K', brand: '法雷奥', sales: 20,
    specs: { '功率': '1.2kW', '齿数': '9', '电压': '12V', '适用': '1.5L-2.0L' },
    desc: '启动迅速有力，不易热衰减，兼容主流发动机。' },
  { name: '氧传感器 前氧', category: 'repair', sub: '传感器', price: 118, originalPrice: 150, stock: 30, oem: 'O2-FRONT', brand: 'NGK', sales: 37,
    specs: { '类型': '宽域氧传感器', '螺纹': 'M18*1.5', '线束': '4线', '位置': '前氧' },
    desc: '实时监测空燃比，信号精准，降低油耗与排放。' },

  // ===== 事故件 accident =====
  { name: '前保险杠 总成', category: 'accident', sub: '保险杠', price: 428, originalPrice: 520, stock: 8, oem: 'BH-FRONT', brand: '配套件', sales: 22,
    specs: { '材质': 'PP+金属骨架', '位置': '前杠', '含': '下唇+雾灯框', '适用': '多数B级车' },
    desc: 'PP原厂材质，含安装卡扣，碰撞吸能结构，喷涂后与原厂一致。' },
  { name: '左前车门总成', category: 'accident', sub: '车门', price: 1180, originalPrice: 1380, stock: 4, oem: 'DR-LF', brand: '配套件', sales: 6,
    specs: { '位置': '左前门', '材质': '镀锌钢', '含': '内衬+玻璃槽', '适用': '紧凑型轿车' },
    desc: '原厂工艺，含玻璃导槽与内衬，安装孔位精准。' },
  { name: '前叶子板 左', category: 'accident', sub: '叶子板', price: 268, originalPrice: 320, stock: 15, oem: 'FD-L', brand: '配套件', sales: 14,
    specs: { '位置': '左侧', '材质': '镀锌钢板', '适用': '主流轿车' },
    desc: '钣金精度高，线条流畅，防锈电泳处理。' },
  { name: 'LED大灯总成 左', category: 'accident', sub: '大灯', price: 688, originalPrice: 820, stock: 10, oem: 'HL-LED-L', brand: '欧司朗', sales: 28,
    specs: { '光源': 'LED', '位置': '左侧', '色温': '6000K', '含': '驱动模块' },
    desc: '高亮LED近远光一体，含安定器，支持CAN总线。' },

  // ===== 精品附件 accessory =====
  { name: '全包围脚垫（定制）', category: 'accessory', sub: '脚垫', price: 128, originalPrice: 168, stock: 200, oem: 'AC-MAT', brand: '3D定制', sales: 380,
    specs: { '材质': 'XPE复合', '清洁': '易拆洗', '固定': '卡扣', '适配': '按车型定制' },
    desc: '全包裹防尘防水，预留气帘与踏板位，专车专用。' },
  { name: '四季通用座套', category: 'accessory', sub: '座套', price: 168, originalPrice: 210, stock: 150, oem: 'AC-COV', brand: '恒信', sales: 260,
    specs: { '材质': '冰丝+麂皮绒', '适配': '前排+后排', '透气': '是' },
    desc: '四季通用，透气舒适，防滑耐磨，安装快捷。' },
  { name: '高清行车记录仪', category: 'accessory', sub: '行车记录仪', price: 199, originalPrice: 259, stock: 80, oem: 'AC-DVR', brand: '360', sales: 90,
    specs: { '分辨率': '1080P', '屏幕': '2.7寸', '夜视': '是', '存储': '64G' },
    desc: '前后双录可选，超广角，停车监控，夜间清晰。' },
  { name: '车载空气净化器', category: 'accessory', sub: '空气净化器', price: 158, originalPrice: 199, stock: 70, oem: 'AC-AIR', brand: '飞利浦', sales: 65,
    specs: { '过滤': 'HEPA+活性炭', '风量': '12m³/h', '供电': 'USB', '噪音': '≤45dB' },
    desc: '高效去除PM2.5与异味，静音运行，USB供电即插即用。' }
];

// 演示车型适配关系（product_key -> 匹配的车型库索引）
const FIT_MAP = {
  '机油滤清器 OEM款': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  '全合成机油 5W-30 4L': [0, 1, 2, 3, 4, 5, 9, 13],
  '无骨雨刮 24+18寸': [0, 2, 3, 4, 5, 9, 13],
  '双铱金火花塞 4支装': [0, 1, 2, 4, 7, 9, 13],
  '陶瓷刹车片 前轮': [0, 1, 2, 3, 4, 8, 13],
  'LED灯泡 H7 8000K': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  // 其余配件默认适配 5 个车型
  'default': [0, 2, 3, 5, 13]
};

/* ==================== 建表与初始化 ==================== */

async function initDatabase() {
  // ===== 高并发优化：SQLite 连接参数 =====
  await run('PRAGMA journal_mode = WAL');
  await run('PRAGMA busy_timeout = 5000');
  await run('PRAGMA synchronous = NORMAL');

  // 配件主表
  await run(`CREATE TABLE IF NOT EXISTS parts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    main_image TEXT,
    images TEXT,
    price REAL DEFAULT 0,
    original_price REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    status TEXT DEFAULT 'on_sale',
    oem_code TEXT,
    brand TEXT,
    specs TEXT,
    description TEXT,
    sales INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  )`);

  // 高频查询索引：分类、状态、OEM、名称、品牌，避免全表扫描
  await run('CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category)');
  await run('CREATE INDEX IF NOT EXISTS idx_parts_status ON parts(status)');
  await run('CREATE INDEX IF NOT EXISTS idx_parts_oem ON parts(oem_code)');
  await run('CREATE INDEX IF NOT EXISTS idx_parts_name ON parts(name)');
  await run('CREATE INDEX IF NOT EXISTS idx_parts_brand ON parts(brand)');
  await run('CREATE INDEX IF NOT EXISTS idx_parts_created ON parts(created_at)');

  // 车型库（用于车型选择器与详情适配展示）
  await run(`CREATE TABLE IF NOT EXISTS vehicle_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year TEXT,
    displacement TEXT
  )`);

  // 配件<->车型 多对多适配关系
  await run(`CREATE TABLE IF NOT EXISTS product_fit_models (
    product_id TEXT NOT NULL,
    model_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, model_id)
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_fit_models_model ON product_fit_models(model_id)');

  // 分类入库（对应 OP-P1-01：不再把分类硬编码在查询逻辑中）
  await run(`CREATE TABLE IF NOT EXISTS categories (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    sort INTEGER DEFAULT 0
  )`);
  await run(`CREATE TABLE IF NOT EXISTS sub_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_key TEXT NOT NULL,
    name TEXT NOT NULL,
    sort INTEGER DEFAULT 0,
    UNIQUE(category_key, name)
  )`);

  // 后台管理员（bcrypt 密码 + 令牌版本号，用于吊销）
  await run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    token_version INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
  )`);

  // 询价单（对应 OP-P0-03）
  await run(`CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY,
    inquiry_no TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    wechat TEXT,
    vehicle_info TEXT,
    remark TEXT,
    items TEXT NOT NULL,
    item_count INTEGER DEFAULT 0,
    total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    source TEXT DEFAULT 'h5',
    idempotency_key TEXT UNIQUE,
    created_at TEXT,
    updated_at TEXT
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status)');
  await run('CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at)');

  // 分类与车型种子数据
  await seedCategories();
  const vehicleCount = await get('SELECT COUNT(*) AS c FROM vehicle_models');
  if (!vehicleCount || vehicleCount.c === 0) {
    await seedVehicles();
  }

  // 配件种子数据仅在空库时写入
  const partCount = await get('SELECT COUNT(*) AS c FROM parts');
  if (!partCount || partCount.c === 0) {
    console.log('首次运行，填充演示数据...');
    await seedData();
  }

  // 修复历史数据中的空图片 seed（OP-P1-01）
  await repairSeedImages();

  console.log('数据库初始化完成');
}

/** 写入分类种子数据（可重复执行） */
async function seedCategories() {
  for (let ci = 0; ci < CATEGORY_SEED.length; ci++) {
    const cat = CATEGORY_SEED[ci];
    await run(
      'INSERT OR IGNORE INTO categories (key, name, icon, sort) VALUES (?,?,?,?)',
      [cat.key, cat.name, cat.icon || '', ci]
    );
    const subs = cat.sub || [];
    for (let si = 0; si < subs.length; si++) {
      await run(
        'INSERT OR IGNORE INTO sub_categories (category_key, name, sort) VALUES (?,?,?)',
        [cat.key, subs[si], si]
      );
    }
  }
}

/** 写入车型种子数据 */
async function seedVehicles() {
  for (const v of VEHICLE_SEED) {
    await run(
      'INSERT INTO vehicle_models (brand, model, year, displacement) VALUES (?,?,?,?)',
      [v.brand, v.model, v.year, v.displacement]
    );
  }
  console.log(`车型库填充完成：${VEHICLE_SEED.length} 个车型`);
}

/**
 * 生成稳定的占位图地址
 * 修复报告 3.5：原先用 replace(/[^\w]/g,'') 清洗中文名会得到空 seed，
 * 导致大量商品图片重复。改为对名称做哈希，保证唯一且稳定。
 */
function seedPlaceholder(seed, w = 640, h = 640) {
  const hash = crypto.createHash('md5').update(String(seed)).digest('hex').slice(0, 10);
  return `https://picsum.photos/seed/${hash}/${w}/${h}`;
}

/** 为商品生成 3 张互不相同的占位图 */
function buildSeedImages(name) {
  return [1, 2, 3].map((n) => seedPlaceholder(`${name}-${n}`));
}

/** 写入演示数据：配件 + 多对多适配关系 */
async function seedData() {
  const now = new Date().toISOString();

  for (let i = 0; i < SEED_PARTS.length; i++) {
    const p = SEED_PARTS[i];
    const id = `p${String(i + 1).padStart(3, '0')}`;
    const images = buildSeedImages(p.name);

    await run(
      `INSERT INTO parts (id, name, category, main_image, images, price, original_price, stock, status, oem_code, brand, specs, description, sales, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, p.name, p.category, images[0], JSON.stringify(images),
        p.price, p.originalPrice, p.stock, 'on_sale', p.oem, p.brand,
        JSON.stringify(p.specs), p.desc, p.sales, now, now
      ]
    );

    const modelIdx = FIT_MAP[p.name] || FIT_MAP['default'];
    for (const mIdx of modelIdx) {
      await run(
        'INSERT OR IGNORE INTO product_fit_models (product_id, model_id) VALUES (?,?)',
        [id, mIdx + 1]
      );
    }
  }

  console.log(`演示数据填充完成：${SEED_PARTS.length} 个配件，${VEHICLE_SEED.length} 个车型`);
}

/** 修复历史数据中已经写入的空 seed 图片 */
async function repairSeedImages() {
  const rows = await all(
    `SELECT id, name FROM parts
     WHERE main_image LIKE '%picsum.photos/seed//%'
        OR images LIKE '%picsum.photos/seed//%'`
  );

  if (!rows.length) return;

  const now = new Date().toISOString();
  for (const row of rows) {
    const images = buildSeedImages(row.name);
    await run(
      'UPDATE parts SET main_image = ?, images = ?, updated_at = ? WHERE id = ?',
      [images[0], JSON.stringify(images), now, row.id]
    );
  }
  console.log(`已修复 ${rows.length} 条商品的空图片 seed`);
}

/* ==================== 通用解析 ==================== */

function safeParse(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch (e) {
    return fallback;
  }
}

/** 将数据库行解析为完整配件对象（解析 JSON + 组装适配车型） */
function parsePart(row) {
  if (!row) return null;
  return {
    ...row,
    images: safeParse(row.images, row.main_image ? [row.main_image] : []),
    specs: safeParse(row.specs, {}),
    fitModels: safeParse(row.fit_models, [])
  };
}

/* ==================== 配件查询 ==================== */

/**
 * 获取配件列表
 * 查询参数:
 *   category - 一级分类 key
 *   status   - on_sale / off_shelf
 *   keyword  - 配件名 / OEM编号 模糊搜索
 *   brand    - 品牌筛选
 *   sort     - default / price_asc / price_desc / sales
 *   minPrice / maxPrice - 价格区间
 *   vehicleId - 适配车型 ID
 *   page / limit
 */
async function getParts({
  category, status, keyword, brand, sort,
  minPrice, maxPrice, vehicleId,
  page, limit
} = {}) {
  const where = [];
  const params = [];

  if (category) { where.push('p.category = ?'); params.push(category); }
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (brand) { where.push('p.brand = ?'); params.push(brand); }
  if (keyword && keyword.trim()) {
    where.push('(p.name LIKE ? OR p.oem_code LIKE ?)');
    const k = `%${keyword.trim()}%`;
    params.push(k, k);
  }

  const min = Number(minPrice);
  const max = Number(maxPrice);
  if (minPrice !== undefined && minPrice !== '' && Number.isFinite(min)) {
    where.push('p.price >= ?');
    params.push(min);
  }
  if (maxPrice !== undefined && maxPrice !== '' && Number.isFinite(max)) {
    where.push('p.price <= ?');
    params.push(max);
  }

  if (vehicleId !== undefined && vehicleId !== '' && Number.isFinite(Number(vehicleId))) {
    where.push('EXISTS (SELECT 1 FROM product_fit_models f WHERE f.product_id = p.id AND f.model_id = ?)');
    params.push(Number(vehicleId));
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  let orderBy = 'ORDER BY p.created_at DESC';
  if (sort === 'price_asc') orderBy = 'ORDER BY p.price ASC';
  else if (sort === 'price_desc') orderBy = 'ORDER BY p.price DESC';
  else if (sort === 'sales') orderBy = 'ORDER BY p.sales DESC';

  // 关联适配车型统计
  const base = `FROM parts p
    LEFT JOIN (
      SELECT product_id, json_group_array(json_object('id', model_id, 'brand', brand, 'model', model, 'year', year, 'displacement', displacement)) AS fit_models
      FROM product_fit_models f JOIN vehicle_models v ON v.id = f.model_id
      GROUP BY product_id
    ) fm ON fm.product_id = p.id`;

  const countRow = await get(`SELECT COUNT(*) AS cn ${base} ${whereSql}`, params);
  const total = (countRow && countRow.cn) || 0;

  let sql = `SELECT p.*, COALESCE(fm.fit_models, '[]') AS fit_models ${base} ${whereSql} ${orderBy}`;
  const queryParams = params.slice();
  const pageNum = page ? parseInt(page, 10) : 1;
  const limitNum = limit ? parseInt(limit, 10) : null;

  if (pageNum && limitNum) {
    sql += ' LIMIT ? OFFSET ?';
    queryParams.push(limitNum, (pageNum - 1) * limitNum);
  }

  const rows = await all(sql, queryParams);

  return {
    data: rows.map(parsePart),
    total,
    page: pageNum,
    limit: limitNum || total,
    totalPages: limitNum ? Math.ceil(total / limitNum) : 1
  };
}

/** 根据 ID 列表批量获取配件（询价服务端计价使用） */
async function getPartsByIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return all(
    `SELECT id, name, price, oem_code, main_image, status, stock
     FROM parts WHERE id IN (${placeholders})`,
    ids
  );
}

/** 根据 ID 获取配件详情（含适配车型） */
async function getPartById(id) {
  const row = await get(
    `SELECT p.*, COALESCE(fm.fit_models, '[]') AS fit_models
     FROM parts p
     LEFT JOIN (
       SELECT product_id, json_group_array(json_object('id', model_id, 'brand', brand, 'model', model, 'year', year, 'displacement', displacement)) AS fit_models
       FROM product_fit_models f JOIN vehicle_models v ON v.id = f.model_id
       GROUP BY product_id
     ) fm ON fm.product_id = p.id
     WHERE p.id = ?`,
    [id]
  );
  return parsePart(row);
}

/* ==================== 配件写操作 ==================== */

/** 新增配件 */
async function addPart(part) {
  const id = `p${Date.now()}`;
  const now = new Date().toISOString();

  await run(
    `INSERT INTO parts (id, name, category, main_image, images, price, original_price, stock, status, oem_code, brand, specs, description, sales, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, part.name, part.category, part.main_image || '',
      part.images ? JSON.stringify(part.images) : '[]',
      part.price || 0, part.original_price || 0, part.stock || 0,
      part.status || 'on_sale', part.oem_code || '', part.brand || '',
      part.specs ? JSON.stringify(part.specs) : '{}',
      part.description || '', part.sales || 0, now, now
    ]
  );

  await replaceFitModels(id, part.fitModels || []);
  return { id };
}

/** 更新配件 */
async function updatePart(id, part) {
  const now = new Date().toISOString();
  const result = await run(
    `UPDATE parts SET name=?, category=?, main_image=?, images=?, price=?, original_price=?, stock=?, status=?, oem_code=?, brand=?, specs=?, description=?, updated_at=?
     WHERE id=?`,
    [
      part.name, part.category, part.main_image || '',
      part.images ? JSON.stringify(part.images) : '[]',
      part.price || 0, part.original_price || 0, part.stock || 0,
      part.status || 'on_sale', part.oem_code || '', part.brand || '',
      part.specs ? JSON.stringify(part.specs) : '{}',
      part.description || '', now, id
    ]
  );

  if (Array.isArray(part.fitModels)) {
    await replaceFitModels(id, part.fitModels);
  }

  return { updated: result.changes > 0 };
}

/** 替换配件适配车型关系 */
async function replaceFitModels(productId, modelIds) {
  await run('DELETE FROM product_fit_models WHERE product_id = ?', [productId]);
  for (const mid of modelIds) {
    const modelId = parseInt(mid, 10);
    if (!Number.isFinite(modelId)) continue;
    await run(
      'INSERT OR IGNORE INTO product_fit_models (product_id, model_id) VALUES (?,?)',
      [productId, modelId]
    );
  }
}

/** 删除配件（级联删除适配关系） */
async function deletePart(id) {
  await run('DELETE FROM product_fit_models WHERE product_id = ?', [id]);
  const result = await run('DELETE FROM parts WHERE id = ?', [id]);
  return { deleted: result.changes > 0 };
}

/** 上下架切换 */
async function togglePartStatus(id, status) {
  const result = await run(
    'UPDATE parts SET status = ?, updated_at = ? WHERE id = ?',
    [status, new Date().toISOString(), id]
  );
  return { updated: result.changes > 0 };
}

/* ==================== 车型与品牌 ==================== */

/** 所有车型（按品牌分组），用于车型选择引导页 */
async function getAllVehicles() {
  const rows = await all(
    'SELECT id, brand, model, year, displacement FROM vehicle_models ORDER BY brand, id'
  );

  const byBrand = {};
  rows.forEach((r) => {
    if (!byBrand[r.brand]) byBrand[r.brand] = [];
    byBrand[r.brand].push({
      id: r.id,
      model: r.model,
      year: r.year,
      displacement: r.displacement
    });
  });

  return {
    all: rows,
    grouped: Object.keys(byBrand).map((brand) => ({ brand, models: byBrand[brand] }))
  };
}

/** 全部品牌列表（用于筛选） */
async function getAllBrands() {
  const rows = await all(
    "SELECT DISTINCT brand FROM parts WHERE brand IS NOT NULL AND brand != '' ORDER BY brand"
  );
  return rows.map((r) => r.brand);
}

/* ==================== 统计 ==================== */

async function getStats() {
  const row = await get(`SELECT
      COUNT(*) total,
      SUM(CASE WHEN status='on_sale' THEN 1 ELSE 0 END) onSale,
      SUM(CASE WHEN status='off_shelf' THEN 1 ELSE 0 END) offShelf,
      SUM(sales) totalSales,
      MIN(price) minPrice, MAX(price) maxPrice
    FROM parts`);

  return {
    total: (row && row.total) || 0,
    onSale: (row && row.onSale) || 0,
    offShelf: (row && row.offShelf) || 0,
    totalSales: (row && row.totalSales) || 0
  };
}

/* ==================== 分类 ==================== */

/** 分类列表（来自数据库；空库时回退种子数据） */
async function getCategories() {
  const cats = await all(
    'SELECT key, name, icon FROM categories ORDER BY sort ASC, rowid ASC'
  );

  if (!cats.length) {
    return CATEGORY_SEED.map((c) => ({
      key: c.key,
      name: c.name,
      icon: c.icon,
      sub: [...(c.sub || [])]
    }));
  }

  const subs = await all(
    'SELECT category_key, name FROM sub_categories ORDER BY sort ASC, rowid ASC'
  );

  return cats.map((c) => ({
    ...c,
    sub: subs.filter((s) => s.category_key === c.key).map((s) => s.name)
  }));
}

/* ==================== 后台管理员 ==================== */

async function getAdminUserByUsername(username) {
  return get('SELECT * FROM admin_users WHERE username = ?', [username]);
}

async function getAdminUserById(id) {
  return get(
    'SELECT id, username, role, token_version, created_at, updated_at FROM admin_users WHERE id = ?',
    [id]
  );
}

async function createAdminUser({ username, passwordHash, role = 'admin' }) {
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO admin_users (username, password_hash, role, token_version, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
    [username, passwordHash, role, 1, now, now]
  );
  return { id: result.lastID, username, role, token_version: 1 };
}

async function updateAdminPasswordHash(id, passwordHash) {
  await run(
    'UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?',
    [passwordHash, new Date().toISOString(), id]
  );
}

/** 递增令牌版本号：使该账号所有已签发令牌立即失效 */
async function bumpAdminTokenVersion(id) {
  await run(
    'UPDATE admin_users SET token_version = token_version + 1, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
  return getAdminUserById(id);
}

/* ==================== 询价单 ==================== */

function makeInquiryNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INQ${stamp}${rand}`;
}

function parseInquiry(row) {
  if (!row) return null;
  return { ...row, items: safeParse(row.items, []) };
}

/** 创建询价单 */
async function createInquiry(data) {
  const id = `inq_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const inquiryNo = makeInquiryNo();
  const now = new Date().toISOString();

  await run(
    `INSERT INTO inquiries
     (id, inquiry_no, customer_name, phone, wechat, vehicle_info, remark, items,
      item_count, total_amount, status, source, idempotency_key, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, inquiryNo, data.customer_name, data.phone,
      data.wechat || '', data.vehicle_info || '', data.remark || '',
      JSON.stringify(data.items || []), data.item_count || 0,
      data.total_amount || 0, data.status || 'pending',
      data.source || 'h5', data.idempotency_key || null, now, now
    ]
  );

  return getInquiryById(id);
}

async function findInquiryByIdempotencyKey(key) {
  if (!key) return null;
  const row = await get('SELECT * FROM inquiries WHERE idempotency_key = ?', [key]);
  return parseInquiry(row);
}

async function getInquiryById(id) {
  const row = await get('SELECT * FROM inquiries WHERE id = ?', [id]);
  return parseInquiry(row);
}

/** 后台询价列表（状态/关键词/分页） */
async function getInquiries({ status, keyword, page = 1, limit = 20 } = {}) {
  const where = [];
  const params = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (keyword && keyword.trim()) {
    where.push('(inquiry_no LIKE ? OR phone LIKE ? OR customer_name LIKE ?)');
    const k = `%${keyword.trim()}%`;
    params.push(k, k, k);
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const countRow = await get(`SELECT COUNT(*) AS c FROM inquiries ${whereSql}`, params);
  const total = (countRow && countRow.c) || 0;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const rows = await all(
    `SELECT * FROM inquiries ${whereSql}
     ORDER BY created_at DESC, rowid DESC
     LIMIT ? OFFSET ?`,
    [...params, limitNum, (pageNum - 1) * limitNum]
  );

  return {
    data: rows.map(parseInquiry),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum)
  };
}

/** 更新询价状态 */
async function updateInquiryStatus(id, status) {
  const result = await run(
    'UPDATE inquiries SET status = ?, updated_at = ? WHERE id = ?',
    [status, new Date().toISOString(), id]
  );
  return { updated: result.changes > 0 };
}

/** 询价状态统计 */
async function getInquiryStats() {
  const row = await get(`SELECT
      COUNT(*) total,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) processing,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done,
      SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) closed
    FROM inquiries`);

  return {
    total: (row && row.total) || 0,
    pending: (row && row.pending) || 0,
    processing: (row && row.processing) || 0,
    done: (row && row.done) || 0,
    closed: (row && row.closed) || 0
  };
}

/* ==================== 健康检查 ==================== */

async function healthCheck() {
  const row = await get('SELECT 1 AS ok');
  return { ok: !!(row && row.ok === 1) };
}

/** 关闭数据库连接 */
function closeDatabase() {
  return new Promise((resolve) => {
    if (!db) return resolve();
    db.close(() => resolve());
  });
}

/* ==================== 导出 ==================== */
module.exports = {
  CATEGORIES: CATEGORY_SEED,
  initDatabase,
  getParts,
  getPartsByIds,
  getPartById,
  addPart,
  updatePart,
  deletePart,
  togglePartStatus,
  getAllVehicles,
  getAllBrands,
  getStats,
  getCategories,
  getAdminUserByUsername,
  getAdminUserById,
  createAdminUser,
  updateAdminPasswordHash,
  bumpAdminTokenVersion,
  createInquiry,
  findInquiryByIdempotencyKey,
  getInquiryById,
  getInquiries,
  updateInquiryStatus,
  getInquiryStats,
  healthCheck,
  closeDatabase
};
