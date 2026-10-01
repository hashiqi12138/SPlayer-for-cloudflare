/**
 * api-enhanced Cloudflare Worker 适配器
 *
 * 将网易云音乐 API (api-enhanced) 适配到 Cloudflare Workers 环境
 *
 * ⚠️ 实验性功能 - 需要逐步验证和调试
 *
 * 技术栈：
 * - Cloudflare Workers + Node.js 兼容模式 (nodejs_compat_v2)
 * - Express.js 运行在 Workers 边缘节点
 * - 使用 http.Server + 手动 emit request 事件的适配方式
 */

import { applyAllPolyfills } from './polyfills.js'
import { registerModules } from './module-router.js'
import { registerGeneratedRoutes } from './generated-routes.js'
import { registerUnblockRoutes } from './unblock/index.js'

// 应用 Workers 环境 polyfills
applyAllPolyfills()

// ============================================================
// Node.js 模块导入
// ============================================================
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import express from 'express'

// ============================================================
// Express 应用
// ============================================================

function createExpressApp() {
  const app = express()

  app.set('trust proxy', true)

  // ---- CORS ----
  app.use((req, res, next) => {
    if (req.path !== '/' && !req.path.includes('.')) {
      res.set({
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Headers': 'X-Requested-With,Content-Type',
        'Access-Control-Allow-Methods': 'PUT,POST,GET,DELETE,OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
      })
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end()
    } else {
      next()
    }
  })

  // ---- Cookie parser ----
  app.use((req, _res, next) => {
    req.cookies = {}
    const cookieHeader = req.headers.cookie
    if (cookieHeader) {
      // 必须按单个 `;` 切分：前端下发的 cookie 形如 `MUSIC_U=xxx;os=pc;`，
      // 分号后没有空格。若按 `; ` 切分，整串会被当成一个键，
      // MUSIC_U 的值会连上 `;os=pc;` 一起被 encodeURIComponent 编码后发给网易云，
      // 登录态随之失效（表现为会员歌曲返回 code 404）。
      for (const pair of String(cookieHeader).split(';')) {
        const crack = pair.indexOf('=')
        if (crack < 1) continue
        const key = pair.slice(0, crack).trim()
        const value = pair.slice(crack + 1).trim()
        if (!key) continue
        try {
          req.cookies[decodeURIComponent(key)] = decodeURIComponent(value)
        } catch (e) {
          req.cookies[key] = value
        }
      }
    }
    next()
  })

  // ---- Body parser ----
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: false, limit: '10mb' }))

  // ---- 文件上传占位 ----
  app.use((req, _res, next) => {
    req.files = req.files || {}
    next()
  })

  // ============================================================
  // 注册 API 模块路由
  // ============================================================
  // 手动适配的复杂/特殊接口（优先注册，确保正确）
  registerModules(app)

  // 解锁（解灰）接口：/api/unblock/*
  registerUnblockRoutes(app)

  // 自动生成的 351 个简单接口（补充）
  registerGeneratedRoutes(app)

  // 首页
  app.get('/', (_req, res) => {
    res.json({
      code: 200,
      msg: 'NeteaseCloudMusic API Enhanced - Cloudflare Workers Edition',
      version: '4.40.1-cf-worker',
      docs: 'https://neteasecloudmusicapienhanced.js.org/',
      status: '运行中 (api 明文模式)',
      note: '加密接口(eapi/weapi 等)降级为 api 模式，部分接口可能不可用',
      endpoints: {
        health: '/health',
        banner: '/banner',
        search: '/search?keywords=周杰伦',
        playlist_detail: '/playlist/detail?id=1',
        song_detail: '/song/detail?ids=347230',
        song_url: '/song/url?id=347230',
        lyric: '/lyric?id=347230',
      },
    })
  })

  // 404
  app.use((req, res) => {
    res.status(404).json({
      code: 404,
      msg: 'Not Found',
      path: req.path,
      hint: '请参考首页的 endpoints 列表',
    })
  })

  return app
}

// ============================================================
// Express ↔ Workers 适配层
//
// 核心思路：
// 1. 创建一个 http.Server（不 listen）
// 2. 将 Web Request 转换为 Node.js 可读流
// 3. 通过 server.emit('request', req, res) 触发 Express 处理
// 4. 收集 ServerResponse 的输出，转为 Web Response
// ============================================================

let _server = null
let _app = null

async function getServer() {
  if (!_server) {
    _app = createExpressApp()
    _server = createServer(_app)
    // 不调用 listen，我们手动 emit request 事件
  }
  return { server: _server, app: _app }
}

/**
 * 核心适配：Web Request → Express → Web Response
 *
 * 使用 http.IncomingMessage 和 http.ServerResponse 的标准方式
 */
