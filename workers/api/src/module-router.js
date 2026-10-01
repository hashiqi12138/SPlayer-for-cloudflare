/**
 * 手动实现的特殊接口
 * 
 * 只保留自动转译无法覆盖的模块（依赖 qrcode / unblockmusic-utils / 文件上传等）
 * 其余 413 个接口由 generated-routes.js 自动提供
 * 
 * 注册顺序：先于自动路由注册，同名时以本文件为准
 */

import { createRequest } from './ncm-request-handler.js';

export function registerModules(app) {

  // ===== 歌曲播放地址 v1 =====
  // 原模块依赖 unblockmusic-utils（解灰），此处退化为普通 eapi 请求
  app.all('/song/url/v1', handleModule((query, request) => {
    return request(
      '/api/song/enhance/player/url/v1',
      {
        ids: '[' + query.id + ']',
        level: query.level || 'standard',
        encodeType: query.encodeType || 'mp3',
      },
      { crypto: 'eapi' }
    );
  }));

  // ===== 二维码生成 =====
  // 原模块依赖 qrcode 包生成图片，此处只回传二维码内容，由前端渲染
  app.all('/login/qr/create', handleModule((query) => {
    const key = query.key || '';
    return Promise.resolve({
      status: 200,
      body: {
        code: 200,
        data: {
          qrurl: `https://music.163.com/login?codekey=${encodeURIComponent(key)}`,
          qrimg: null,
        },
      },
    });
  }));

  // ===== 健康检查 =====
  app.get('/health', (_req, res) => {
    res.json({ code: 200, status: 'ok', service: 'ncm-api-worker' });
  });
}

function handleModule(moduleFn) {
  return async (req, res) => {
    try {
      const query = { ...req.query, ...req.body };
      if (req.cookies) query.cookie = req.cookies;
      else if (req.headers.cookie) query.cookie = req.headers.cookie;

      const ip = req.ip || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '';

      const requestFn = (p, data, options = {}) =>
        createRequest(p, data, { ...options, ip: options.ip || ip });

      const result = await moduleFn(query, requestFn);

      if (result.cookie && result.cookie.length > 0 && !query.noCookie) {
        for (const cookie of result.cookie) {
          res.append('Set-Cookie', req.protocol === 'https' ? cookie + '; SameSite=None; Secure' : cookie);
        }
      }

      if (result.redirectUrl) {
        res.redirect(result.status || 302, result.redirectUrl);
        return;
      }

      res.status(result.status || 200).json(result.body);
    } catch (err) {
      let status = 500;
      let body = { code: 500, msg: 'Internal Server Error' };
      if (err && typeof err === 'object') {
        status = err.status || err.statusCode || 500;
        if (err.body) body = err.body;
        else if (err.message) body = { code: status, msg: String(err.message) };
        else {
          try { body = { code: status, msg: JSON.stringify(err) }; }
          catch (e) { body = { code: status, msg: String(err) }; }
        }
      } else {
        body = { code: status, msg: String(err) };
      }
      if (err?.cookie && !req.query?.noCookie) res.append('Set-Cookie', err.cookie);
      res.status(status).json(body);
    }
  };
}