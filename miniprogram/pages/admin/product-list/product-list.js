/**
 * 配件管理
 * 功能：
 *  1. onLoad 检查登录态
 *  2. 搜索(name/oem) + 分类/状态筛选 + 下拉刷新
 *  3. 分页加载(page/limit=20, onReachBottom 加载更多)
 *  4. 单卡操作：上/下架、删除、编辑；多选批量上/下架
 */
const api = require('../../../utils/api');
const { CATEGORIES, CATEGORY_MAP, STATUS_MAP, fmtPrice } = require('../../../utils/constants');

const app = getApp();
const PAGE_SIZE = 20;

Page({
  data: {
    // 筛选
    catChips: [{ key: '', name: '全部' }, ...CATEGORIES],
    statusChips: [
      { key: '', name: '全部' },
      { key: 'on_sale', name: '在售' },
      { key: 'off_shelf', name: '下架' }
    ],
    curCategory: '',
    curStatus: '',
    keyword: '',

    products: [],   // 列表
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    checkAll: false
  },

  fmtPrice,
  CATEGORY_MAP,
  STATUS_MAP,

  onLoad() {
    // 未登录回登录页
    if (!app.globalData.token) {
      wx.reLaunch({ url: '/pages/admin/login' });
      return;
    }
    this.refresh();
  },

  // ===== 下拉刷新 =====
  async onPullDownRefresh() {
    await this.refresh();
    wx.stopPullDownRefresh();
  },

  // 分页加载更多
  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.loadMore();
  },

  // ===== 数据加载 =====
  buildParams(page) {
    const p = { page, limit: PAGE_SIZE };
    if (this.data.curCategory) p.category = this.data.curCategory;
    if (this.data.curStatus) p.status = this.data.curStatus;
    if (this.data.keyword) p.keyword = this.data.keyword;
    return p;
  },

  async fetchList(page) {
    const res = await api.get('/api/admin/products', this.buildParams(page), { needAuth: true });
    const list = res.data || [];
    return list.map(it => ({ ...it, checked: false }));
  },

  // 重置为第一页
  async refresh() {
    this.setData({ loading: true, page: 1, hasMore: true });
    try {
      const list = await this.fetchList(1);
      this.setData({
        products: list,
        page: 1,
        hasMore: list.length >= PAGE_SIZE
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMore() {
    this.setData({ loadingMore: true });
    const next = this.data.page + 1;
    try {
      const list = await this.fetchList(next);
      this.setData({
        products: this.data.products.concat(list),
        page: next,
        hasMore: list.length >= PAGE_SIZE
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  // ===== 搜索 & 筛选 =====
  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },
  onSearch() {
    this.refresh();
  },
  onCat(e) {
    this.setData({ curCategory: e.currentTarget.dataset.key });
    this.refresh();
  },
  onStatus(e) {
    this.setData({ curStatus: e.currentTarget.dataset.key });
    this.refresh();
  },

  // ===== 跳转 =====
  goAdd() {
    wx.navigateTo({ url: '/pages/admin/product-edit' });
  },
  goEdit(e) {
    wx.navigateTo({ url: `/pages/admin/product-edit?id=${e.currentTarget.dataset.id}` });
  },

  // ===== 单项操作 =====
  // 上/下架切换
  async toggleStatus(e) {
    wx.showLoading({ title: '处理中', mask: true });
    try {
      await api.patch(`/api/admin/products/${e.currentTarget.dataset.id}/status`, { status: e.currentTarget.dataset.status }, { needAuth: true });
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 删除（二次确认）
  delOne(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除确认',
      content: `确定删除配件「${name}」吗？`,
      confirmColor: '#E53E3E',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await api.delete(`/api/admin/products/${id}`, {}, { needAuth: true });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  // ===== 多选批量上/下架 =====
  toggleOne(e) {
    const id = e.currentTarget.dataset.id;
    const products = this.data.products.map(it => it.id === id ? { ...it, checked: !it.checked } : it);
    this.setData({ products, checkAll: products.length > 0 && products.every(p => p.checked) });
  },
  toggleCheckAll() {
    const checkAll = !this.data.checkAll;
    const products = this.data.products.map(it => ({ ...it, checked: checkAll }));
    this.setData({ products, checkAll });
  },
  async batchChange(e) {
    const status = e.currentTarget.dataset.status;
    const ids = this.data.products.filter(p => p.checked).map(p => p.id);
    if (ids.length === 0) {
      wx.showToast({ title: '请先勾选配件', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '批量处理中', mask: true });
    try {
      // 循环调用状态更新
      for (const id of ids) {
        await api.patch(`/api/admin/products/${id}/status`, { status }, { needAuth: true });
      }
      wx.showToast({ title: `已${status === 'on_sale' ? '上架' : '下架'} ${ids.length} 项`, icon: 'success' });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err.message || '批量操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});