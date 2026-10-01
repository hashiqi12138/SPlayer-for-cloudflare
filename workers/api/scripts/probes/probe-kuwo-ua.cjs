/**
 * 验证 User-Agent 对酷我下发结果的影响（境内 / Cloudflare 两侧）
 *
 * 起因：境内直连时，okhttp UA 得到完整歌曲，而浏览器 UA 得到占位片段。
 * 若 UA 是独立的一道闸门，则 Cloudflare 出口换对 UA 可能恢复完整歌曲。
 *
 * 用法: node scripts/probe-kuwo-ua.cjs [local|cloudflare|both]
 */
// 复用前端仓库里的酷我 DES 实现（路径按本脚本位置推导，避免写死本机绝对路径）
const KW_DES = require('url').pathToFileURL(
  require('path').resolve(
    __dirname,
    '..',
    '..',
    '..',
    'splayer-frontend',
    'electron',
    'server',
    'unblock',
    'kwDES.js',
  ),
).href
const cfg = require('../config.cjs')

const WORKER = cfg.apiWorkerUrl

const PACKAGE_NAME = 'kwplayer_ar_5.1.0.0_B_jiakong_vh.apk'
const RID = '479718674'
const STUB_MARKER = '1325645003'
const MIN_REAL_BYTES = 64 * 1024

const UAS = [
  ['okhttp/3.10.0（当前）', 'okhttp/3.10.0'],
  ['Dart/2.19', 'Dart/2.19 (dart:io)'],
  [
    '浏览器 Chrome',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
  ['酷我安卓客户端', 'kwplayer_ar_5.1.0.0_B_jiakong_vh.apk'],
  ['Android 通用', 'Dalvik/2.1.0 (Linux; U; Android 12; HBN-AL00 Build/cd737a2.0)'],
  ['空 UA', ''],
]

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

const verdict = (url, bytes) => {
  if (!url) return '❌ 无直链'
  if (url.includes(STUB_MARKER)) return '❌ 占位片段'
  if (bytes <= 0) return '❓ 未知'
  return bytes > MIN_REAL_BYTES ? '✅ 完整歌曲' : '❌ 片段'
}
const fmt = (b) => (b > 0 ? `${(b / 1024).toFixed(1)}KB` : '-')

async function runLocal() {
  console.log('=== 境内直连：UA 矩阵 ===\n')
  const { encryptQuery } = await import(KW_DES)
  const q = encryptQuery(
    `corp=kuwo&source=${PACKAGE_NAME}&p2p=1&type=convert_url2&sig=0&format=mp3&rid=${RID}`,
  )
  for (const [label, ua] of UAS) {
    try {
      const headers = ua ? { 'User-Agent': ua } : {}
      const res = await fetch(`https://mobi.kuwo.cn/mobi.s?f=kuwo&q=${q}`, { headers })
      const text = await res.text()
      const m = text.match(/http[^\s$"]+/)
      const url = m ? m[0] : null
      const bytes = url ? await sizeOf(url) : 0
      console.log(`  ${verdict(url, bytes)}  ${label.padEnd(22)} ${fmt(bytes).padStart(9)}`)
    } catch (e) {
      console.log(`  💥  ${label.padEnd(22)} ${e.message}`)
    }
  }
}

async function runCloudflare() {
  console.log('\n=== Cloudflare 出口：UA 矩阵 ===\n')
  for (const [label, ua] of UAS) {
    const url =
      `${WORKER}/api/unblock/kuwo?debug=1&skipValidate=1&raw=1` +
      `&keyword=${encodeURIComponent('灰姑娘-梁咏琪')}&ua=${encodeURIComponent(ua)}`
    try {
      const j = await (await fetch(url, { signal: AbortSignal.timeout(60000) })).json()
      const bytes = j.url ? await sizeOf(j.url) : 0
      console.log(`  ${verdict(j.url, bytes)}  ${label.padEnd(22)} ${fmt(bytes).padStart(9)}`)
    } catch (e) {
      console.log(`  💥  ${label.padEnd(22)} ${e.message}`)
    }
  }
}

;(async () => {
  const mode = process.argv[2] || 'both'
  if (mode === 'local' || mode === 'both') await runLocal()
  if (mode === 'cloudflare' || mode === 'both') await runCloudflare()
})()