async function webRequestToExpress(request) {
  const { server } = await getServer()
  const url = new URL(request.url)

  // ---- 准备请求体 ----
  // Workers 的 http.IncomingMessage._read 只会从 this.socket 拉取数据，
  // 而适配层把 socket 替换成了普通对象，所以传入的流不会被读取。
  // 因此先整体读入内存，再手动 push 进 IncomingMessage，
  // 这样 express.json() / urlencoded() 才能拿到 req.body。
  let bodyBuffer = null
  if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
    bodyBuffer = Buffer.from(await request.arrayBuffer())
  }

  return new Promise((resolve, reject) => {
    try {
      // ---- 构造 IncomingMessage ----
      const sourceStream = new Readable({
        read() {
          this.push(null)
        },
      })
      const req = new IncomingMessage(sourceStream)

      // Workers 中 IncomingMessage.socket 是只读 getter，
      // 需要用 Object.defineProperty 覆盖，否则 ServerResponse 构造时会报错。
      // readable/read 必须存在：body-parser 通过 on-finished.isFinished() 判断
      // 请求是否已结束，而它对 IncomingMessage 的判断是 `!socket.readable`，
      // 缺少 readable 会让所有 POST body 被误判为"已解析"而跳过解析。
      let _socket = {
        remoteAddress: request.headers.get('cf-connecting-ip') || '127.0.0.1',
        remotePort: 0,
        encrypted: url.protocol === 'https:',
        readable: true,
        writable: true,
        destroyed: false,
        read() {},
      }
      Object.defineProperty(req, 'socket', {
        value: _socket,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(req, 'connection', {
        value: _socket,
        writable: true,
        configurable: true,
      })

      req.method = request.method
      req.url = url.pathname + url.search
      req.httpVersionMajor = 1
      req.httpVersionMinor = 1
      req.httpVersion = '1.1'

      // Headers
      for (const [key, value] of request.headers.entries()) {
        req.headers[key.toLowerCase()] = value
      }

      // rawHeaders
      const rawHeaders = []
      for (const [key, value] of request.headers.entries()) {
        rawHeaders.push(key, value)
      }
      req.rawHeaders = rawHeaders

      // ---- 构造 ServerResponse ----
      const res = new ServerResponse(req)

      // ---- 收集响应 ----
      const chunks = []
      let finalStatus = 200
      let finalHeaders = {}
      let ended = false

      // 拦截 writeHead
      const origWriteHead = res.writeHead
      res.writeHead = function (status, reason, headers) {
        finalStatus = status
        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            finalHeaders[k.toLowerCase()] = v
          }
        }
        return origWriteHead.call(res, status, reason, headers)
      }

      // 拦截 write
      const origWrite = res.write
      res.write = function (chunk, encoding, cb) {
        if (typeof encoding === 'function') {
          cb = encoding
          encoding = undefined
        }
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8'))
        }
        if (cb) process.nextTick(cb)
        return true
      }

      // 拦截 end
      const origEnd = res.end
      res.end = function (chunk, encoding, cb) {
        if (ended) return
        ended = true

        if (typeof chunk === 'function') {
          cb = chunk
          chunk = undefined
        } else if (typeof encoding === 'function') {
          cb = encoding
          encoding = undefined
        }

        if (chunk) {
          if (typeof chunk === 'string') chunks.push(Buffer.from(chunk, encoding || 'utf8'))
          else if (Buffer.isBuffer(chunk)) chunks.push(chunk)
          else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk))
        }

        // 收集最终 headers
        const resHeaders = res.getHeaders()
        for (const [k, v] of Object.entries(resHeaders)) {
          if (!(k.toLowerCase() in finalHeaders)) {
            finalHeaders[k.toLowerCase()] = v
          }
        }

        // ---- 构造 Web Response ----
        const body = chunks.length > 0 ? Buffer.concat(chunks) : null
        const webHeaders = new Headers()

        for (const [key, value] of Object.entries(finalHeaders)) {
          if (Array.isArray(value)) {
            for (const v of value) webHeaders.append(key, String(v))
          } else {
            webHeaders.set(key, String(value))
          }
        }

        // Express/Node 会把状态写入 res.statusCode；writeHead 拦截在 Workers
        // 的 ServerResponse 实现下不一定被触发，因此以 res.statusCode 为准
        const status = res.statusCode >= 200 && res.statusCode <= 599 ? res.statusCode : finalStatus
        // 204/205/304 不允许携带响应体，否则 Response 构造会抛错
        const finalBody = status === 204 || status === 205 || status === 304 ? null : body

        resolve(
          new Response(finalBody, {
            status,
            headers: webHeaders,
          }),
        )

        if (cb) process.nextTick(cb)
        return res
      }

      // ---- 灌入请求体并结束流 ----
      // 必须在 emit 之前 push，数据会先进入可读缓冲，
      // 待 body-parser 订阅 data 事件后按流式吐出。
      if (bodyBuffer && bodyBuffer.length > 0) {
        req.push(bodyBuffer)
      }
      req.push(null)

      // ---- 触发 Express 处理 ----
      server.emit('request', req, res)
    } catch (error) {
      reject(error)
    }
  })
}

// ============================================================
// Worker 主入口
// ============================================================

export default {
  async fetch(request, env, ctx) {
    globalThis.CF_ENV = env

    try {
      return await webRequestToExpress(request)
    } catch (error) {
      console.error('[Worker Error]', error)
      return new Response(
        JSON.stringify({
          code: 500,
          msg: 'Worker Internal Error',
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 5).join('\n'),
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      )
    }
  },
}
