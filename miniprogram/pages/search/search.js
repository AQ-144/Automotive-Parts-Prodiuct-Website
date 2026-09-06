/**
 * 搜索页
 * 功能：
 *  1. 顶部圆角胶囊搜索框（自动聚焦 + confirm/search 触发）
 *  2. 搜索历史：本地缓存最多 10 条，去重后加入头部，可清空
 *  3. GET /api/products?keyword=xx 模糊搜索，两列卡片网格展示
 *  4. 未搜索态：热搜 + 分类快捷入口；空结果态提示
 */
const api = require('../../utils/api');
const { CATEGORIES, CATEGORY_MAP, fmtPrice } = require('../../utils/constants');

// 热搜词（占位）
const HOT_WORDS = ['机油', '雨刮', '刹车片', '火花塞', '滤芯'];

Page({
  data: {
    keyword: '',        // 搜索输入框绑定值
    autoFocus: false,   // 是否自动聚焦
    searched: false,    // 是否已发起过搜索
    products: [],       // 搜索结果
    total: 0,           // 结果总数
    history: [],        // 搜索历史
    hotWords: HOT_WORDS,
    categories: []      // 分类快捷入口
  },

  onLoad() {
    // 读取搜索历史
    const history = wx.getStorageSync('search_history') || [];
    this.setData({
      history: Array.isArray(history) ? history : [],
      categories: CATEGORIES
    });
    // 延迟自动聚焦，避免渲染冲突
    setTimeout(() => this.setData({ autoFocus: true }), 200);
  },

  // 价格格式化（模板使用）
  fmtPrice(n) {
    return fmtPrice(n);
  },

  // 输入绑定
  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  // 清空输入框
  clearKeyword() {
    this.setData({ keyword: '' });
  },

  // 点击热搜 / 历史标签：回填并搜索
  tapHistory(e) {
    const kw = e.currentTarget.dataset.kw;
    this.setData({ keyword: kw }, () => this.doSearch(kw));
  },

  // 回车 / 点击搜索按钮
  onSearch() {
    const kw = (this.data.keyword || '').trim();
    if (!kw) {
      wx.showToast({ title: '请输入关键词', icon: 'none' });
      return;
    }
    this.saveHistory(kw);
    this.doSearch(kw);
  },

  // 写入搜索历史（去重 + 置顶 + 最多 10 条）
  saveHistory(kw) {
    let history = wx.getStorageSync('search_history') || [];
    if (!Array.isArray(history)) history = [];
    history = history.filter(h => String(h) !== String(kw));
    history.unshift(kw);
    history = history.slice(0, 10);
    wx.setStorageSync('search_history', history);
    this.setData({ history });
  },

  // 清空搜索历史
  clearHistory() {
    wx.removeStorageSync('search_history');
    this.setData({ history: [] });
    wx.showToast({ title: '已清空', icon: 'none' });
  },

  // 发起搜索请求
  async doSearch(kw) {
    this.setData({ searched: true, products: [] });
    wx.showLoading({ title: '搜索中', mask: true });
    try {
      const res = await api.get('/api/products', { keyword: kw });
      const list = (res.data || []).map(p => ({
        ...p,
        // 分类角标：映射中文名与颜色
        categoryName: CATEGORY_MAP[p.category] || p.category || '',
        catColor: this.getCatColor(p.category)
      }));
      this.setData({ products: list, total: res.total || list.length });
    } catch (e) {
      wx.showToast({ title: e.message || '搜索失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 获取分类颜色（用于角标）
  getCatColor(key) {
    const c = CATEGORIES.find(x => x.key === key);
    return c ? c.color : '#2B99FF';
  },

  // 跳转商品详情
  goProduct(e) {
    wx.navigateTo({ url: '/pages/product/product?id=' + e.currentTarget.dataset.id });
  },

  // 分类快捷入口 -> 分类页
  goCategory(e) {
    const { key } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/category/category?cat=' + (key || '') });
  }
});