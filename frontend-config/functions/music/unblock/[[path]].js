/**
 * Pages Functions: /music/unblock/*
 *
 * 将前端的 /music/unblock/xxx 请求转发到音乐代理 Worker
 *
 * 走 Service Binding（env.MUSIC_PROXY）而不是公网 fetch()
 * -----------------------------------------------------
 * 与 api/netease 同理：公网 fetch() 会让一次调用同时消耗本函数与目标 Worker
 * 两次配额。音频这条路径的调用量不小（播放、拖动进度条、切歌都会触发），
 * 所以同样必须走绑定。绑定在 frontend-config/pages.wrangler.toml 里声明。
 */

// ====== 配置区 ======
// 音乐代理 Worker 地址（音频 CDN 代理，解决 CORS / Range 请求）。
// 占位符由 scripts/prepare-pages.mjs 按 deploy.config.json 替换。
const PROXY_WORKER_URL = '__PROXY_WORKER_URL__'

export async function onRequest(context) {
  const { request, env, params } = context
  const url = new URL(request.url)

  const path = Array.isArray(params.path) ? params.path.join('/') : params.path

  if (!path) {
    return new Response(
      JSON.stringify({
        status: 'ok',
        service: 'music-proxy-pages-function',
        via: 'service-binding:MUSIC_PROXY',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // 构建目标 URL
  const targetUrl = `${PROXY_WORKER_URL}/${path}${url.search}`

  // 复制请求头
  const newHeaders = new Headers(request.headers)
  newHeaders.delete('host')

  try {
    // 流式转发（支持 Range 请求，走 Service Binding 不额外计入请求配额）
    const response = await env.MUSIC_PROXY.fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    })

    // 复制响应头
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('Access-Control-Allow-Origin', '*')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        code: 502,
        msg: 'Music Proxy Error',
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
