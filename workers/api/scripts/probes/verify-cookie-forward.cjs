/**
 * 回归测试：校验 Worker 是否把调用方传入的 cookie 透传到网易云
 *
 * 原理：利用接口的 domain 覆盖参数，把 Worker 的出站请求打到回显服务，
 * 直接检查出站 Cookie 头里有没有 MUSIC_U。
 *
 * 用法:
 *   $env:NCM_COOKIE = "MUSIC_U=xxxxx"
 *   node scripts/verify-cookie-forward.cjs [base-url]
 *
 * 退出码: 0 = 全部通过, 1 = 存在失败
 */
const cfg = require('../config.cjs')

const BASE = process.argv[2] || cfg.apiWorkerUrl
const COOKIE = process.env.NCM_COOKIE || ''
const ECHO = 'https://httpbin.org/anything'

if (!COOKIE) {
  console.error('缺少 NCM_COOKIE 环境变量，无法执行透传校验')
  process.exit(2)
}

async function outboundCookie(pathAndQuery, headers) {
  const res = await fetch(`${BASE}${pathAndQuery}&domain=${encodeURIComponent(ECHO)}`, { headers })
  const body = await res.json().catch(() => null)
  return body && body.headers ? body.headers.Cookie || '' : null
}

;(async () => {
  const q = encodeURIComponent(COOKIE)
  const cases = [
    {
      name: '查询参数传入 cookie',
      url: `/song/detail?ids=304867&cookie=${q}`,
      headers: {},
      expect: true,
    },
    {
      name: '请求头传入 cookie',
      url: '/song/detail?ids=304867',
      headers: { Cookie: COOKIE },
      expect: true,
    },
    {
      name: '查询参数与请求头同时存在时以查询参数为准',
      url: `/song/detail?ids=304867&cookie=${q}`,
      headers: { Cookie: 'unrelated=1' },
      expect: true,
    },
  ]

  let failed = 0
  for (const c of cases) {
    try {
      const cookie = await outboundCookie(c.url, c.headers)
      if (cookie === null) {
        console.log(`❌ ${c.name}: 回显服务无响应（网络问题？）`)
        failed++
        continue
      }
      const m = cookie.match(/MUSIC_U=([^;]*)/)
      const has = !!m
      // 只校验「存在」是不够的：cookie 切分错误时，值会连上后续 cookie 一起被
      // 编码（如 `00BC...%3Bos%3Dpc%3B`），仍然匹配 MUSIC_U= 却是坏的登录态。
      const clean = has && !/%3B|%3D|;/.test(m[1])
      const ok = has === c.expect && clean
      if (!ok) failed++
      console.log(`${ok ? '✅' : '❌'} ${c.name}: 含 MUSIC_U=${has} 值未被污染=${clean}`)
      if (!ok) console.log(`     实际: ${cookie.slice(0, 200)}`)
    } catch (e) {
      failed++
      console.log(`❌ ${c.name}: ${e.message}`)
    }
  }

  console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
  process.exit(failed === 0 ? 0 : 1)
})()
