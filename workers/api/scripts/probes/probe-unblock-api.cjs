/**
 * 解锁接口手动验证（本地 / 线上通用）
 * 用法: node scripts/probe-unblock-api.cjs [base-url]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8788'

const CASES = [
  ['服务信息', '/api/unblock'],
  ['酷我-正常', '/api/unblock/kuwo?keyword=' + encodeURIComponent('海阔天空-Beyond')],
  ['酷我-空关键词', '/api/unblock/kuwo?keyword='],
  ['波点-正常', '/api/unblock/bodian?keyword=' + encodeURIComponent('海阔天空-Beyond')],
  ['网易云-正常', '/api/unblock/netease?id=347230'],
]

;(async () => {
  console.log(`目标: ${BASE}\n`)
  for (const [name, path] of CASES) {
    const started = Date.now()
    try {
      const res = await fetch(BASE + path, { signal: AbortSignal.timeout(40000) })
      const text = await res.text()
      const ms = Date.now() - started
      let j = null
      try {
        j = JSON.parse(text)
      } catch (e) {
        /* ignore */
      }

      if (j && 'url' in j) {
        console.log(
          `[${name}] HTTP ${res.status} (${ms}ms) code=${j.code} url=${j.url ? j.url.slice(0, 80) + '...' : 'null'}`,
        )
      } else if (j) {
        console.log(`[${name}] HTTP ${res.status} (${ms}ms) ${JSON.stringify(j).slice(0, 160)}`)
      } else {
        console.log(`[${name}] HTTP ${res.status} (${ms}ms) 非 JSON: ${text.slice(0, 120)}`)
      }
    } catch (e) {
      console.log(`[${name}] EXC ${e.message}`)
    }
  }
})()
