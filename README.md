# 汽车配件信息平台

面向私域推广的汽车配件展示与询价平台。C 端支持分类浏览、搜索、车型筛选、商品详情与询价单；B 端提供配件管理、上下架、统计与询价单处理能力。

> 当前进度：阶段 1「后端补课」已完成（询价闭环、JWT 鉴权、安全加固、配置治理、数据修正、服务端分页筛选）。
> Web 运营后台重建与小程序 admin 页面移除将在后续阶段完成。

## 技术栈

- 小程序端：微信原生（WXML + WXSS + JS + JSON）
- 后端：Node.js 18+ + Express
- 数据库：SQLite（文件 `parts.db`，首次启动自动建表并填充演示数据）
- 安全与配置：dotenv、bcryptjs、jsonwebtoken、helmet、express-rate-limit
- 图片占位：picsum.photos（仅演示数据使用）

## 目录结构

```
project-root/
├── server.js                    # 后端入口：路由挂载、安全中间件、上传
├── config.js                    # 配置中心：环境变量读取与启动校验
├── database.js                  # 建表、种子数据、查询与写操作
├── data/
│   ├── categories.json          # 分类种子数据（入库，不再硬编码）
│   └── vehicles.json            # 车型种子数据
├── lib/tokens.js                # JWT 签发/校验、bcrypt 密码工具
├── middleware/auth.js           # 后台鉴权中间件（Bearer + token_version）
├── routes/inquiries.js          # 询价单公开接口与后台接口
├── .env.example                 # 环境变量模板（复制为 .env 使用）
├── parts.db                     # SQLite 数据库（首次启动生成，已被忽略）
├── public/index.html            # 旧 Web 后台（待阶段 2 重建后替换）
└── miniprogram/                 # 微信小程序源码
    ├── app.js / app.json / app.wxss
    ├── utils/api.js             # 请求封装（自动带 token）
    ├── utils/constants.js       # 分类 / 状态 / 排序 / 格式化 常量
    └── pages/
        ├── index/               # 首页：搜索 + 车型选择 + 5分类 + 热销 + 推荐
        ├── category/            # 分类页：二级分类 + 品牌/价格/车型筛选 + 排序
        ├── product/             # 配件详情：轮播 + 价格/OEM + 规格 + 适配车型
        ├── search/              # 搜索：配件名/OEM + 搜索历史
        ├── cart/                # 询价单
        └── admin/               # 旧 B 端页面（占位实现，计划移除）
```

## 后端启动步骤

环境要求：Node.js 18+。

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量模板，并修改管理员密码与 JWT 密钥
#    Windows PowerShell: Copy-Item .env.example .env
cp .env.example .env

