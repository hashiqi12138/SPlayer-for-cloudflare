/**
 * 出站 HTTP 传输层（可切换）
 *
 * 为什么需要这一层
 * ----------------
 * 网易云对 `song/enhance/player/url` 系列有一道「出口 IP」判定：
 * 只要请求里没有可信的中国大陆 IP，就返回 `code 404`（无版权/无直链），
 * 前端表现是「能搜到歌，但一按播放就没声」。
 *
 * 上游 api-enhanced 的对策是在 `X-Real-IP` 里塞一个中国 IP（见 server.js 的
 * `randomCNIP` / `global.cnIp`），服务端认这个头。
 *
 * 但 Cloudflare Workers 的 `fetch()` 出站子请求会把 `x-real-ip` 摘掉 ——
 * 官方文档写得很明白：Cloudflare removes the `x-real-ip` header before the
 * request reaches your origin server, including when a Worker sets it on a
 * fetch() subrequest.
 * （https://developers.cloudflare.com/rules/transform/request-header-modification/）
 *
 * 所以走 fetch() 的版本在线上永远是 404，本地 wrangler dev 却能放歌 —— 这个差异
 * 极难从代码上看出来。
 *
 * 解法：用 `cloudflare:sockets` 自己写 HTTP/1.1 报文，直连 443。
 * sockets 建立的是普通 TLS 连接，不经过 fetch 的头部清洗，`X-Real-IP` 能原样送达
 * （已实测：同一份 eapi 报文，走 socket 带 X-Real-IP 得到 code 200 + 直链，
 * 走 fetch 得到 code 404）。
 *
 * 设计
 * ----
 * - 默认仍走 `fetch()`：离线单测把 `globalThis.fetch` 换成探针，这条路径必须保持可测。
 * - Worker 入口（index.js）启动时调用 `useSocketTransport()` 切到 socket 实现。
 * - 两种实现都返回标准 `Response`，调用方（ncm-request-handler.js）无需分支。
 */

import zlib from 'node:zlib'

/** 当前生效的实现，默认是 fetch */
let httpFetchImpl = (url, init) => fetch(url, init)

/** 切换实现（供 Worker 入口与单测使用） */
export function setHttpFetch(fn) {
  httpFetchImpl = fn
}

/** 统一的出站调用入口 */
export function httpFetch(url, init) {
  return httpFetchImpl(url, init)
}

/** 当前是否已切到 socket 传输（诊断用） */
let socketActive = false
export function isSocketTransportActive() {
  return socketActive
}

// ============================================================
// socket 实现
// ============================================================

const DEFAULT_PORTS = { 'http:': 80, 'https:': 443 }

/**
 * 解析 URL，得到 host / port / path / 是否 TLS
 */
function parseTarget(url) {
  const u = new URL(url)
  const isHttps = u.protocol === 'https:'
  return {
    host: u.hostname,
    port: Number(u.port) || DEFAULT_PORTS[u.protocol] || (isHttps ? 443 : 80),
    path: `${u.pathname}${u.search}`,
    isHttps,
    hostHeader: u.host,
  }
}

/**
 * 把 HeadersInit 归一成 [name, value][]，保留重复项（例如多个 Set-Cookie 发送侧不需要，
 * 但 Cookie 只有一个；这里保留顺序即可）
 */
function normalizeHeaders(headers) {
  const pairs = []
  if (!headers) return pairs
  if (typeof headers.forEach === 'function' && !Array.isArray(headers)) {
    // Headers 实例
    headers.forEach((value, key) => pairs.push([key, String(value)]))
    return pairs
  }
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) pairs.push([String(k), String(v)])
    return pairs
  }
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || v === null) continue
    pairs.push([String(k), String(v)])
  }
  return pairs
}

/** chunked 解码 */
function decodeChunked(buf) {
  const out = []
  let pos = 0
  while (pos < buf.length) {
    const lineEnd = buf.indexOf('\r\n', pos)
    if (lineEnd < 0) break
    const sizeLine = buf.slice(pos, lineEnd).toString('latin1').trim()
    const size = parseInt(sizeLine.split(';')[0], 16)
    if (!size || Number.isNaN(size)) break
    out.push(buf.slice(lineEnd + 2, lineEnd + 2 + size))
    pos = lineEnd + 2 + size + 2
  }
  return Buffer.concat(out)
}

/** 按 Content-Encoding 解压（fetch 会自动解，socket 不会） */
function decodeBody(buf, contentEncoding) {
  const ce = String(contentEncoding || '')
    .toLowerCase()
    .trim()
  if (!ce || ce === 'identity') return buf
  try {
    if (ce.includes('gzip')) return zlib.gunzipSync(buf)
    if (ce.includes('deflate')) {
      try {
        return zlib.inflateSync(buf)
      } catch (e) {
        return zlib.inflateRawSync(buf)
      }
    }
    if (ce.includes('br')) return zlib.brotliDecompressSync(buf)
    if (ce.includes('zstd')) return zlib.zstdDecompressSync(buf)
  } catch (e) {
    // 解压失败就把原始字节交给上层（上层多半按 JSON 解析失败后原样返回）
  }
  return buf
}

/**
 * 用 cloudflare:sockets 发一个 HTTP/1.1 请求，返回标准 Response。
 *
 * 只做我们真正需要的那一小块：单次请求、Connection: close、不跟随重定向
 * （重定向交给调用方判断，行为和 fetch 的 redirect: 'manual' 接近）。
 */
