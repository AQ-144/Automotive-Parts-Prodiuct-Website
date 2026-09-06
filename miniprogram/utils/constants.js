/**
 * 全局常量：分类、状态、图标映射
 * 保持与后端 database.js 中的 CATEGORIES 一致
 */
const CATEGORIES = [
  { key: 'maintenance', name: '保养件', desc: '机油·滤芯·火花塞', color: '#2B99FF', emoji: '🛢️' },
  { key: 'wear', name: '易损件', desc: '雨刮·轮胎·刹车片', color: '#FF7D00', emoji: '🔧' },
  { key: 'repair', name: '维修件', desc: '减震·水泵·传感器', color: '#00B386', emoji: '🛠️' },
  { key: 'accident', name: '事故件', desc: '保险杠·大灯·钣金', color: '#7B61FF', emoji: '🚙' },
  { key: 'accessory', name: '精品附件', desc: '脚垫·记录仪·净化器', color: '#E53E3E', emoji: '🎁' }
];

// 分类 key 与中文名快速映射
const CATEGORY_MAP = {};
CATEGORIES.forEach(c => { CATEGORY_MAP[c.key] = c.name; });

// 状态映射
const STATUS_MAP = {
  on_sale: { text: '在售', color: '#00B386' },
  off_shelf: { text: '下架', color: '#E53E3E' }
};

// 排序项
const SORTS = [
  { key: 'default', text: '综合' },
  { key: 'sales', text: '销量' },
  { key: 'price_asc', text: '价格↑' },
  { key: 'price_desc', text: '价格↓' }
];

/**
 * 格式化价格（保留两位小数，去掉多余0）
 */
function fmtPrice(n) {
  const num = Number(n) || 0;
  return num.toFixed(num % 1 === 0 ? 0 : 2);
}

module.exports = { CATEGORIES, CATEGORY_MAP, STATUS_MAP, SORTS, fmtPrice };