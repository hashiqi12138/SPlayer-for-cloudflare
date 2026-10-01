/**
 * 解锁模块共用的 HTTP 工具
 *
 * 解锁音源多为第三方小众接口：有的只稳定支持 http，有的 https 也可用。
 * 这里统一封装「先 https、失败再退回 http」的取值逻辑，
 * 以及把拿到的播放直链升级为 https（否则 https 前端会因混合内容被拦截）。
 */

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT = 20000;

/**
 * 发起 GET 并返回文本
 * @param {string} url
 * @param {{headers?: object, timeout?: number}} [options]
 */
export async function getText(url, options = {}) {
  const { headers = {}, timeout = DEFAULT_TIMEOUT } = options;
  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_UA, ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    // 保留状态码，便于上层区分「源站封禁出口 IP」与「普通网络故障」
    err.status = res.status;
    throw err;
  }
  return await res.text();
}

/**
 * 先按 https 请求，失败后退回 http（保持协议之外的 URL 完全一致）
 *
 * 两次都失败时把两个错误合并抛出：解锁音源多为境外/小众主机，
 * 在 Cloudflare 出口上常见「https 连不通但 http 通」或反之，
 * 只报其中一个会掩盖真实原因，排查困难。
 */
export async function getTextAny(httpsUrl, options = {}) {
  const httpUrl = httpsUrl.replace(/^https:/, 'http:');

  try {
    return await getText(httpsUrl, options);
  } catch (errHttps) {
    if (httpUrl === httpsUrl) throw errHttps;
    try {
      return await getText(httpUrl, options);
    } catch (errHttp) {
      const err = new Error(
        `https: ${errHttps.message} | http: ${errHttp.message}`,
      );
      err.status = errHttp.status || errHttps.status;
      throw err;
    }
  }
}

/** 以 JSON 解析 GET 结果 */
export async function getJson(url, options = {}) {
  const text = await getTextAny(url, options);
  return JSON.parse(text);
}

/**
 * 发起 POST 并返回文本（同样带 http/https 回退）
 * @param {string} httpsUrl
 * @param {string} body
 * @param {{headers?: object, timeout?: number}} [options]
 */
export async function postTextAny(httpsUrl, body, options = {}) {
  const { headers = {}, timeout = DEFAULT_TIMEOUT } = options;
  const doPost = async (url) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': DEFAULT_UA, ...headers },
      body,
      signal: AbortSignal.timeout(timeout),
    });
    return await res.text();
  };
  try {
    return await doPost(httpsUrl);
  } catch (errHttps) {
    const httpUrl = httpsUrl.replace(/^https:/, 'http:');
    if (httpUrl === httpsUrl) throw errHttps;
    try {
      return await doPost(httpUrl);
    } catch (errHttp) {
      throw new Error(
        `https: ${errHttps.message} | http: ${errHttp.message}`,
      );
    }
  }
}

/**
 * 试探音频资源的总字节数（只取 1 字节，代价很低）
 *
 * 用途：识别音源下发的「占位片段」。实测酷我对非中国大陆出口 IP 会返回
 * 一个固定的 15.6KB 音频（同一资源被套用到所有歌曲），它的确是合法 MP3、
 * 能通过 Range 校验，但只有约 0.4 秒，直接返回会让前端「假成功」并播放失败。
 *
 * @param {string} url 音频直链
 * @param {number} [timeout]
 * @returns {Promise<number>} 总字节数；无法判定时返回 0
 */
export async function getAudioTotalBytes(url, timeout = 10000) {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-1', 'User-Agent': DEFAULT_UA },
      signal: AbortSignal.timeout(timeout),
    });
    // 优先用 Content-Range: bytes 0-1/12345 里的总长
    const contentRange = res.headers.get('content-range');
    if (contentRange && contentRange.includes('/')) {
      const total = Number(contentRange.split('/').pop());
      if (Number.isFinite(total) && total > 0) return total;
    }
    const len = Number(res.headers.get('content-length'));
    if (Number.isFinite(len) && len > 0) return len;
    return 0;
  } catch (e) {
    // 探测失败不应导致解锁失败，交由调用方按「无法判定」处理
    return 0;
  }
}

/**
 * 把播放直链升级为 https。
 * 实测酷我 CDN（kw-er.kuwo.cn / bd-er.kuwo.cn）均支持 https，
 * 若返回 http 直链，在 https 页面上会触发混合内容拦截而无法播放。
 */
export function toHttps(url) {
  return String(url || '').replace(/^http:/, 'https:');
}

export default { getText, getTextAny, getJson, postTextAny, getAudioTotalBytes, toHttps };
