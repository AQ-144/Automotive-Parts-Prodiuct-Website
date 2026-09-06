/**
 * 产品详情页
 * 功能：
 *  1. onLoad 接收 id → GET /api/products/:id
 *  2. 顶部主图 swiper（images）
 *  3. 价格区 / 名称 / OEM 气泡 / 规格参数 / 适配车型 / 商品描述
 *  4. 底部固定操作栏：加入询价单 + 立即询价（写 inquiry_cart）
 *  - 库存为 0 或下架时主按钮禁用
 *  - 适配 iPhone 安全区
 */
const api = require('../../utils/api');
const { STATUS_MAP, fmtPrice: _fmtPrice } = require('../../utils/constants');

Page({
  data: {
    loading: true,
    product: null,       // 商品详情
    images: [],          // 主图列表
    specsArray: [],      // 规格（key-value 数组）
    fitModels: [],       // 适配车型
    statusText: '',
    statusColor: '',
    disabled: false      // 主按钮是否禁用
  },

  fmtPrice(n) {
    return _fmtPrice(n);
  },

  onLoad(options) {
    const id = options.id;
    this.loadDetail(id);
  },

  async loadDetail(id) {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const res = await api.get(`/api/products/${id}`);
      const p = res.data || {};
      // 主图：优先 images，否则 main_image
      const images = (p.images && p.images.length) ? p.images : [p.main_image];
      // 规格对象转数组
      const specs = p.specs || {};
      const specsArray = Object.keys(specs).map(k => ({ key: k, value: specs[k] }));

      const status = STATUS_MAP[p.status] || STATUS_MAP.on_sale;
      const disabled = p.status === 'off_shelf' || Number(p.stock) <= 0;

      this.setData({
        product: p,
        images,
        specsArray,
        fitModels: p.fitModels || [],
        statusText: status.text,
        statusColor: status.color,
        disabled
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  // 加入询价单（公共逻辑）
  addToCart() {
    const p = this.data.product;
    let cart = wx.getStorageSync('inquiry_cart') || [];
    if (!Array.isArray(cart)) cart = [];
    const item = { id: p.id, name: p.name, price: p.price, main_image: p.main_image, count: 1 };
    const found = cart.find(i => String(i.id) === String(p.id));
    if (found) {
      found.count = (found.count || 1) + 1;
    } else {
      cart.push(item);
    }
    wx.setStorageSync('inquiry_cart', cart);
    return cart;
  },

  // 「加入询价单」：加入并提示
  addInquiry() {
    if (this.data.disabled) { wx.showToast({ title: '该商品暂无库存', icon: 'none' }); return; }
    this.addToCart();
    wx.showToast({ title: '已加入询价单', icon: 'success' });
  },

  // 「立即询价」：加入并跳转询价单
  inquiryNow() {
    if (this.data.disabled) { wx.showToast({ title: '该商品暂无库存', icon: 'none' }); return; }
    this.addToCart();
    wx.showToast({ title: '已加入询价单', icon: 'success' });
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/cart/cart' });
    }, 600);
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({ current, urls: this.data.images });
  }
});