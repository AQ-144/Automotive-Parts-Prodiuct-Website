/**
 * 后台首页 (仪表盘)
 * 功能：
 *  1. 每次 onShow 检查登录态，未登录回登录页
 *  2. 拉取统计 GET /api/admin/stats 展示 4 个指标
 *  3. 快捷入口：新增配件 / 配件管理 / 退出登录
 */
const api = require('../../../utils/api');

const app = getApp();

Page({
  data: {
    username: '',          // 管理员名
    stats: {
      total: 0,            // 总配件数
      onSale: 0,           // 在售
      offShelf: 0,         // 停售
      totalSales: 0        // 总销量
    }
  },

  onShow() {
    // 未登录则回登录页
    if (!app.globalData.token) {
      wx.reLaunch({ url: '/pages/admin/login' });
      return;
    }
    // 读取后台用户名
    const username = app.globalData.username || '';
    this.setData({ username });
    this.loadStats();
  },

  // 加载统计数据
  async loadStats() {
    try {
      const res = await api.get('/api/admin/stats', {}, { needAuth: true });
      this.setData({ stats: res.data || { total: 0, onSale: 0, offShelf: 0, totalSales: 0 } });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  // 新增配件
  goAdd() {
    wx.navigateTo({ url: '/pages/admin/product-edit' });
  },

  // 配件管理
  goList() {
    wx.navigateTo({ url: '/pages/admin/product-list' });
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清空 token 与本地存储
          wx.removeStorageSync('admin_token');
          app.globalData.token = '';
          wx.reLaunch({ url: '/pages/admin/login' });
        }
      }
    });
  }
});