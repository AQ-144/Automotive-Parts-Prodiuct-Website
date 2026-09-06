/**
 * 分类页
 * 功能：
 *  1. 顶部一级分类横向 tab（高亮当前）
 *  2. 二级子分类胶囊（GET /api/categories 的 sub）
 *  3. 筛选：排序(SORTS) / 品牌(GET /api/brands 弹层) / 价格Range / 车型适配开关
 *  4. 数据：GET /api/products?category=cat&limit=200 一次性取该类全部，
 *     之后品牌 / 价格 / 车型过滤与排序全部在前端完成
 */
const api = require('../../utils/api');
const { CATEGORIES, SORTS, fmtPrice: _fmtPrice } = require('../../utils/constants');

const app = getApp();

Page({
  data: {
    loading: true,
    cats: CATEGORIES,           // 一级分类
    activeCat: '',              // 当前一级分类 key
    activeCatName: '',
    subs: [],                   // 二级子分类

    sorts: SORTS,               // 排序项
    sortKey: 'default',         // 当前排序 key

    brands: [],                 // 品牌列表
    showBrandPicker: false,
    selectedBrand: '',          // 已选品牌

    minPrice: '',               // 最低价
    maxPrice: '',               // 最高价

    vehicle: null,              // 已选车型
    showVehiclePicker: false,

    rawList: [],                // 原始全量数据
    filtered: [],               // 过滤/排序后展示
    hasFilter: false
  },

  fmtPrice(n) {
    return _fmtPrice(n);
  },

  onLoad(options) {
    const cat = options.cat || CATEGORIES[0].key;
    this.setData({ activeCat: cat });
    this.loadSub(cat);
    this.loadVehicles();
    this.loadProducts(cat);
  },

  // 加载二级子分类
  async loadSub(cat) {
    try {
      const res = await api.get('/api/categories');
      const data = res.data || [];
      const cur = data.find(i => i.key === cat);
      this.setData({
        subs: (cur && cur.sub) || [],
        activeCatName: (cur && cur.name) || cat
      });
    } catch (e) {
      this.setData({ subs: [], activeCatName: cat });
    }
  },

  // 加载品牌
  async loadBrands() {
    try {
      const res = await api.get('/api/brands');
      this.setData({ brands: res.data || [] });
    } catch (e) {
      this.setData({ brands: [] });
    }
  },

  // 一次性取该类全部商品
  async loadProducts(cat) {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const res = await api.get('/api/products', { category: cat, limit: 200 });
      const list = res.data || [];
      this.setData({ rawList: list });
      this.applyFilter();
    } catch (e) {
      this.setData({ filtered: [] });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  // ===== 一级分类 tab 切换 =====
  switchCat(e) {
    const cat = e.currentTarget.dataset.cat;
    if (cat === this.data.activeCat) return;
    this.setData({
      activeCat: cat,
      selectedBrand: '',
      minPrice: '',
      maxPrice: '',
      vehicle: null,
      sortKey: 'default',
      loading: true,
      filtered: []
    });
    this.loadSub(cat);
    this.loadProducts(cat);
  },

  // ===== 二级子分类点击（当前仅展示，预留扩展）=====
  tapSub() {},

  // ===== 排序 =====
  switchSort(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ sortKey: key });
    this.applyFilter();
  },

  // ===== 品牌弹层 =====
  openBrand() {
    if (this.data.brands.length === 0) this.loadBrands();
    this.setData({ showBrandPicker: true });
  },
  closeBrand() {
    this.setData({ showBrandPicker: false });
  },
  pickBrand(e) {
    const brand = this.data.brands[e.currentTarget.dataset.index];
    this.setData({
      selectedBrand: brand,
      showBrandPicker: false
    });
    this.applyFilter();
  },

  // ===== 价格输入 =====
  onMinInput(e) {
    this.setData({ minPrice: e.detail.value });
    this.applyFilter();
  },
  onMaxInput(e) {
    this.setData({ maxPrice: e.detail.value });
    this.applyFilter();
  },

  // ===== 车型适配开关 =====
  openVehicle() {
    this.setData({ showVehiclePicker: true });
  },
  closeVehicle() {
    this.setData({ showVehiclePicker: false });
  },
  // 取消车型适配（关闭选项）
  chooseModel(e) {
    const m = this.data.modelList[e.currentTarget.dataset.index];
    this.setData({
      vehicle: { id: m.id, brand: m.brand, model: m.model, year: m.year },
      showVehiclePicker: false
    });
    this.applyFilter();
  },
  clearVehicle() {
    this.setData({ vehicle: null });
    this.applyFilter();
  },
  // 返回品牌层
  none() {},

  // 车型分组与品牌层复用首页逻辑
  async loadVehicles() {
    try {
      const res = await api.get('/api/vehicles');
      const grouped = (res.data && res.data.grouped) || [];
      this.setData({ grouped, brandList: grouped.map(g => g.brand) });
    } catch (e) {
      this.setData({ grouped: [], brandList: [] });
    }
  },
  pickBrandForVehicle(e) {
    const brand = this.data.brandList[e.currentTarget.dataset.index];
    const group = this.data.grouped.find(g => g.brand === brand);
    this.setData({ currentBrand: brand, modelList: (group && group.models) || [] });
  },
  backToBrand() {
    this.setData({ currentBrand: '', modelList: [] });
  },

  // ===== 前端过滤 + 排序 =====
  applyFilter() {
    const { rawList, sortKey, selectedBrand, minPrice, maxPrice, vehicle } = this.data;
    let list = rawList.slice();

    // 品牌过滤
    if (selectedBrand) {
      list = list.filter(i => i.brand === selectedBrand);
    }

    // 价格过滤（Number 比较）
    const min = Number(minPrice);
    const max = Number(maxPrice);
    if (!isNaN(min) && min > 0) {
      list = list.filter(i => Number(i.price) >= min);
    }
    if (!isNaN(max) && max > 0) {
      list = list.filter(i => Number(i.price) <= max);
    }

    // 车型适配过滤（fitModels 是否含所选车型 id，未选不过滤）
    if (vehicle) {
      list = list.filter(i =>
        (i.fitModels || []).some(f => String(f.id) === String(vehicle.id))
      );
    }

    // 排序
    if (sortKey === 'sales') {
      list.sort((a, b) => (b.sales || 0) - (a.sales || 0));
    } else if (sortKey === 'price_asc') {
      list.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortKey === 'price_desc') {
      list.sort((a, b) => Number(b.price) - Number(a.price));
    }
    // default 综合：保持后端顺序

    this.setData({
      filtered: list,
      hasFilter: !!(selectedBrand || (min > 0) || (max > 0) || vehicle)
    });
  },

  // 清除全部筛选
  resetFilter() {
    this.setData({
      selectedBrand: '',
      minPrice: '',
      maxPrice: '',
      vehicle: null,
      sortKey: 'default',
      showBrandPicker: false
    });
    this.applyFilter();
  },

  goProduct(e) {
    wx.navigateTo({ url: `/pages/product/product?id=${e.currentTarget.dataset.id}` });
  }
});