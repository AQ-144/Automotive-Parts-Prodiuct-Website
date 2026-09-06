/**
 * API 请求封装
 * 统一处理：
 *  - 基础 URL
 *  - 后台 token 自动带 Authorization
 *  - JSON 响应解析、错误拦截
 */
const app = getApp();

function request(path, { method = 'GET', data = {}, needAuth = false, header = {} } = {}) {
  const base = app.globalData.apiBaseUrl;
  const authHeader = {};
  if (needAuth && app.globalData.token) {
    authHeader.Authorization = 'Bearer ' + app.globalData.token;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: base + path,
      method,
      data,
      header: { 'Content-Type': 'application/json', ...authHeader, ...header },
      success(res) {
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && body.success !== false) {
          resolve(body);
        } else {
          // 401 未授权，跳转登录
          if (res.statusCode === 401) {
            reject({ message: body.message || '请先登录' });
            return;
          }
          reject({ message: body.message || '请求失败', statusCode: res.statusCode });
        }
      },
      fail() {
        reject({ message: '网络连接失败，请检查后端是否启动' });
      }
    });
  });
}

module.exports = {
  get: (path, data, opt = {}) => request(path, { method: 'GET', data, ...opt }),
  post: (path, data, opt = {}) => request(path, { method: 'POST', data, ...opt }),
  put: (path, data, opt = {}) => request(path, { method: 'PUT', data, ...opt }),
  patch: (path, data, opt = {}) => request(path, { method: 'PATCH', data, ...opt }),
  delete: (path, data, opt = {}) => request(path, { method: 'DELETE', data, ...opt })
};