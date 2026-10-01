/**
 * axios 兼容层（基于 fetch）
 *
 * api-enhanced 的部分模块直接 `require('axios')` 发起第三方请求
 * （广告匹配、相关歌单抓取、上传服务器发现等）。Workers 里没有 axios，
 * 这里按 axios 的核心调用约定做一个最小实现：
 *
 *   axios({ method, url, params, headers, data })
 *   axios.get(url, config) / axios.post(url, data, config)
 *
 * 返回 `{ data, status, statusText, headers, config }`，
 * 其中 `headers` 为普通对象（部分模块会读 `res.headers.etag`）。
 *
 * 说明：
 * - Workers 的 fetch 不接受地道的 url 参数拼接，这里手动拼 query
 * - `timeout` / `proxy` 在 Workers 中无意义，直接忽略
 * - 默认补一个浏览器 UA：调用方（如 related_playlist 抓网易云 HTML）
 *   通常不传任何请求头，裸请求容易被源站当成爬虫返回空白页
 */

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function buildUrl(url, params) {
  if (!params) return url;
  const usp =
    params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const qs = usp.toString();
  if (!qs) return url;
  return url + (url.includes('?') ? '&' : '?') + qs;
}

async function axios(config = {}) {
  const method = String(config.method || 'get').toUpperCase();
  const url = buildUrl(config.url || '', config.params);

  const headers = { ...(config.headers || {}) };
  if (!headers['User-Agent'] && !headers['user-agent']) {
    headers['User-Agent'] = DEFAULT_UA;
  }

  let body;
  if (config.data !== undefined && config.data !== null) {
    if (typeof config.data === 'string') {
      body = config.data;
    } else if (config.data instanceof URLSearchParams) {
      body = config.data.toString();
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] =
          'application/x-www-form-urlencoded;charset=utf-8';
      }
    } else if (
      config.data instanceof ArrayBuffer ||
      ArrayBuffer.isView(config.data)
    ) {
      body = config.data;
    } else {
      body = JSON.stringify(config.data);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();

  let data = text;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 保持原始文本
    }
  }

  const respHeaders = {};
  res.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });

  // 非 2xx 时按 axios 行为抛错，但把响应挂在 error 上，
  // 便于调用方（如 register_checktoken_v3 的 catch）读取细节
  if (!res.ok) {
    const err = new Error(
      `Request failed with status code ${res.status}`,
    );
    err.response = {
      data,
      status: res.status,
      statusText: res.statusText,
      headers: respHeaders,
      config,
    };
    throw err;
  }

  return {
    data,
    status: res.status,
    statusText: res.statusText,
    headers: respHeaders,
    config,
  };
}

axios.get = (url, config = {}) => axios({ ...config, method: 'get', url });
axios.post = (url, data, config = {}) =>
  axios({ ...config, method: 'post', url, data });
axios.put = (url, data, config = {}) =>
  axios({ ...config, method: 'put', url, data });
axios.delete = (url, config = {}) => axios({ ...config, method: 'delete', url });
axios.request = axios;
axios.default = axios;

export default axios;
export { axios };