# 3. 启动服务（默认 3000 端口）
npm start
# 或 node server.js
```

`.env` 至少需要配置：

```ini
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的开发密码
JWT_SECRET=<至少 32 位随机字符串>
REFRESH_TOKEN_SECRET=<至少 32 位随机字符串>
```

生产环境建议只配置 `ADMIN_PASSWORD_HASH`（bcrypt 哈希），不保留明文密码：

```bash
node -e "require('bcryptjs').hash('你的密码',10).then(console.log)"
```

启动成功后终端不再打印后台密码，账号在首次启动时自动写入 `admin_users` 表。

首次启动会自动创建 `parts.db`、填充 **29 个演示配件**、**15 个车型**、**5 个一级分类 / 36 个子分类**，并修复历史数据中的空图片 seed。

## 账号与安全基线

- 密码使用 bcrypt 哈希存储，数据库中不保存明文
- Access Token 默认 2 小时，Refresh Token 默认 7 天
- `token_version` 机制：退出登录或改密后，旧令牌立即失效
- 登录失败限流 5 次/分钟/IP；询价提交 10 次/分钟/IP
- CORS 白名单、helmet 安全响应头、请求体大小限制
- 5xx 响应只返回统一文案，详细错误仅写入服务端日志
- 图片上传先校验 MIME，再校验文件魔数，伪装图片会被拒绝

## API 接口一览

### C 端

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/health | 健康检查（进程 + 数据库） |
| GET | /api/products | 配件列表（category/status/keyword/brand/sort/minPrice/maxPrice/vehicleId/page/limit） |
| GET | /api/products/:id | 配件详情（含 fitModels、specs、images） |
| GET | /api/categories | 分类列表（来自数据库） |
| GET | /api/vehicles | 车型库（按品牌分组） |
| GET | /api/brands | 全部品牌 |
| POST | /api/inquiries | 提交询价（服务端重新计价） |

`POST /api/inquiries` 请求示例：

```json
{
  "customer_name": "张先生",
  "phone": "13800000000",
  "vehicle_info": "大众朗逸 2019 1.5L",
  "remark": "请报价",
  "source": "miniprogram",
  "items": [
    { "id": "p001", "count": 2 },
    { "id": "p002", "count": 1 }
  ]
}
```

可选请求头 `Idempotency-Key` 用于防止重复提交；客户端传入的价格会被忽略，以数据库价格为准。

### 后台（需登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/admin/login | 登录，返回 accessToken / refreshToken |
| POST | /api/admin/refresh | 用 refreshToken 换发新令牌 |
| POST | /api/admin/logout | 退出登录，吊销该账号全部令牌 |
| GET | /api/admin/me | 当前管理员信息 |
| POST | /api/admin/upload | 上传图片（multipart，字段名 `file`） |
| GET | /api/admin/stats | 配件总数/在售/停售/总销量 |
| GET | /api/admin/products | 后台配件列表（分页） |
| GET | /api/admin/products/:id | 单个配件（编辑回填） |
| POST | /api/admin/products | 新增配件 |
| PUT | /api/admin/products/:id | 更新配件 |
| DELETE | /api/admin/products/:id | 删除配件 |
| PATCH | /api/admin/products/:id/status | 上下架切换 |
| GET | /api/admin/inquiries | 询价列表（status/keyword/page/limit） |
| GET | /api/admin/inquiries/stats | 询价状态统计 |
| GET | /api/admin/inquiries/:id | 询价详情 |
| PATCH | /api/admin/inquiries/:id/status | 更新状态（pending/processing/done/closed） |

鉴权方式：请求头 `Authorization: Bearer <accessToken>`。

## 微信开发者工具打开步骤

1. 打开微信开发者工具 → 「导入项目」
2. 目录选择：`miniprogram/`（注意指向含 `app.json` 的目录）
3. AppID 可选择测试号或你的小程序 AppID
4. 开发阶段在「详情」→「本地设置」勾选 **「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」**
5. 点击「编译」预览

> 正式发布前需将 `miniprogram/app.js` 中的 `apiBaseUrl` 改为已备案的 HTTPS 域名，并在公众平台配置 request 合法域名。

## 产品分类

1. 保养件：机油、机滤、空滤、空调滤、火花塞、刹车油、防冻液、变速箱油
2. 易损件：雨刮、灯泡、轮胎、刹车片、刹车盘、皮带、电瓶、离合器片
3. 维修件：减震器、转向系统、燃油泵、水泵、起动机、发电机、传感器
4. 事故件：保险杠、车门、叶子板、大灯、玻璃、安全气囊、安全带
5. 精品附件：脚垫、座套、贴膜、行车记录仪、车载充电器、空气净化器

## 设计规范

- 主色 `#2B99FF`（导航 / 按钮）｜辅助色 `#FF7D00`（价格）｜背景 `#F5F7FA`｜文字 `#333333`｜强调 `#E53E3E`（下架 / 库存紧张）
- 圆角 12px（rpx 下约 24rpx）、间距 16px（约 32rpx）、瀑布流卡片式

## 性能与缓存

在保持 SQLite 技术栈不变的前提下，已内置以下优化：

1. **SQLite WAL 模式**：读写不互斥；`busy_timeout=5000` 避免 `SQLITE_BUSY`；`synchronous=NORMAL`。
2. **高频查询索引**：`parts` 表对 `category / status / oem_code / name / brand / created_at` 建立索引，适配车型关系对 `model_id` 建立索引。
3. **服务端筛选与分页**：价格区间、适配车型、品牌、分类均在 SQL 层过滤，单页最多 100 条。
4. **响应 gzip 压缩**：`compression` 中间件。
5. **内存读缓存**：列表/详情/分类/车型/品牌/统计默认缓存 30 秒（分类/车型/品牌 10 分钟）；任意写操作后自动清空。
6. **图片静态缓存**：`/uploads` 文件名唯一，`Cache-Control: max-age=30d, immutable`。

> 进程内缓存适用于单实例；多实例部署时需替换为 Redis 等共享缓存。

## 阶段 1 已完成项

- 询价表与询价 API（公开提交 + 后台列表/详情/状态流转）
- JWT 登录/刷新/退出、bcrypt 密码、token_version 吊销
- 登录/询价限流、CORS 白名单、helmet、错误脱敏、上传魔数校验
- `.env` 配置治理，移除硬编码密码与固定 token
- 分类/车型种子数据入库，修复空图片 seed，移除 qrcode 依赖
- 列表接口支持价格区间、适配车型服务端筛选与分页上限

## 后续阶段

- 阶段 2：重建 Web 运营后台，替换旧 `public/index.html`
- 阶段 3：移除小程序 admin 页面、接入真实询价提交与环境配置
- 阶段 4：对象存储、部署基座、真实内容、性能与 SEO 验收

## 实操注意事项

- 旧版 `public/index.html` 仍使用旧参数与旧字段，暂不可用，阶段 2 将整体替换。
- 小程序 `pages/admin/*` 目前为占位实现，阶段 3 计划移除，B 端统一由 Web 后台承接。
- 数据库文件、上传目录、`.env` 均已被 `.gitignore` 忽略，请勿提交。
