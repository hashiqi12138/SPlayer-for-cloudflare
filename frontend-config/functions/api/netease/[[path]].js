/**
 * Pages Functions: /api/netease/*
 *
 * 将前端的 /api/netease/xxx 请求转发到 API Worker
 *
 * 使用方式：
 * 1. 将此文件复制到 SPlayer 项目的 functions/api/netease/[[path]].js
 * 2. 修改 WORKER_URL 为你的 API Worker 地址
 * 3. 部署到 Pages
 */

// ====== 配置区 ======
// API Worker 地址。此处使用占位符，由 scripts/deploy-pages.ps1 在复制到
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
    // 转发请求
    const response = await fetch(targetUrl, {
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