export async function socketFetch(url, init = {}) {
  const { connect } = await import('cloudflare:sockets')
  const target = parseTarget(url)
  const method = (init.method || 'GET').toUpperCase()

  // 请求体
  let bodyBuf = Buffer.alloc(0)
  if (init.body !== undefined && init.body !== null) {
    const b = init.body
    if (typeof b === 'string') bodyBuf = Buffer.from(b, 'utf8')
    else if (b instanceof Uint8Array) bodyBuf = Buffer.from(b)
    else if (b instanceof ArrayBuffer) bodyBuf = Buffer.from(new Uint8Array(b))
    else bodyBuf = Buffer.from(String(b), 'utf8')
  }

  // 头部
  const headerPairs = normalizeHeaders(init.headers)
  const has = (name) => headerPairs.some(([k]) => k.toLowerCase() === name)
  const finalPairs = []
  // Host 必须由我们写，避免出现重复 Host
  finalPairs.push(['Host', target.hostHeader])
  for (const [k, v] of headerPairs) {
    const lower = k.toLowerCase()
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue
    finalPairs.push([k, v])
  }
  if (bodyBuf.length > 0 && !has('content-length') && !has('transfer-encoding')) {
    finalPairs.push(['Content-Length', String(bodyBuf.length)])
  }
  // 让服务端别压缩：省一次解压，也避免 br 在个别运行时里不可用
  if (!has('accept-encoding')) finalPairs.push(['Accept-Encoding', 'identity'])
  finalPairs.push(['Connection', 'close'])

  const head =
    `${method} ${target.path} HTTP/1.1\r\n` +
    finalPairs.map(([k, v]) => `${k}: ${v}`).join('\r\n') +
    '\r\n\r\n'

  const socket = connect(
    { hostname: target.host, port: target.port },
    {
      secureTransport: target.isHttps ? 'on' : 'off',
      // 必须允许半开：服务端发完响应就关，但我们还要读完剩余字节
      allowHalfOpen: true,
    },
  )
  await socket.opened

  const writer = socket.writable.getWriter()
  const payload = Buffer.concat([Buffer.from(head, 'utf8'), bodyBuf])
  await writer.write(new Uint8Array(payload))
  try {
    writer.releaseLock()
  } catch (e) {
    /* 忽略 */
  }

  const reader = socket.readable.getReader()
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(Buffer.from(value))
  }
  try {
    reader.releaseLock()
  } catch (e) {
    /* 忽略 */
  }

  const raw = Buffer.concat(chunks)
  const sep = raw.indexOf('\r\n\r\n')
  if (sep < 0) {
    throw new Error(`socket transport: malformed response from ${target.host}`)
  }
  const headText = raw.slice(0, sep).toString('latin1')
  let bodyBytes = raw.slice(sep + 4)

  const headLines = headText.split('\r\n')
  const statusLine = headLines[0] || ''
  const statusMatch = statusLine.match(/^HTTP\/\d\.\d\s+(\d{3})/)
  const status = statusMatch ? Number(statusMatch[1]) : 0

  const responseHeaders = new Headers()
  for (const line of headLines.slice(1)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const name = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    try {
      responseHeaders.append(name, value)
    } catch (e) {
      /* 非法头忽略 */
    }
  }

  const transferEncoding = (responseHeaders.get('transfer-encoding') || '').toLowerCase()
  if (transferEncoding.includes('chunked')) {
    bodyBytes = decodeChunked(bodyBytes)
  }
  bodyBytes = decodeBody(bodyBytes, responseHeaders.get('content-encoding'))

  // 解压后原来的 Content-Encoding / Content-Length 已不成立，去掉以免误导
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  responseHeaders.delete('transfer-encoding')

  // HEAD / 204 / 304 不带响应体
  const noBody = method === 'HEAD' || status === 204 || status === 205 || status === 304
  return new Response(noBody ? null : new Uint8Array(bodyBytes), {
    status,
    headers: responseHeaders,
  })
}

/**
 * 启用 socket 传输。
 *
 * 只有显式带 `_socket: true` 的请求才走 socket —— 也就是**播放链路**那几条需要
 * `X-Real-IP` 的接口。其余接口继续用普通 fetch()：
 *   - 它们不需要这个头（网易云只对 song/enhance/player|download/url 做地区判定）
 *   - fetch() 有 Cloudflare 的连接复用与重试，比手写报文稳
 *   - 少一条自维护的协议栈路径，出问题的面就小
 *
 * 降级：`wrangler dev` 的本地 workerd 对 `cloudflare:sockets` 支持不完整，读响应时
 * 会报 "Network connection lost."。生产没有这个问题，但本地开发不该因此瘫掉，
 * 所以失败后回落到 fetch()（本地出口 IP 本来就是可用地区，放歌不受影响）。
 */
export function useSocketTransport() {
  socketActive = true
  setHttpFetch(async (url, init = {}) => {
    if (!init._socket) return fetch(url, init)

    let lastErr = null
    for (let attempt = 0; attempt < SOCKET_ATTEMPTS; attempt++) {
      try {
        return await socketFetch(url, init)
      } catch (err) {
        lastErr = err
      }
    }

    if (!socketFallbackWarned) {
      socketFallbackWarned = true
      console.warn(
        '[transport] socket 传输失败，已回落到 fetch()：',
        lastErr && lastErr.message ? lastErr.message : String(lastErr),
      )
    }
    const { _socket, ...plainInit } = init
    return fetch(url, plainInit)
  })
}

/** socket 单次请求的重试次数（上游偶发连接抖动，重试一次通常就好） */
const SOCKET_ATTEMPTS = 2

let socketFallbackWarned = false
