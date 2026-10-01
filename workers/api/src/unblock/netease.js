/**
 * 网易云音源解锁（走 GD 音乐台聚合接口）
 *
 * 来源：splayer-frontend/electron/server/unblock/index.ts 中的 getNeteaseSongUrl。
 *
 * 说明：上游无论成功与否都返回 code 200，这里改为拿不到直链时返回 404，
 * 避免前端把「200 + url:null」当成成功而卡住。
 */

import { getJson, toHttps } from './http.js'

const GD_API = 'https://music-api.gdstudio.xyz/api.php'

/** 聚合接口的请求头：补上 Referer / Accept，尽量贴近正常调用方 */
const GD_HEADERS = {
  Referer: 'https://music-api.gdstudio.xyz/',
  Accept: 'application/json, text/plain, */*',
}

/**
 * @param {number|string} id 网易云歌曲 ID
 * @returns {Promise<{code: number, url: string|null}>}
 */
async function getNeteaseSongUrl(id) {
  try {
    if (!id) return { code: 404, url: null, reason: 'empty-id' }

    const data = await getJson(`${GD_API}?types=url&id=${encodeURIComponent(id)}`, {
      headers: GD_HEADERS,
    })

    const url = data?.url
    if (!url) return { code: 404, url: null, reason: 'no-url' }

    return { code: 200, url: toHttps(url) }
  } catch (err) {
    const status = err?.status
    // 聚合接口对部分出口 IP 直接返回 401/403，属环境限制而非实现缺陷
    const reason =
      status === 401 || status === 402 || status === 403
        ? 'source-blocked'
        : err?.name === 'TimeoutError' || /timeout/i.test(err?.message || '')
          ? 'timeout'
          : 'error'
    console.error('[unblock/netease]', reason, err?.message || err)
    return { code: 404, url: null, reason }
  }
}

export default getNeteaseSongUrl
