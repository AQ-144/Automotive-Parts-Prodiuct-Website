# 汽车配件信息平台

面向私域推广的汽车配件展示 + 询价小程序。含 C 端浏览/搜索/详情/询价单，以及 B 端后台（登录、配件管理、上下架、统计）。

## 技术栈

- 小程序端：微信原生（WXML + WXSS + JS + JSON）
- 后端：Node.js + Express
- 数据库：SQLite（演示用，文件 `parts.db`，首次启动自动建表并填充演示数据）
- 图片占位：picsum.photos（演示用）

## 目录结构

```
project-root/
├── server.js                    # 后端入口与全部 REST API
├── database.js                  # 数据库建表 / 演示数据 / 查询逻辑
├── parts.db                     # SQLite 数据库（首次启动生成）
├── miniprogram/                 # 微信小程序源码
│   ├── app.js / app.json / app.wxss
│   ├── utils/api.js             # 请求封装（自动带 token）
│   ├── utils/constants.js       # 分类 / 状态 / 排序 / 格式化 常量
│   └── pages/
│       ├── index/               # 首页：搜索 + 车型选择 + 5分类 + 热销 + 推荐
│       ├── category/            # 分类页：二级分类 + 品牌/价格/车型筛选 + 排序
│       ├── product/             # 配件详情：轮播 + 价格/OEM + 规格 + 适配车型
│       ├── search/              # 搜索：配件名/OEM + 搜索历史
│       ├── cart/                # 询价单
│       └── admin/
│           ├── login/           # 后台登录（默认密码 admin123）
│           ├── dashboard/       # 后台首页统计
│           ├── product-list/    # 配件管理（增删改/上下架/批量操作）
│           └── product-edit/    # 新增 / 编辑配件
```

## 后端启动步骤

环境要求：Node.js 16+ 。

```bash
# 1. 安装依赖
npm install

# 2. 启动服务（默认 3000 端口）
npm start
# 或 node server.js
```

启动成功后终端提示：

```
汽车配件信息平台服务已启动
访问地址:  http://localhost:3000
API 地址:  http://localhost:3000/api
后台密码:  admin123
```

首次启动自动创建 `parts.db` 并填充 **29 个演示配件**（覆盖 5 大分类）与 **15 个车型**，以及多对多适配关系。

## 微信开发者工具打开步骤

1. 打开微信开发者工具 → 「导入项目」
2. 目录选择：`miniprogram/`（注意指向含 `app.json` 的目录）
3. AppID 可选择测试号或你的小程序 AppID
4. 关键设置（开发阶段）：
   - 右上角「详情」→「本地设置」→ 勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**
   - 原因：开发阶段 API 使用 `http://localhost:3000`，非 HTTPS，需免校验才能请求成功
5. 点击「编译」即可预览

## 演示数据与默认账号

- 后台密码：`admin123`
- 后台入口：首页底部或直接编译打开的页面中进入「管理后台」。小程序共 9 个页面，默认首页为 `pages/index/index`。如需直接打开后台，可在开发者工具「编译模式」中选择 `pages/admin/login`。

## API 接口一览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | /api/products | 否 | 配件列表（category/status/keyword/brand/sort/page/limit） |
| GET | /api/products/:id | 否 | 配件详情（含 fitModels 适配车型、specs、images） |
| GET | /api/categories | 否 | 5 个一级分类 + 子分类 |
| GET | /api/vehicles | 否 | 车型库（按品牌分组） |
| GET | /api/brands | 否 | 全部品牌 |
| POST | /api/admin/login | 否 | 密码登录，返回 token（默认 admin123） |
| POST | /api/admin/upload | 是 | 上传图片（multipart，字段名 `file`），返回可直接访问的 URL |
| GET | /api/admin/stats | 是 | 总数/在售/停售/总销量 |
| GET | /api/admin/products | 是 | 后台配件列表 |
| GET | /api/admin/products/:id | 是 | 后台单个配件（编辑回填） |
| POST | /api/admin/products | 是 | 新增配件 |
| PUT | /api/admin/products/:id | 是 | 更新配件 |
| DELETE | /api/admin/products/:id | 是 | 删除配件 |
| PATCH | /api/admin/products/:id/status | 是 | 上下架切换 |

> 鉴权方式：请求头 `Authorization: Bearer <token>`，token 由登录接口返回。

## 产品分类

1. 保养件：机油、机滤、空滤、空调滤、火花塞、刹车油、防冻液、变速箱油
2. 易损件：雨刮、灯泡、轮胎、刹车片、刹车盘、皮带、电瓶、离合器片
3. 维修件：减震器、转向系统、燃油泵、水泵、起动机、发电机、传感器
4. 事故件：保险杠、车门、叶子板、大灯、玻璃、安全气囊、安全带
5. 精品附件：脚垫、座套、贴膜、行车记录仪、车载充电器、空气净化器

## 设计规范

- 主色 `#2B99FF`（导航 / 按钮）｜辅助色 `#FF7D00`（价格）｜背景 `#F5F7FA`｜文字 `#333333`｜强调 `#E53E3E`（下架 / 库存紧张）
- 圆角 12px（rpx 下约 24rpx）、间距 16px（约 32rpx）、瀑布流卡片式

## 高并发优化（已内置，轻量方案）

在保持 SQLite 技术栈不变的前提下，已内置以下优化，适合读多写少的私域推广场景：

1. **SQLite WAL 模式**：读写不互斥，大幅提升并发读写；配合 `busy_timeout=5000`（写排队而非报 `SQLITE_BUSY`）、`synchronous=NORMAL`。
2. **高频查询索引**：`parts` 表对 `category / status / oem_code / name / created_at` 建立索引，避免全表扫描。
3. **响应 gzip 压缩**：`compression` 中间件，降低带宽与网络延迟。
4. **内存读缓存**：`/api/products`、`/api/products/:id`、`/api/categories`、`/api/vehicles`、`/api/brands`、`/api/admin/stats` 默认缓存 30s（分类/车型/品牌 10min）；**任意写操作（增删改/上下架）后自动清空缓存**，保证数据一致。实测：缓存命中后响应 ~1ms。
5. **图片静态缓存**：`/uploads` 文件名唯一不可变，设置 `Cache-Control: max-age=30d, immutable`，浏览器/CDN 大量降低回源。

> 说明：读缓存为进程内内存缓存，若后续部署多个 Node 实例，需改造为 Redis 等共享缓存，或用 Nginx 反向代理做响应缓存。

## 实操注意事项

- 旧版 `public/index.html`（首个 Web 管理后台）已由小程序端后台取代，其请求基于旧 API，与新接口不兼容，可忽略或后续移除。
- 上线到正式环境：`app.js` 中 `apiBaseUrl` 改为公网 HTTPS 域名，并在微信公众平台「开发设置 → 服务器域名」配置 `request` 合法域名；域名需 ICP 备案。