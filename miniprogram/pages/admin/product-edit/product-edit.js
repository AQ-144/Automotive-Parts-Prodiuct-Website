/**
 * 新增/编辑配件
 * 功能：
 *  1. onLoad 存在 id → 编辑模式(GET 单条回填)；否则新增模式
 *  2. 表单：基本信息/价格库存/图片/规格/适配车型/描述
 *  3. 规格为动态 key-value 行；适配车型从 /api/vehicles 多选
 *  4. 校验 name/category/price，POST 或 PUT 保存
 */
const api = require('../../../utils/api');
const { CATEGORIES, CATEGORY_MAP } = require('../../../utils/constants');

const app = getApp();

// 分类中文名快速查找
function catName(key) {
  const c = CATEGORIES.find(x => x.key === key);
  return c ? c.name : '';
}

Page({
  data: {
    isEdit: false,
    id: '',

    // 表单字段
    form: {
      name: '',
      category: '',
      brand: '',
      oem_code: '',
      price: '',
      original_price: '',
      stock: '',
      status: 'on_sale',
      main_image: '',
      description: ''
    },
    categoryName: '',

    // 图片：主图 + 展示图列表（可上传）
    imageList: [],

    // 规格动态行
    specs: [
      { key: '', value: '' }
    ],

    // 适配车型（按品牌分组）
    vehicleGroups: [],
    fitIds: [],

    uploading: false,
    saving: false
  },

  onLoad(options) {
    // 未登录回登录页
    if (!app.globalData.token) {
      wx.reLaunch({ url: '/pages/admin/login' });
      return;
    }
    // 编辑模式
    if (options && options.id) {
      this.setData({
        isEdit: true,
        id: options.id
      });
      wx.setNavigationBarTitle({ title: '编辑配件' });
      this.loadDetail(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '新增配件' });
    }
    this.loadVehicles();
  },

  // ===== 数据加载 =====
  // 加载单条详情回填
  async loadDetail(id) {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const res = await api.get(`/api/admin/products/${id}`, {}, { needAuth: true });
      const p = res.data || {};
      const specs = p.specs && Object.keys(p.specs).length
        ? Object.keys(p.specs).map(k => ({ key: k, value: p.specs[k] }))
        : [{ key: '', value: '' }];
      this.setData({
        form: {
          name: p.name || '',
          category: p.category || '',
          brand: p.brand || '',
          oem_code: p.oem_code || '',
          price: p.price != null ? String(p.price) : '',
          original_price: p.original_price != null ? String(p.original_price) : '',
          stock: p.stock != null ? String(p.stock) : '',
          status: p.status || 'on_sale',
          main_image: p.main_image || '',
          description: p.description || ''
        },
        categoryName: catName(p.category),
        imageList: p.images || [],
        specs,
        fitIds: p.fitModels || []
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 加载所有车型（用于适配车型多选）
  async loadVehicles() {
    try {
      const res = await api.get('/api/vehicles');
      const all = (res.data && res.data.all) || [];
      // 按品牌分组
      const map = {};
      all.forEach(v => {
        if (!map[v.brand]) map[v.brand] = { brand: v.brand, models: [] };
        map[v.brand].models.push({ id: v.id, model: v.model, year: v.year, checked: false });
      });
      const groups = Object.values(map);
      this.applyFitChecked(groups);
    } catch (e) {
      // 车型加载失败不阻塞
      this.setData({ vehicleGroups: [] });
    }
  },

  // 依据已选 fitIds 勾选车型
  applyFitChecked(groups) {
    const fit = this.data.fitIds || [];
    groups.forEach(g => {
      g.models.forEach(m => { m.checked = fit.indexOf(m.id) !== -1; });
    });
    this.setData({ vehicleGroups: groups });
  },

  // ===== 表单事件 =====
  onInput(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  // ===== 图片上传 =====

  // 选择并上传单张图片，返回完整 URL
  async uploadImage(filePath) {
    const base = app.globalData.apiBaseUrl;
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${base}/api/admin/upload`,
        filePath,
        name: 'file',
        header: { Authorization: 'Bearer ' + app.globalData.token },
        success(res) {
          try {
            const body = JSON.parse(res.data);
            if (body.success) resolve(body.data.url);
            else reject(new Error(body.message || '上传失败'));
          } catch (e) {
            reject(new Error('上传响应解析失败'));
          }
        },
        fail() { reject(new Error('上传失败，请检查网络')); }
      });
    });
  },

  // 上传多张展示图（追加到 imageList）
  async onAddImages() {
    if (this.data.uploading) return;
    try {
      const res = await wx.chooseMedia({ count: 9, mediaType: ['image'], sizeType: ['compressed'] });
      const files = (res.tempFiles || []).map(f => f.tempFilePath);
      if (!files.length) return;
      this.setData({ uploading: true });
      wx.showLoading({ title: '上传中...', mask: true });
      const urls = [];
      for (const f of files) {
        urls.push(await this.uploadImage(f)); // 逐个上传
      }
      const list = [...this.data.imageList, ...urls];
      // 若尚未设置主图，默认取第一张为主图
      this.setData({
        imageList: list,
        'form.main_image': this.data.form.main_image || (list[0] || '')
      });
      wx.showToast({ title: `成功上传 ${urls.length} 张`, icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
  },

  // 移除一张展示图
  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.imageList.filter((_, i) => i !== index);
    // 若主图被移除，回退到第一张
    let main = this.data.form.main_image;
    if (list.indexOf(main) === -1) main = list[0] || '';
    this.setData({ imageList: list, 'form.main_image': main });
  },

  // 点击某张展示图设为主图
  onSetMain(e) {
    const index = e.currentTarget.dataset.index;
    const url = this.data.imageList[index];
    this.setData({ 'form.main_image': url });
    wx.showToast({ title: '已设为主图', icon: 'none' });
  },

  // 上传一张主图
  async onUploadMain() {
    if (this.data.uploading) return;
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['compressed'] });
      const file = res.tempFiles && res.tempFiles[0];
      if (!file) return;
      this.setData({ uploading: true });
      wx.showLoading({ title: '上传中...', mask: true });
      const url = await this.uploadImage(file.tempFilePath);
      this.setData({ 'form.main_image': url });
      // 若在展示图中未包含则也加入
      if (this.data.imageList.indexOf(url) === -1) {
        this.setData({ imageList: [...this.data.imageList, url] });
      }
      wx.showToast({ title: '主图已更新', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
  },

  // 分类选择（5 单选，使用 actionSheet）
  onCategory() {
    wx.showActionSheet({
      itemList: CATEGORIES.map(c => c.name),
      success: (res) => {
        const c = CATEGORIES[res.tapIndex];
        this.setData({
          'form.category': c.key,
          categoryName: c.name
        });
      }
    });
  },

  // 状态选择
  onStatus(e) {
    this.setData({ 'form.status': e.currentTarget.dataset.status });
  },

  // 适配车型变化
  onFitChange(e) {
    // checkbox 元素本身已处理勾选状态，同步数据
    const values = (e.detail.value || []).map(Number);
    this.setData({ fitIds: values });
  },

  // ===== 规格动态行 =====
  addSpec() {
    this.setData({ specs: [...this.data.specs, { key: '', value: '' }] });
  },
  delSpec(e) {
    const index = e.currentTarget.dataset.index;
    const specs = this.data.specs.filter((_, i) => i !== index);
    this.setData({ specs: specs.length ? specs : [{ key: '', value: '' }] });
  },
  onSpecInput(e) {
    const { index, type } = e.currentTarget.dataset;
    const key = `specs[${index}].${type}`;
    this.setData({ [key]: e.detail.value });
  },

  // ===== 保存 =====
  async onSave() {
    const f = this.data.form;
    // 校验必填
    if (!f.name.trim()) {
      wx.showToast({ title: '请填写配件名称', icon: 'none' });
      return;
    }
    if (!f.category) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }
    if (f.price === '' || isNaN(Number(f.price))) {
      wx.showToast({ title: '请填写正确售价', icon: 'none' });
      return;
    }

    // 组装标准字段
    // 多图：来自 imageList（已上传的完整 URL）
    const images = [...this.data.imageList];

    // 规格对象
    const specs = {};
    this.data.specs.forEach(s => {
      if (s.key.trim()) specs[s.key.trim()] = s.value;
    });

    const payload = {
      name: f.name.trim(),
      category: f.category,
      brand: f.brand.trim(),
      oem_code: f.oem_code.trim(),
      price: Number(f.price),
      original_price: f.original_price === '' ? undefined : Number(f.original_price),
      stock: f.stock === '' ? 0 : Number(f.stock),
      status: f.status,
      main_image: f.main_image.trim(),
      images,
      specs,
      fitModels: this.data.fitIds,
      description: f.description
    };

    this.setData({ saving: true });
    try {
      if (this.data.isEdit) {
        await api.put(`/api/admin/products/${this.data.id}`, payload, { needAuth: true });
      } else {
        await api.post('/api/admin/products', payload, { needAuth: true });
      }
      wx.showToast({ title: this.data.isEdit ? '保存成功' : '添加成功', icon: 'success' });
      setTimeout(() => {
        // 返回上一页（列表已更新），若无上一页则回列表
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.redirectTo({ url: '/pages/admin/product-list' });
        }
      }, 600);
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});