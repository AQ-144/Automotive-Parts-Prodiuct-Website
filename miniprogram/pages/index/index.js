/**
 * 首页
 * 功能：
 *  1. 顶部胶囊搜索框（跳转 pages/search/search）
 *  2. 车型选择器（读取 app.globalData.vehicle，底部半屏弹层选品牌→车系）
 *  3. 5 个分类入口（读 utils/constants 的 CATEGORIES）
 *  4. 热销列表：GET /api/products?sort=sales&limit=6
 *  5. 为你推荐：GET /api/products&limit=6
 */
const api = require('../../utils/api');
const { CATEGORIES, fmtPrice: _fmtPrice } = require('../../utils/constants');

const app = getApp();

Page({
  data: {
    loading: true,
    hotProducts: [],     // 热销商品
    recommendProducts: [], // 为你推荐
    categories: CATEGORIES, // 分类入口

    // 车型选择器
    vehicle: null,        // 当前选中车型对象
    vehicleText: '选择车型',
    showPicker: false,    // 弹层开关
    brandList: [],        // 品牌列表
    grouped: [],          // 分组数据：带 models
    currentBrand: '',     // 当前选中的品牌
    modelList: []         // 当前品牌下的车型列表
  },

  // wxml 中格式化价格
  fmtPrice(n) {
    return _fmtPrice(n);
  },

  onLoad() {
    this.setData({ categories: CATEGORIES });
    this.refreshVehicle();
    this.loadData();
    this.loadVehicles();
  },

  onShow() {
    // 从其它页面返回时同步更新车型展示
    this.refreshVehicle();
  },

  // 同步当前车型展示文案
  refreshVehicle() {
    const v = app.globalData.vehicle;
    this.setData({
      vehicle: v,
      vehicleText: v ? `${v.brand} ${v.model} ${v.year}` : '选择车型'
    });
  },

  // 下拉刷新：重载数据
  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  // 加载热销 + 推荐
  async loadData() {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const [hot, rec] = await Promise.all([
        api.get('/api/products', { sort: 'sales', limit: 6 }),
        api.get('/api/products', { limit: 6 })
      ]);
      this.setData({
        hotProducts: hot.data || [],
        recommendProducts: rec.data || []
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  // 加载车型分组数据（品牌 + 车型）
  async loadVehicles() {
    try {
      const res = await api.get('/api/vehicles');
      const grouped = (res.data && res.data.grouped) || [];
      this.setData({
        grouped,
        brandList: grouped.map(g => g.brand)
      });
    } catch (e) {
      // 车型数据加载失败不阻塞页面
      this.setData({ brandList: [] });
    }
  },

  // ===== 车型选择器 =====
  openPicker() {
    this.setData({ showPicker: true, currentBrand: '', modelList: [] });
  },

  closePicker() {
    this.setData({ showPicker: false });
  },

  // 点击品牌
  pickBrand(e) {
    const index = e.currentTarget.dataset.index;
    const brand = this.data.brandList[index];
    const group = this.data.grouped.find(g => g.brand === brand);
    this.setData({
      currentBrand: brand,
      modelList: (group && group.models) || []
    });
  },

  backToBrand() {
    this.setData({ currentBrand: '', modelList: [] });
  },

  // 点击车系，选中并保存
  pickModel(e) {
    const m = this.data.modelList[e.currentTarget.dataset.index];
    const vehicle = { id: m.id, brand: m.brand, model: m.model, year: m.year };
    app.globalData.vehicle = vehicle;
    wx.setStorageSync('my_vehicle', vehicle);
    this.setData({
      showPicker: false,
      vehicle,
      vehicleText: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`
    });
    wx.showToast({ title: '车型已选择', icon: 'success' });
  },

  noop() {},

  // 跳转搜索页
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  // 分类入口跳转
  goCategory(e) {
    wx.navigateTo({ url: `/pages/category/category?cat=${e.currentTarget.dataset.cat}` });
  },

  // 商品详情跳转
  goProduct(e) {
    wx.navigateTo({ url: `/pages/product/product?id=${e.currentTarget.dataset.id}` });
  }
});