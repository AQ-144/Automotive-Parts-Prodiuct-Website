/**
 * 询价单路由（对应优化项 OP-P0-03）
 *
 * 公开接口：
 *   POST /api/inquiries                提交询价（服务端重新计价，不信任客户端价格）
 *
 * 后台接口（由 server.js 挂载 authRequired）：
 *   GET   /api/admin/inquiries         列表（状态/关键词/分页）
 *   GET   /api/admin/inquiries/stats   状态统计
 *   GET   /api/admin/inquiries/:id     详情
 *   PATCH /api/admin/inquiries/:id/status  更新状态
 */

const express = require('express');
const rateLimitModule = require('express-rate-limit');
const rateLimit = rateLimitModule.rateLimit || rateLimitModule;

const config = require('../config');
const database = require('../database');

const publicRouter = express.Router();
const adminRouter = express.Router();

const INQUIRY_STATUSES = ['pending', 'processing', 'done', 'closed'];
const PHONE_RE = /^1[3-9]\d{9}$/;
const PRODUCT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// 询价接口限流：防止脚本刷单
const inquiryLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimit.inquiry,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: '询价提交过于频繁，请稍后再试' }
});

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** 安全截取字符串，避免超长字段写入数据库 */
function str(value, max) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, max);
}

function badRequest(res, message, errors) {
  return res.status(400).json({
    success: false,
    message,
    ...(errors && errors.length ? { errors } : {})
  });
}

function publicInquiry(row) {
  return {
    id: row.id,
    inquiry_no: row.inquiry_no,
    item_count: row.item_count,
    total_amount: row.total_amount,
    status: row.status,
    created_at: row.created_at
  };
}

/* ==================== 公开接口 ==================== */

publicRouter.post('/', inquiryLimiter, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const errors = [];

  const customerName = str(body.customer_name, 30);
  const phone = str(body.phone, 20);
  const wechat = str(body.wechat, 50);
  const vehicleInfo = str(body.vehicle_info, 100);
  const remark = str(body.remark, 500);
  const source = body.source === 'miniprogram' ? 'miniprogram' : 'h5';

  if (!customerName) errors.push('请填写联系人姓名');
  if (!PHONE_RE.test(phone)) errors.push('请填写正确的手机号');

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) errors.push('询价单不能为空');
  if (rawItems.length > 50) errors.push('单次最多询价 50 种商品');

  const items = [];
  for (const raw of rawItems) {
    const id = str(raw && (raw.id || raw.productId), 64);
    const count = parseInt(raw && raw.count, 10);

    if (!PRODUCT_ID_RE.test(id)) {
      errors.push('商品 ID 格式不正确');
      break;
    }
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      errors.push('商品数量需为 1-99 的整数');
      break;
    }
    items.push({ id, count });
  }

  if (errors.length) return badRequest(res, '参数校验失败', errors);

  // 幂等：同一 Idempotency-Key 重复提交直接返回已有询价单
  const idempotencyKey = str(req.get('Idempotency-Key'), 100);
  if (idempotencyKey) {
    const existing = await database.findInquiryByIdempotencyKey(idempotencyKey);
    if (existing) {
      return res.json({ success: true, message: '询价已提交', data: publicInquiry(existing) });
    }
  }

  // 服务端回查商品价格与状态，忽略客户端传入的价格
  const parts = await database.getPartsByIds(items.map((item) => item.id));
  const partMap = new Map(parts.map((p) => [String(p.id), p]));

  const missing = items.filter((item) => !partMap.has(item.id)).map((item) => item.id);
  if (missing.length) {
    return badRequest(res, '部分商品不存在或已删除', [`无效商品：${missing.join(', ')}`]);
  }

  const unavailable = items
    .filter((item) => partMap.get(item.id).status !== 'on_sale')
    .map((item) => item.id);
  if (unavailable.length) {
    return badRequest(res, '部分商品已下架，请刷新询价单', [`已下架：${unavailable.join(', ')}`]);
  }

  const storedItems = items.map((item) => {
    const part = partMap.get(item.id);
    return {
      id: part.id,
      name: part.name,
      price: Number(part.price) || 0,
      count: item.count,
      oem_code: part.oem_code || '',
      main_image: part.main_image || ''
    };
  });

  const totalAmount = storedItems.reduce(
    (sum, item) => sum + item.price * item.count,
    0
  );
  const itemCount = storedItems.reduce((sum, item) => sum + item.count, 0);

  const inquiry = await database.createInquiry({
    customer_name: customerName,
    phone,
    wechat,
    vehicle_info: vehicleInfo,
    remark,
    items: storedItems,
    item_count: itemCount,
    total_amount: Math.round(totalAmount * 100) / 100,
    status: 'pending',
    source,
    idempotency_key: idempotencyKey || null
  });

  return res.status(201).json({
    success: true,
    message: '询价已提交，商家会尽快与您联系',
    data: publicInquiry(inquiry)
  });
}));

/* ==================== 后台接口 ==================== */

adminRouter.get('/', asyncHandler(async (req, res) => {
  const { status, keyword } = req.query;

  if (status && !INQUIRY_STATUSES.includes(status)) {
    return badRequest(res, '询价状态不合法');
  }

  const result = await database.getInquiries({
    status,
    keyword,
    page: req.query.page,
    limit: req.query.limit
  });

  return res.json({ success: true, ...result });
}));

adminRouter.get('/stats', asyncHandler(async (req, res) => {
  const data = await database.getInquiryStats();
  return res.json({ success: true, data });
}));

adminRouter.get('/:id', asyncHandler(async (req, res) => {
  const inquiry = await database.getInquiryById(req.params.id);
  if (!inquiry) {
    return res.status(404).json({ success: false, message: '询价单不存在' });
  }
  return res.json({ success: true, data: inquiry });
}));

adminRouter.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!INQUIRY_STATUSES.includes(status)) {
    return badRequest(res, '询价状态不合法', [`可选值：${INQUIRY_STATUSES.join('/')}`]);
  }

  const inquiry = await database.getInquiryById(req.params.id);
  if (!inquiry) {
    return res.status(404).json({ success: false, message: '询价单不存在' });
  }

  await database.updateInquiryStatus(req.params.id, status);
  const updated = await database.getInquiryById(req.params.id);
  return res.json({ success: true, message: '状态已更新', data: updated });
}));

module.exports = {
  public: publicRouter,
  admin: adminRouter
};
