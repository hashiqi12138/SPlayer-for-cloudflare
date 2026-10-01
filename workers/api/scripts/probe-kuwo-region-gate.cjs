/**
 * 判定酷我地域限制的判定依据：真实 TCP 出口 IP 还是请求头
 *
 * 双向验证（这是回答「加请求头能不能绕过」的关键证据）：
 *   A. 反向：本机在境内（能拿到完整歌曲）。给请求加上境外 IP 头，
 *      若仍返回完整歌曲 => 说明 IP 头不被信任。
 *   B. 正向：经 Cloudflare 出口（拿到占位片段）。给请求加上境内 IP 头 /
 *      换 Referer / 换 UA，若仍是占位片段 => 进一步确认只看真实出口 IP。
 *
 * 结论（实测）：酷我只认真实 TCP 出口 IP，任何请求头都无法绕过。
 *
 * 用法:
 *   node scripts/probe-kuwo-region-gate.cjs            # 跑 A + B
 *   node scripts/probe-kuwo-region-gate.cjs local      # 只跑 A（须境内网络）
 *   node scripts/probe-kuwo-region-gate.cjs cloudflare # 只跑 B
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
const cfg = require('./config.cjs')

const WORKER = cfg.apiWorkerUrl

const PACKAGE_NAME = 'kwplayer_ar_5.1.0.0_B_jiakong_vh.apk'
const OKHTTP = 'okhttp/3.10.0'
const RID = '479718674' // 灰姑娘 (Live) / 梁咏琪，境内实测 2046KB

const STUB_MARKER = '1325645003'
const MIN_REAL_BYTES = 64 * 1024

const HEADER_CASES = [
  ['基线', {}],
  ['XFF 境外 8.8.8.8', { 'X-Forwarded-For': '8.8.8.8' }],
  ['XFF 境内 114.114.114.114', { 'X-Forwarded-For': '114.114.114.114' }],
  ['XFF 境内 1.0.1.114', { 'X-Forwarded-For': '1.0.1.114' }],
  ['X-Real-IP 境内', { 'X-Real-IP': '114.114.114.114' }],
  ['Client-IP 境内', { 'Client-IP': '114.114.114.114' }],
  ['Referer 酷我官网', { Referer: 'http://www.kuwo.cn/' }],
  [
    '浏览器 UA',
    {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  ],
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
  if (bytes < 0) return '❓ 无法判定'
  if (bytes === 0) return '❓ 未知'
  return bytes > MIN_REAL_BYTES ? '✅ 完整歌曲' : '❌ 片段'
}

const fmt = (bytes) => (bytes > 0 ? `${(bytes / 1024).toFixed(1)}KB` : '-')

/** A. 境内直连，伪造各种 IP 头 */
async function runLocal() {
  console.log('=== A. 反向验证：境内直连 + 伪造 IP 头 ===')
  console.log(
    '（本机在境内，基线应为完整歌曲；若伪造境外 IP 后仍是完整歌曲，说明 IP 头不被信任）\n',
  )
  const { encryptQuery } = await import(KW_DES)

  for (const [label, extra] of HEADER_CASES) {
    const q = encryptQuery(
      `corp=kuwo&source=${PACKAGE_NAME}&p2p=1&type=convert_url2&sig=0&format=mp3&rid=${RID}`,
    )
    try {
      const res = await fetch(`https://mobi.kuwo.cn/mobi.s?f=kuwo&q=${q}`, {
        headers: { 'User-Agent': OKHTTP, ...extra },
      })
      const text = await res.text()
      const m = text.match(/http[^\s$"]+/)
      const url = m ? m[0] : null
      const bytes = url ? await sizeOf(url) : 0
      const tail = url ? url.split('/').slice(-1)[0].slice(0, 30) : '-'
      console.log(
        `  ${verdict(url, bytes)}  ${label.padEnd(24)} ${fmt(bytes).padStart(9)}  ${tail}`,
      )
    } catch (e) {
      console.log(`  💥  ${label.padEnd(24)} ${e.message}`)
    }
  }
}

/** B. 经 Cloudflare 出口，伪造境内 IP 头 / 换 UA / 加 Referer */
async function runCloudflare() {
  console.log('\n=== B. 正向验证：Cloudflare 出口 + 伪造境内 IP 头 ===')
  console.log('（基线为占位片段；若伪造境内 IP 后变成完整歌曲，说明可用请求头绕过）\n')

  const map = {
    'X-Forwarded-For': 'xff',
    'X-Real-IP': 'realip',
    'Client-IP': 'clientip',
    Referer: 'referer',
    'User-Agent': 'ua',
  }

  for (const [label, extra] of HEADER_CASES) {
    const params = Object.entries(extra)
      .map(([h, v]) => `&${map[h]}=${encodeURIComponent(v)}`)
      .join('')
    const url =
      `${WORKER}/api/unblock/kuwo?debug=1&skipValidate=1&raw=1` +
      `&keyword=${encodeURIComponent('灰姑娘-梁咏琪')}${params}`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
      const j = await res.json()
      const bytes = j.url ? await sizeOf(j.url) : 0
      const tail = j.url ? j.url.split('/').slice(-1)[0].slice(0, 30) : '-'
      console.log(
        `  ${verdict(j.url, bytes)}  ${label.padEnd(24)} ${fmt(bytes).padStart(9)}  ${tail}`,
      )
    } catch (e) {
      console.log(`  💥  ${label.padEnd(24)} ${e.message}`)
    }
  }
}

;(async () => {
  const mode = process.argv[2] || 'both'
  if (mode === 'local' || mode === 'both') await runLocal()
  if (mode === 'cloudflare' || mode === 'both') await runCloudflare()

  console.log('\n结论：若 A 中伪造境外 IP 仍是完整歌曲、且 B 中伪造境内 IP 仍是占位片段，')
  console.log('      则酷我仅按真实 TCP 出口 IP 判定，请求头无法绕过。')
})()
