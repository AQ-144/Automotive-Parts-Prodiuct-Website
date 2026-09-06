/**
 * 汽车配件信息平台 - 数据库模块
 * 使用 SQLite 轻量级数据库（演示用）
 *
 * 表结构：
 *  - parts                 配件主表
 *  - vehicle_models        车型库（品牌-车系-年份，用于车型选择器）
 *  - product_fit_models    配件<->车型 多对多适配关系表
 *
 * 说明：specs / images 以 JSON 文本存储，读取时解析。
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'parts.db');

// 创建数据库连接
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功:', dbPath);
  }
});

// 主色 #2B99FF | 辅助 #FF7D00 | 背景 #F5F7FA | 文字 #333

/* ==================== 常量定义 ==================== */

// 一级分类
const CATEGORIES = [
  { key: 'maintenance', name: '保养件', icon: 'oil',      sub: ['机油', '机滤', '空滤', '空调滤', '火花塞', '刹车油', '防冻液', '变速箱油'] },
  { key: 'wear',        name: '易损件', icon: 'wiper',    sub: ['雨刮', '灯泡', '轮胎', '刹车片', '刹车盘', '皮带', '电瓶', '离合器片'] },
  { key: 'repair',      name: '维修件', icon: 'suspension',sub: ['减震器', '转向系统', '燃油泵', '水泵', '起动机', '发电机', '传感器'] },
  { key: 'accident',    name: '事故件', icon: 'bumper',   sub: ['保险杠', '车门', '叶子板', '大灯', '玻璃', '安全气囊', '安全带'] },
  { key: 'accessory',   name: '精品附件', icon: 'mat',    sub: ['脚垫', '座套', '贴膜', '行车记录仪', '车载充电器', '空气净化器'] }
];

/* ==================== 建表 ==================== */

/**
 * 初始化数据库表结构与演示数据
 */
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      try {
        // ===== 高并发优化：SQLite 连接参数 =====
        // WAL 模式：读操作不再阻塞写操作，显著提升读写并发
        db.run('PRAGMA journal_mode = WAL');
        // busy_timeout：避免高并发时抛 SQLITE_BUSY，让写入排队等待而非直接报错
        db.run('PRAGMA busy_timeout = 5000');
        // synchronous=NORMAL：WAL 模式下保证安全的同时减少磁盘同步次数
        db.run('PRAGMA synchronous = NORMAL');

        // 配件主表
        db.run(`CREATE TABLE IF NOT EXISTS parts (
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

        // 高频查询索引：分类、状态、OEM、名称，避免全表扫描
        db.run('CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category)');
        db.run('CREATE INDEX IF NOT EXISTS idx_parts_status ON parts(status)');
        db.run('CREATE INDEX IF NOT EXISTS idx_parts_oem ON parts(oem_code)');
        db.run('CREATE INDEX IF NOT EXISTS idx_parts_name ON parts(name)');
        db.run('CREATE INDEX IF NOT EXISTS idx_parts_created ON parts(created_at)');

        // 车型库（用于车型选择器与详情适配展示）
        db.run(`CREATE TABLE IF NOT EXISTS vehicle_models (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          brand TEXT NOT NULL,
          model TEXT NOT NULL,
          year TEXT,
          displacement TEXT
        )`);

        // 配件<->车型 多对多适配关系
        db.run(`CREATE TABLE IF NOT EXISTS product_fit_models (
          product_id TEXT NOT NULL,
          model_id INTEGER NOT NULL,
          PRIMARY KEY (product_id, model_id)
        )`);

        // 校验是否有演示数据，没有则填充
        db.get('SELECT COUNT(*) AS c FROM parts', (err, row) => {
          if (err) return reject(err);
          if (row.c === 0) {
            console.log('首次运行，填充演示数据...');
            seedData();
          }
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/* ==================== 演示数据 ==================== */

// 图片占位：picsum.photos 生成稳定占位图
const img = (seed, w = 640, h = 640) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

// 车型库（15 个常见车型）
const LEGACY_VEHICLES = [
  { brand: '大众', model: '朗逸', year: '2019', displacement: '1.5L' },
  { brand: '大众', model: '速腾', year: '2020', displacement: '1.4T' },
  { brand: '丰田', model: '卡罗拉', year: '2021', displacement: '1.2T' },
  { brand: '丰田', model: '凯美瑞', year: '2020', displacement: '2.0L' },
  { brand: '本田', model: '思域', year: '2021', displacement: '1.5T' },
  { brand: '本田', model: '雅阁', year: '2019', displacement: '1.5T' },
  { brand: '日产', model: '轩逸', year: '2020', displacement: '1.6L' },
  { brand: '别克', model: '英朗', year: '2019', displacement: '1.3T' },
  { brand: '福特', model: '福克斯', year: '2018', displacement: '1.5L' },
  { brand: '比亚迪', model: '秦PLUS', year: '2022', displacement: '1.5L' },
  { brand: '吉利', model: '帝豪', year: '2020', displacement: '1.5L' },
  { brand: '长安', model: 'CS75', year: '2021', displacement: '1.5T' },
  { brand: '长城哈弗', model: 'H6', year: '2019', displacement: '1.5T' },
  { brand: '奥迪', model: 'A4L', year: '2020', displacement: '2.0T' },
  { brand: '宝马', model: '3系', year: '2019', displacement: '2.0T' }
];

// 配件演示数据（覆盖 5 个分类，共 25 条）
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

/**
 * 写入演示数据：车型库 + 配件 + 多对多适配关系
 */
function seedData() {
  // 先写入车型库
  const modelIds = {};
  LEGACY_VEHICLES.forEach((v, i) => {
    const modelId = i + 1;
    modelIds[`${v.brand}-${v.model}`] = modelId;
    db.run(`INSERT INTO vehicle_models (brand, model, year, displacement) VALUES (?,?,?,?)`,
      [v.brand, v.model, v.year, v.displacement]);
  });

  // 写入配件
  const now = new Date().toISOString();
  SEED_PARTS.forEach((p, i) => {
    const id = `p${String(i + 1).padStart(3, '0')}`;
    const images = [p.name, `${p.name}-2`, `${p.name}-3`].map(s => img(s.replace(/[^\w]/g, '')));
    db.run(
      `INSERT INTO parts (id, name, category, main_image, images, price, original_price, stock, status, oem_code, brand, specs, description, sales, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, p.name, p.category, images[0], JSON.stringify(images),
        p.price, p.originalPrice, p.stock, 'on_sale', p.oem, p.brand,
        JSON.stringify(p.specs), p.desc, p.sales, now, now
      ]
    );

    // 写入多对多适配关系
    const modelIdx = FIT_MAP[p.name] || FIT_MAP['default'];
    modelIdx.forEach(mIdx => {
      db.run(`INSERT INTO product_fit_models (product_id, model_id) VALUES (?,?)`, [id, mIdx + 1]);
    });
  });

  console.log(`演示数据填充完成：${SEED_PARTS.length} 个配件，${LEGACY_VEHICLES.length} 个车型`);
}

