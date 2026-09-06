/**
 * 汽车配件信息平台 - 小程序入口
 */
App({
  onLaunch() {
    // 从本地读取登录态 token
    this.globalData.token = wx.getStorageSync('admin_token') || '';
  },

  globalData: {
    // ⚠️ API 基础地址：开发阶段用本地地址
    // 生产环境需改为正式域名，并在微信公众平台配置合法域名(HTTPS)
    apiBaseUrl: 'http://localhost:3000',

    // 已登录后台 token
    token: '',

    // 用户选择的车型（车型引导页选择后保存，key: 'my_vehicle'）
    vehicle: wx.getStorageSync('my_vehicle') || null
  }
});