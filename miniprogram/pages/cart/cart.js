/**
 * 询价单页（购物车）
 * 功能：
 *  1. onShow 读取本地缓存 inquiry_cart 并渲染
 *  2. 单列列表卡片：左小图 / 中间名称+价格 / 右侧数量加减+删除
 *  3. 数量/删除/清空/提交后同步写回 storage
 *  4. 底部合计（Σ price*count）+ 提交询价（showModal 确认 + toast）
 *  5. 空态：提示 + 去逛逛返回首页
 */
const { fmtPrice } = require('../../utils/constants');

Page({
  data: {
    cart: [],       // 询价单 [{id,name,price,main_image,count}]
    total: 0,       // 合计金额（数值）
    totalStr: '0'   // 合计金额（展示字符串，供模板直接使用）
  },

  // 每次进入页面重新读取缓存（保证与详情页/其他页面同步）
  onShow() {
    this.loadCart();
  },

  // 读取并刷新数据 / 重新计算合计
  loadCart() {
    let cart = wx.getStorageSync('inquiry_cart') || [];
    if (!Array.isArray(cart)) cart = [];
    let total = 0;
    cart.forEach(i => {
      total += (Number(i.price) || 0) * (Number(i.count) || 0);
    });
    this.setData({ cart, total, totalStr: fmtPrice(total) });
  },

  // 写回缓存并刷新列表
  persist(cart) {
    wx.setStorageSync('inquiry_cart', cart);
    this.loadCart();
  },

  // 价格格式化（模板使用）
  fmtPrice(n) {
    return fmtPrice(n);
  },

  // 数量增加
  increase(e) {
    const { index } = e.currentTarget.dataset;
    const cart = this.data.cart.slice();
    cart[index].count = (cart[index].count || 1) + 1;
    this.persist(cart);
  },

  // 数量减少（最低为 1）
  decrease(e) {
    const { index } = e.currentTarget.dataset;
    const cart = this.data.cart.slice();
    if (cart[index].count > 1) {
      cart[index].count = (cart[index].count || 1) - 1;
      this.persist(cart);
    }
  },

  // 删除单项
  removeItem(e) {
    const { index } = e.currentTarget.dataset;
    const cart = this.data.cart.slice();
    cart.splice(index, 1);
    this.persist(cart);
    wx.showToast({ title: '已删除', icon: 'none' });
  },

  // 清除全部（showModal 二次确认）
  clearAll() {
    if (this.data.cart.length === 0) return;
    wx.showModal({
      title: '清除全部',
      content: '确定要清空询价单吗？',
      confirmColor: '#E53E3E',
      success: (res) => {
        if (res.confirm) {
          this.persist([]);
          wx.showToast({ title: '已清空', icon: 'none' });
        }
      }
    });
  },

  // 提交询价（showModal 确认 + toast；保留数据）
  submit() {
    if (this.data.cart.length === 0) return;
    wx.showModal({
      title: '提交询价',
      content: `共 ${this.data.cart.length} 种商品，合计 ¥${this.totalStr}，确认提交询价？`,
      confirmColor: '#2B99FF',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '询价单已提交', icon: 'success' });
          // 提交后保留数据，供后续查看；如需清空可打开下面注释
          // this.persist([]);
        }
      }
    });
  },

  // 去逛逛 -> 首页
  goHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});