/* ==================== 配件查询 ==================== */

/**
 * 将数据库行解析为完整配件对象（解析 JSON + 组装适配车型）
 */
function parsePart(row) {
  if (!row) return null;
  return {
    ...row,
    images: row.images ? JSON.parse(row.images) : (row.main_image ? [row.main_image] : []),
    specs: row.specs ? JSON.parse(row.specs) : {},
    fitModels: row.fit_models ? JSON.parse(row.fit_models) : []
  };
}

/**
 * 获取配件列表（支持分类/状态筛选 + 关键词搜索 + 排序 + 分页）
 * 查询参数:
 *   category - 一级分类 key
 *   status   - on_sale / off_shelf
 *   keyword  - 配件名 / OEM编号 模糊搜索
 *   brand    - 品牌筛选
 *   sort     - default / price_asc / price_desc / sales
 *   page / limit
 */
function getParts({ category, status, keyword, brand, sort, page, limit } = {}) {
  return new Promise((resolve, reject) => {
    let where = [];
    let params = [];

    if (category) { where.push('p.category = ?'); params.push(category); }
    if (status) { where.push('p.status = ?'); params.push(status); }
    if (brand) { where.push('p.brand = ?'); params.push(brand); }
    if (keyword && keyword.trim()) {
      where.push('(p.name LIKE ? OR p.oem_code LIKE ?)');
      const k = `%${keyword.trim()}%`;
      params.push(k, k);
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

    db.get(`SELECT COUNT(*) AS cn ${base} ${whereSql}`, params, (err, countRow) => {
      if (err) { console.error('COUNT SQL:', `SELECT COUNT(*) AS cn ${base} ${whereSql}`, params); return reject(err); }
      const total = countRow.cn;

      let sql = `SELECT p.*, COALESCE(fm.fit_models, '[]') AS fit_models ${base} ${whereSql} ${orderBy}`;
      if (page && limit) {
        const offset = (page - 1) * limit;
        sql += ` LIMIT ? OFFSET ?`;
        params = params.concat([limit, offset]);
      }

      db.all(sql, params, (err2, rows) => {
        if (err2) { console.error('LIST SQL:', sql, params); return reject(err2); }
        resolve({
          data: rows.map(parsePart),
          total,
          page: page ? parseInt(page) : 1,
          limit: limit ? parseInt(limit) : total,
          totalPages: limit ? Math.ceil(total / limit) : 1
        });
      });
    });
  });
}

/**
 * 根据 ID 获取配件详情（含适配车型）
 */
function getPartById(id) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT p.*, COALESCE(fm.fit_models, '[]') AS fit_models
      FROM parts p
      LEFT JOIN (
        SELECT product_id, json_group_array(json_object('id', model_id, 'brand', brand, 'model', model, 'year', year, 'displacement', displacement)) AS fit_models
        FROM product_fit_models f JOIN vehicle_models v ON v.id = f.model_id
        GROUP BY product_id
      ) fm ON fm.product_id = p.id
      WHERE p.id = ?`;
    db.get(sql, [id], (err, row) => {
      if (err) return reject(err);
      resolve(parsePart(row));
    });
  });
}

/**
 * 新增配件
 */
function addPart(part) {
  return new Promise((resolve, reject) => {
    const id = `p${Date.now()}`;
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO parts (id, name, category, main_image, images, price, original_price, stock, status, oem_code, brand, specs, description, sales, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, part.name, part.category, part.main_image || '', part.images ? JSON.stringify(part.images) : '[]',
        part.price || 0, part.original_price || 0, part.stock || 0, part.status || 'on_sale',
        part.oem_code || '', part.brand || '', part.specs ? JSON.stringify(part.specs) : '{}',
        part.description || '', part.sales || 0, now, now
      ],
      (err) => {
        if (err) return reject(err);
        // 写入适配车型关系
        _setFitModels(id, part.fitModels || []);
        resolve({ id });
      }
    );
  });
}

/**
 * 更新配件
 */
function updatePart(id, part) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE parts SET name=?, category=?, main_image=?, images=?, price=?, original_price=?, stock=?, status=?, oem_code=?, brand=?, specs=?, description=?, updated_at=?
       WHERE id=?`,
      [
        part.name, part.category, part.main_image || '', part.images ? JSON.stringify(part.images) : '[]',
        part.price || 0, part.original_price || 0, part.stock || 0, part.status || 'on_sale',
        part.oem_code || '', part.brand || '', part.specs ? JSON.stringify(part.specs) : '{}',
        part.description || '', now, id
      ],
      function(err) {
        if (err) return reject(err);
        if (Array.isArray(part.fitModels)) {
          _replaceFitModels(id, part.fitModels);
        }
        resolve({ updated: this.changes > 0 });
      }
    );
  });
}

