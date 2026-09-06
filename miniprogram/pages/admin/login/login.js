/**
 * 后台登录页
 * 功能：
 *  1. onLoad 若已存在 token 则自动跳转后台首页
 *  2. 密码登录：POST /api/admin/login，成功后保存 token 并跳转 dashboard
 */
const api = require('../../../utils/api');

const app = getApp();

Page({
  data: {
    password: '',   // 密码输入
    submitting: false // 登录中状态
  },

  onLoad() {
    // 已登录则直接进入后台
    if (app.globalData.token) {
      wx.reLaunch({ url: '/pages/admin/dashboard' });
    }
  },

  // 密码输入
  onInput(e) {
    this.setData({ password: e.detail.value });
  },

  // 登录
  async onLogin() {
    const password = this.data.password.trim();
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const res = await api.post('/api/admin/login', { password });
      const data = res.data || {};
      // 保存登录态
      wx.setStorageSync('admin_token', data.token);
      app.globalData.token = data.token;
      wx.showToast({ title: '登录成功', icon: 'success' });
      // 等待提示显示后跳转
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/admin/dashboard' });
      }, 600);
    } catch (e) {
      wx.showToast({ title: e.message || '登录失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});