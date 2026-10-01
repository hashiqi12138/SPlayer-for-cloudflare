/**
 * 解锁（解灰）路由
 *
 * 对应前端 SPlayer 的 UnblockAPI 契约（见 splayer-frontend/docs/api.md）：
 *   GET /api/unblock                 服务信息
 *   GET /api/unblock/netease?id=     网易云音源
 *   GET /api/unblock/kuwo?keyword=   酷我音源
 *   GET /api/unblock/bodian?keyword= 波点音源
 *
 * 响应统一为 `{ code, url }`，HTTP 状态始终 200（与上游 fastify 实现一致），
 * 由 body 里的 code 表达成功与否，前端按此判断。
 */

import getKuwoSongUrl from './kuwo.js';
import getBodianSongUrl from './bodian.js';
import getNeteaseSongUrl from './netease.js';

/**
 * 构造匹配信息
 *
 * 前端可能只传 keyword（形如「歌名-歌手」），也可能显式传 songName/artist。
 * 用 lastIndexOf 切分，兼容歌名自身含连字符的情况。
 */
export function buildMatchInfo(query = {}) {
  let songName = query.songName || '';
  let artist = query.artist || '';

  if (!songName && query.keyword) {
    const lastIdx = String(query.keyword).lastIndexOf('-');
    if (lastIdx > 0) {
      songName = String(query.keyword).slice(0, lastIdx).trim();
      artist = artist || String(query.keyword).slice(lastIdx + 1).trim();
    } else {
      songName = String(query.keyword).trim();
    }
  }

  return { keyword: query.keyword || '', songName, artist };
}

const UNBLOCK_INFO = {
  name: 'UnblockAPI',
  description: 'SPlayer UnblockAPI service',
  author: '@imsyy',
  content:
    '部分接口采用 @939163156 by GD音乐台(music.gdstudio.xyz)，仅供本人学习使用，不可传播下载内容，不可用于商业用途。',
  sources: ['netease', 'kuwo', 'bodian'],
};

export function registerUnblockRoutes(app) {
  // 把「总是返回 {code, url}」的语义固化下来，避免异常穿透成 500。
  // 额外附带 reason（失败原因）与 source，前端契约只认 code/url，
  // 多出的字段仅用于运维排查与测试分类。
  const handler = (source, fn) => async (req, res) => {
    const query = { ...req.query, ...req.body };
    try {
      const result = await fn(query, buildMatchInfo(query));
      const code = Number(result?.code) || 404;
      const body = { code, url: result?.url || null };
      if (code !== 200) {
        body.reason = result?.reason || 'unknown';
        body.source = source;
      }
      res.status(200).json(body);
    } catch (err) {
      console.error('[unblock] 未捕获异常', err?.message || err);
      res.status(200).json({ code: 404, url: null, reason: 'error', source });
    }
  };

  app.get('/api/unblock', (_req, res) => {
    res.json(UNBLOCK_INFO);
  });

  // 网易云按歌曲 ID 走聚合接口
  app.get(
    '/api/unblock/netease',
    handler('netease', (query) => getNeteaseSongUrl(query.id)),
  );

  // 酷我 / 波点按关键词搜索匹配
  app.get(
    '/api/unblock/kuwo',
    handler('kuwo', (_query, match) => getKuwoSongUrl(match)),
  );
  app.get(
    '/api/unblock/bodian',
    handler('bodian', (_query, match) => getBodianSongUrl(match)),
  );
}

export default registerUnblockRoutes;