/**
 * 新增配件时清理并写适配关系
 */
function _setFitModels(productId, modelIds) {
  db.run('DELETE FROM product_fit_models WHERE product_id = ?', [productId]);
  modelIds.forEach(mid => {
    db.run('INSERT OR IGNORE INTO product_fit_models (product_id, model_id) VALUES (?,?)', [productId, mid]);
  });
}

/**
 * 更新配件时替换适配关系
 */
function _replaceFitModels(productId, modelIds) {
  db.serialize(() => {
    db.run('DELETE FROM product_fit_models WHERE product_id = ?', [productId]);
    modelIds.forEach(mid => {
      db.run('INSERT OR IGNORE INTO product_fit_models (product_id, model_id) VALUES (?,?)', [productId, mid]);
    });
  });
}

/**
 * 删除配件（级联删除适配关系）
 */
function deletePart(id) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM product_fit_models WHERE product_id = ?', [id]);
      db.run('DELETE FROM parts WHERE id = ?', [id], function(err) {
        if (err) return reject(err);
        resolve({ deleted: this.changes > 0 });
      });
    });
  });
}

/**
 * 上下架切换
 */
function togglePartStatus(id, status) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE parts SET status = ?, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), id], function(err) {
      if (err) return reject(err);
      resolve({ updated: this.changes > 0 });
    });
  });
}

/* ==================== 车型查询 ==================== */

/**
 * 所有车型（去重品牌 + 车系），用于车型选择引导页
 */
function getAllVehicles() {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, brand, model, year, displacement FROM vehicle_models ORDER BY brand, id', (err, rows) => {
      if (err) return reject(err);
      // 分组：按品牌
      const byBrand = {};
      rows.forEach(r => {
        if (!byBrand[r.brand]) byBrand[r.brand] = [];
        byBrand[r.brand].push({ id: r.id, model: r.model, year: r.year, displacement: r.displacement });
      });
      resolve({ all: rows, grouped: Object.keys(byBrand).map(b => ({ brand: b, models: byBrand[b] })) });
    });
  });
}

/**
 * 全部品牌列表（用于筛选）
 */
function getAllBrands() {
  return new Promise((resolve, reject) => {
    db.all('SELECT DISTINCT brand FROM parts WHERE brand != "" ORDER BY brand', (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.brand));
    });
  });
}

/* ==================== 统计 ==================== */
function getStats() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT
        COUNT(*) total,
        SUM(CASE WHEN status='on_sale' THEN 1 ELSE 0 END) onSale,
        SUM(CASE WHEN status='off_shelf' THEN 1 ELSE 0 END) offShelf,
        SUM(sales) totalSales,
        MIN(price) minPrice, MAX(price) maxPrice
      FROM parts`, (err, row) => {
      if (err) reject(err);
      else resolve({ total: row.total||0, onSale: row.onSale||0, offShelf: row.offShelf||0, totalSales: row.totalSales||0 });
    });
  });
}

/* ==================== 分类 ==================== */
function getCategories() {
  return Promise.resolve(CATEGORIES);
}

/* ==================== 导出 ==================== */
module.exports = {
  CATEGORIES,
  initDatabase,
  getParts,
  getPartById,
  addPart,
  updatePart,
  deletePart,
  togglePartStatus,
  getAllVehicles,
  getAllBrands,
  getStats,
  getCategories,
  closeDatabase: (() => {
    const close = (cb) => { if (db) db.close(cb); };
    return () => new Promise((resolve) => close(resolve));
  })()
};