/**
 * 解锁音频代理
 *
 * 为什么必须要有这一层：
 * 前端 AudioElementPlayer 固定设置 `audioElement.crossOrigin = "anonymous"`，
 * 音频请求走 CORS 模式，必须拿到 Access-Control-Allow-Origin。
 * 而酷我 CDN（kw-er/kw-bj.kuwo.cn）实测**不返回任何 CORS 头**，
 * 直接返回原站直链浏览器会拒绝加载 —— 这正是上游默认关闭酷我音源的原因。
 *
 * 做法：返回**同源相对路径**让前端解析，由本代理转发音频并补上 CORS 头。
 * 同源还能顺带避开跨域 Range 请求的预检问题。
 * 保持路径形状（含 .mp3 扩展名）不变，因为前端会从 URL 里推断音频格式。
 *
 * 安全性：只允许代理白名单内的音源主机，避免变成开放代理。
 */

import { toHttps } from './http.js';

/** 允许代理的主机后缀（酷我 / 网易云音频 CDN） */
const ALLOWED_HOST_SUFFIXES = ['.kuwo.cn', '.music.126.net', '.163.com'];

const PROXY_PREFIX = '/api/unblock/audio';

function isAllowedHost(host) {
  if (!/^[a-z0-9.-]+$/i.test(host)) return false;
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length,
  );
}

/**
 * 把音源直链转换为同源代理路径
 * @param {string} originalUrl 音源直链
 * @returns {string|null} 如 /api/unblock/audio/kw-bj.kuwo.cn/lx/.../x.mp3?bitrate=320k
 */
export function buildProxyUrl(originalUrl) {
  try {
    const u = new URL(toHttps(originalUrl));
    if (!isAllowedHost(u.hostname)) return null;
    return `${PROXY_PREFIX}/${u.hostname}${u.pathname}${u.search}`;
  } catch (e) {
    return null;
  }
}

/** 需要透传给源站的请求头（Range 决定能否拖动进度条） */
const PASSTHROUGH_HEADERS = [
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since',
];

/** 需要原样回传给浏览器的响应头 */
const RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
];

/**
 * @param {import('express').Application} app
 * @param {() => boolean} isEnabled 解锁总开关；关闭时不对外提供代理入口
 */
export function registerAudioProxy(app, isEnabled = () => true) {
  app.all(/^\/api\/unblock\/audio\/(.+)$/, async (req, res) => {
    // 解锁关闭时不再提供音频代理，避免无人使用时仍暴露一个可被滥用的代理入口
    if (!isEnabled()) {
      res.status(503).json({ code: 503, msg: 'unblock disabled' });
      return;
    }

    const rest = req.params[0] || '';
    const slash = rest.indexOf('/');
    if (slash < 1) {
      res.status(400).json({ code: 400, msg: 'invalid proxy path' });
      return;
    }

    const host = rest.slice(0, slash);
    const path = rest.slice(slash);
    if (!isAllowedHost(host)) {
      res.status(403).json({ code: 403, msg: 'host not allowed', host });
      return;
    }

    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    const target = `https://${host}${path}${query}`;

    const headers = {
      // 部分 CDN 会校验 UA / Referer，带上浏览器标识更稳
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    for (const name of PASSTHROUGH_HEADERS) {
      const v = req.headers[name];
      if (v) headers[name] = v;
    }

    try {
      const upstream = await fetch(target, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
      });

      // 即使出错也带上 CORS 头，避免浏览器把错误报成不透明的网络错误
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Range');
      res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
      res.set('Cache-Control', 'public, max-age=3600');

      for (const name of RESPONSE_HEADERS) {
        const v = upstream.headers.get(name);
        if (v) res.set(name, v);
      }
      if (!upstream.headers.get('accept-ranges')) {
        res.set('Accept-Ranges', 'bytes');
      }

      res.status(upstream.status);
      if (req.method === 'HEAD' || !upstream.body) {
        res.end();
        return;
      }

      // 流式回传，支持 Range 分段
      const reader = upstream.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      res.end();
    } catch (err) {
      console.error('[unblock/audio]', err?.message || err);
      res.set('Access-Control-Allow-Origin', '*');
      res.status(502).json({ code: 502, msg: 'audio proxy error' });
    }
  });
}

export default registerAudioProxy;
