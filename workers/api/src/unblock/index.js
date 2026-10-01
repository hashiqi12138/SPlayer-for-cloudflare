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

import getKuwoSongUrl from './kuwo.js'
import getBodianSongUrl from './bodian.js'
import getNeteaseSongUrl from './netease.js'
import { buildProxyUrl, registerAudioProxy } from './audio-proxy.js'
import { toHttps, getAudioTotalBytes } from './http.js'

/**
 * 小于该体积的音频视为音源下发的占位片段。
 *
 * 实测酷我对非中国大陆出口 IP 返回固定的 15.6KB 音频（所有歌曲同一资源），
 * 它是合法 MP3 但只有约 0.4 秒；若不拦截，前端会「假成功」并很快播放中断。
 * 64KB 相当于 128kbps 下的约 4 秒，足以区分占位片段与正常歌曲。
 */
const MIN_VALID_AUDIO_BYTES = 64 * 1024

/**
 * 构造匹配信息
 *
 * 前端可能只传 keyword（形如「歌名-歌手」），也可能显式传 songName/artist。
 * 用 lastIndexOf 切分，兼容歌名自身含连字符的情况。
 */
export function buildMatchInfo(query = {}) {
  let songName = query.songName || ''
  let artist = query.artist || ''

  if (!songName && query.keyword) {
    const lastIdx = String(query.keyword).lastIndexOf('-')
    if (lastIdx > 0) {
      songName = String(query.keyword).slice(0, lastIdx).trim()
      artist =
        artist ||
        String(query.keyword)
          .slice(lastIdx + 1)
          .trim()
    } else {
      songName = String(query.keyword).trim()
    }
  }

  return { keyword: query.keyword || '', songName, artist }
}

const UNBLOCK_INFO = {
  name: 'UnblockAPI',
  description: 'SPlayer UnblockAPI service',
  author: '@imsyy',
  content:
    '部分接口采用 @939163156 by GD音乐台(music.gdstudio.xyz)，仅供本人学习使用，不可传播下载内容，不可用于商业用途。',
  sources: ['netease', 'kuwo', 'bodian'],
}

/**
 * 诊断用：debug=1 时允许覆盖发往上游的少量请求头。
 *
 * 用途是判定音源的地区限制究竟看「真实出口 IP」还是「请求头里的 IP」——
 * 实测结论是酷我只看真实 TCP 出口 IP，伪造 IP 头无效（见 ADAPTATION_TODO.md）。
 * 仅在 debug=1 下生效，且只允许白名单内的头，不能注入任意请求头。
 */
const DEBUG_HEADER_PARAMS = {
  xff: 'X-Forwarded-For',
  realip: 'X-Real-IP',
  clientip: 'Client-IP',
  referer: 'Referer',
  ua: 'User-Agent',
}

// 导出供测试使用：它是一道安全边界（只能覆盖白名单头，不能注入任意请求头）
export function buildDebugHeaders(query = {}) {
  if (query.debug !== '1') return {}
  const out = {}
  for (const [param, header] of Object.entries(DEBUG_HEADER_PARAMS)) {
    if (query[param]) out[header] = String(query[param])
  }
  return out
}

/**
 * 解锁功能总开关（wrangler.toml 的 ENABLE_UNBLOCK，默认 false）。
 *
 * 实测三大音源均按出口 IP 限制（酷我下发占位片段、波点 407、网易云 403），
 * 在 Cloudflare 出口无法真正生效，因此默认关闭：前端不再尝试，
 * 后端也不再对外提供音频代理入口。
 *
 * 若部署到中国大陆出口，把 ENABLE_UNBLOCK 改为 "true" 重新部署即可恢复，
 * 无需改动任何代码。
 */
// 导出供 workers/api/test 的离线单测使用（默认关闭这件事值得有回归测试守着）
export function isUnblockEnabled() {
  return String(globalThis.CF_ENV?.ENABLE_UNBLOCK ?? 'false') === 'true'
}

export function registerUnblockRoutes(app) {
  // 音频代理：把音源直链转成同源路径并补 CORS 头（见 audio-proxy.js）
  registerAudioProxy(app, isUnblockEnabled)

  // 把「总是返回 {code, url}」的语义固化下来，避免异常穿透成 500。
  // 额外附带 reason（失败原因）与 source，前端契约只认 code/url，
  // 多出的字段仅用于运维排查与测试分类。
  const handler = (source, fn) => async (req, res) => {
    if (!isUnblockEnabled()) {
      res.status(200).json({ code: 404, url: null, reason: 'disabled', source })
      return
    }

    const query = { ...req.query, ...req.body }
    try {
      const result = await fn(query, buildMatchInfo(query))
      let code = Number(result?.code) || 404

      let url = result?.url || null
      let reason = result?.reason || 'unknown'
      const debug = result?.debug

      if (code === 200 && url) {
        // 拦截占位片段，避免前端把不可播放的结果当成解锁成功
        if (query.skipValidate !== '1') {
          const totalBytes = await getAudioTotalBytes(toHttps(url))
          if (totalBytes > 0 && totalBytes < MIN_VALID_AUDIO_BYTES) {
            code = 404
            reason = 'stub-audio'
            url = null
          }
        }
      }

      if (code === 200 && url) {
        // 音源直链普遍不含 CORS 头，而前端强制 crossOrigin="anonymous"，
        // 必须换成同源代理路径才能播放；raw=1 可拿到原始直链（供非浏览器场景）。
        if (query.raw === '1' || query.raw === 'true') {
          url = toHttps(url)
        } else {
          url = buildProxyUrl(url) || toHttps(url)
        }
      }

      const body = { code, url }
      if (code !== 200) {
        body.reason = reason
        body.source = source
      }
      // debug=1 时附带匹配诊断（选中曲目、候选列表），便于排查音源错配
      if (query.debug === '1' && debug) {
        body.debug = debug
      }
      res.status(200).json(body)
    } catch (err) {
      console.error('[unblock] 未捕获异常', err?.message || err)
      res.status(200).json({ code: 404, url: null, reason: 'error', source })
    }
  }

  app.get('/api/unblock', (_req, res) => {
    res.json({ ...UNBLOCK_INFO, enabled: isUnblockEnabled() })
  })

  // 网易云按歌曲 ID 走聚合接口
  app.get(
    '/api/unblock/netease',
    handler('netease', (query) => getNeteaseSongUrl(query.id)),
  )

  // 酷我 / 波点按关键词搜索匹配
  app.get(
    '/api/unblock/kuwo',
    handler('kuwo', (query, match) => getKuwoSongUrl(match, buildDebugHeaders(query))),
  )
  app.get(
    '/api/unblock/bodian',
    handler('bodian', (_query, match) => getBodianSongUrl(match)),
  )
}

export default registerUnblockRoutes
