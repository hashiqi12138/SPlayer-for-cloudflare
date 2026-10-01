/**
 * 核实酷我解锁直链是否为完整歌曲（而非试听片段）
 *
 * 关键点：之前观测到某个解锁链接总长仅约 16KB，若为试听片段则解锁无实际意义。
 * 这里完整下载并报告大小、时长估算，并对比多首曲目。
 *
 * 用法: node scripts/probe-unlock-fullsize.cjs [pages-base]
 */
const cfg = require('../config.cjs')

const BASE = process.argv[2] || cfg.pagesUrl

const CASES = [
  ['灰姑娘-梁咏琪', '灰姑娘-梁咏琪'],
  ['海阔天空-Beyond', '海阔天空-Beyond'],
  ['晴天-周杰伦', '晴天-周杰伦'],
  ['告白气球-周杰伦', '告白气球-周杰伦'],
]

/** 粗略估算 MP3 时长（按 320kbps 上限） */
const estimateSeconds = (bytes) => (bytes * 8) / 320000

;(async () => {
  console.log(`目标: ${BASE}\n`)
  for (const [label, keyword] of CASES) {
    try {
      const res = await fetch(
        `${BASE}/api/unblock/kuwo?keyword=${encodeURIComponent(keyword)}&raw=1`,
        { signal: AbortSignal.timeout(60000) },
      )
      const j = await res.json()
      if (j.code !== 200 || !j.url) {
        console.log(`[${label}] 未取到直链 (code=${j.code} reason=${j.reason || '-'})`)
        continue
      }

      const t0 = Date.now()
      const audio = await fetch(j.url, { signal: AbortSignal.timeout(120000) })
      const buf = await audio.arrayBuffer()
      const ms = Date.now() - t0
      const kb = (buf.byteLength / 1024).toFixed(1)
      const est = estimateSeconds(buf.byteLength).toFixed(0)
      const head = new Uint8Array(buf.slice(0, 3))
      const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33 // "ID3"
      const isMpegFrame = head[0] === 0xff && (head[1] & 0xe0) === 0xe0

      console.log(
        `[${label}] ${kb}KB (${ms}ms) | 约 ${est}s@320k | content-type=${audio.headers.get('content-type')} | ID3=${isId3} MPEG帧=${isMpegFrame}`,
      )
      console.log(`   ${j.url.slice(0, 95)}`)
    } catch (e) {
      console.log(`[${label}] EXC ${e.message}`)
    }
  }
})()
