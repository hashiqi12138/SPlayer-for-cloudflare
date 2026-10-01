/**
 * 采样统计：Cloudflare 出口下酷我下发占位片段的概率
 *
 * 若存在一定比例的真实歌曲，则「失败即重试」是有意义的优化。
 *
 * 用法: node scripts/probe-kuwo-stub-rate.cjs [rounds]
 */
const cfg = require('../config.cjs')

const WORKER = cfg.apiWorkerUrl
const KEYWORD = '灰姑娘-梁咏琪'
const ROUNDS = Number(process.argv[2]) || 10

async function sizeOf(url) {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-1' },
      signal: AbortSignal.timeout(60000),
    })
    const cr = res.headers.get('content-range')
    const len = res.headers.get('content-length')
    const total = cr ? Number(cr.split('/').pop()) : Number(len)
    return Number.isFinite(total) ? total : 0
  } catch (e) {
    return -1
  }
}

;(async () => {
  console.log(`目标: ${WORKER}  采样 ${ROUNDS} 次\n`)
  const results = []
  for (let i = 1; i <= ROUNDS; i++) {
    const url =
      `${WORKER}/api/unblock/kuwo?debug=1&skipValidate=1&raw=1` +
      `&keyword=${encodeURIComponent(KEYWORD)}`
    try {
      const j = await (await fetch(url, { signal: AbortSignal.timeout(60000) })).json()
      if (!j.url) {
        console.log(`  #${i} code=${j.code} reason=${j.reason}`)
        results.push({ kind: 'no-url' })
        continue
      }
      const bytes = await sizeOf(j.url)
      const rid = j.url.split('/').slice(-1)[0].split('.')[0]
      const kind = bytes > 64 * 1024 ? 'real' : bytes > 0 ? 'stub' : 'unknown'
      results.push({ kind, bytes, rid })
      console.log(
        `  #${i} ${kind === 'real' ? '✅ 完整' : '❌ 占位'}  ${(bytes / 1024).toFixed(1)}KB  rid=${rid}  songId=${j.debug?.songId}`,
      )
    } catch (e) {
      console.log(`  #${i} EXC ${e.message}`)
      results.push({ kind: 'error' })
    }
  }

  const tally = results.reduce((acc, r) => {
    acc[r.kind] = (acc[r.kind] || 0) + 1
    return acc
  }, {})
  console.log(`\n=== 汇总 ===`)
  for (const [k, v] of Object.entries(tally)) {
    console.log(`  ${k}: ${v} / ${ROUNDS}`)
  }
  if (tally.real) {
    console.log('\n存在真实歌曲返回，失败重试可能有效。')
  } else {
    console.log('\n全部为占位片段，重试无意义。')
  }
})()
