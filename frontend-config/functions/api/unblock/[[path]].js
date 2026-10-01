/**
 * Pages Functions: /api/unblock/*
 *
 * 将前端的解锁（解灰）请求转发到 API Worker。
 *
 * 路径处理说明：Worker 侧的路由本身就叫 `/api/unblock/xxx`
 * （见 workers/api/src/unblock/index.js），因此这里保留完整路径转发，
 * 不做前缀剥离。
 */

const API_WORKER_URL = 'https://ncm-api.liujieahu.workers.dev';

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);

  // [[path]] 可能是数组（多段路径）或单段
  const sub = Array.isArray(params.path) ? params.path.join('/') : params.path || '';
  const targetPath = sub ? `/api/unblock/${sub}` : '/api/unblock';

  const newHeaders = new Headers(request.headers);
  newHeaders.delete('host');

  const clientIP = request.headers.get('cf-connecting-ip');
  if (clientIP) {
    newHeaders.set('X-Real-IP', clientIP);
    newHeaders.set('X-Forwarded-For', clientIP);
  }

  try {
    const response = await fetch(`${API_WORKER_URL}${targetPath}${url.search}`, {
      method: request.method,
      headers: newHeaders,
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? request.body
          : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        code: 502,
        url: null,
        msg: 'Unblock Proxy Error',
        error: error.message,
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': url.origin,
        },
      },
    );
  }
}
