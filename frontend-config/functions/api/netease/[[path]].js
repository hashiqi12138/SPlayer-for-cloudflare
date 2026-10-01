/**
 * Pages Functions: /api/netease/*
 *
 * 将前端的 /api/netease/xxx 请求转发到 API Worker
 *
 * 走 Service Binding（env.API_WORKER）而不是公网 fetch()
 * ------------------------------------------------------
 * Pages Functions 的请求与 Workers 请求共用同一个日额度池（免费版 10 万次/天）。
 * 这里若用全局 fetch() 去请求 Worker 的公网地址，一次前端调用就要计两次：
 * 本函数 1 次 + 目标 Worker 1 次，等于把可用次数砍半。
 * 改用绑定后调用不经过公网、不额外计费，一次调用只计 1 次。
 * 绑定在 frontend-config/pages.wrangler.toml 里声明。
 *
 * 关于仍然保留 API_WORKER_URL：
 * 它是**目标 Worker 看到的 request.url**，绑定只改变传输方式、不改 URL。
 * 之所以不换成内部假域名，是为了让下游拿到的 Origin / 协议与线上一致
 * （workers/api 的适配层会读 url.protocol 判断是否 https）。
 */

// ====== 配置区 ======
// API Worker 地址。此处使用占位符，由 scripts/prepare-pages.mjs 在复制到
// splayer-frontend/functions 时，按根目录 deploy.config.json 的值替换。
// 请不要直接改成真实地址，否则就失去了「单一配置源」的意义。
const API_WORKER_URL = '__API_WORKER_URL__'

export async function onRequest(context) {
  const { request, env, params } = context
  const url = new URL(request.url)

  // 获取路径参数
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path

  // 健康检查
  if (!path || path === '') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        service: 'pages-api-proxy',
        target: API_WORKER_URL,
        via: 'service-binding:API_WORKER',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // 构建目标 URL
  const targetUrl = `${API_WORKER_URL}/${path}${url.search}`

  // 构建新请求头（移除 host 等）
  const newHeaders = new Headers(request.headers)
  newHeaders.delete('host')

  // 添加真实 IP
  const clientIP = request.headers.get('cf-connecting-ip')
  if (clientIP) {
    newHeaders.set('X-Real-IP', clientIP)
    newHeaders.set('X-Forwarded-For', clientIP)
  }

  try {
    // 转发请求（Service Binding：不经过公网，不额外计入请求配额）
    const response = await env.API_WORKER.fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    })

    // 复制响应头，添加 CORS
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('Access-Control-Allow-Origin', url.origin)
    responseHeaders.set('Access-Control-Allow-Credentials', 'true')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        code: 502,
        msg: 'API Proxy Error',
        error: error.message,
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }
}
