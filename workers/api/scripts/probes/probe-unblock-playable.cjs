/**
 * 端到端校验：经 Pages 拿到解锁直链，实际拉流并检查浏览器播放所需的条件
 *
 * 校验三点（缺一不可）：
 *   1. 能拉到音频数据（HTTP 200/206）
 *   2. Content-Type 为音频
 *   3. 响应带 Access-Control-Allow-Origin
 *      —— 前端 AudioElementPlayer 固定 crossOrigin="anonymous"，
 *         缺这个头浏览器会直接拒绝加载
 *
 * 用法: node scripts/probe-unblock-playable.cjs [pages-base]
 */
const cfg = require('../config.cjs')

const BASE = process.argv[2] || cfg.pagesUrl
const ORIGIN = BASE

const CASES = [
  ['酷我', '/api/unblock/kuwo?keyword=' + encodeURIComponent('灰姑娘-梁咏琪')],
  ['波点', '/api/unblock/bodian?keyword=' + encodeURIComponent('灰姑娘-梁咏琪')],
]

;(async () => {
  console.log(`目标: ${BASE}\n`)
  for (const [name, path] of CASES) {
    const t0 = Date.now()
    const j = await (await fetch(BASE + path, { signal: AbortSignal.timeout(60000) })).json()
    console.log(`[${name}] code=${j.code} reason=${j.reason || '-'} (${Date.now() - t0}ms)`)

    if (j.code !== 200 || !j.url) {
      console.log('  跳过拉流校验（未拿到直链）\n')
      continue
    }

    // 接口默认返回同源相对路径，需按当前站点解析
    const abs = new URL(j.url, BASE).toString()
    console.log(`  URL: ${abs.slice(0, 105)}...`)

    const res = await fetch(abs, {
      headers: { Range: 'bytes=0-2047', Origin: ORIGIN },
      signal: AbortSignal.timeout(30000),
    })
    const ct = res.headers.get('content-type') || ''
    const acao = res.headers.get('access-control-allow-origin')
    const bytes = (await res.arrayBuffer()).byteLength

    const okStatus = res.status === 206 || res.status === 200
    const okType = /audio|octet-stream/i.test(ct)
    const okCors = !!acao

    console.log(`  拉流: HTTP ${res.status} | ${ct} | ${bytes} bytes`)
    console.log(`  CORS: ${acao ?? '(缺失)'}`)
    console.log(
      `  => ${okStatus && okType && okCors && bytes > 0 ? '✅ 浏览器可播放' : '❌ 不满足播放条件'}\n`,
    )
  }
})()
