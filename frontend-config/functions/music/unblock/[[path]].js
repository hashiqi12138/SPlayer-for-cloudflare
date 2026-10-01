/**
 * Pages Functions: /music/unblock/*
 * 
 * 将前端的 /music/unblock/xxx 请求转发到音乐代理 Worker
 * 也可以直接用 Cloudflare Workers Route 配置
 * 
 * 使用方式：
 * 1. 将此文件复制到 SPlayer 项目的 functions/music/unblock/[[path]].js
 * 2. 修改 PROXY_WORKER_URL 为你的音乐代理 Worker 地址
 * 3. 部署到 Pages
 */

// ====== 配置区 ======
// 你的音乐代理 Worker 地址
const PROXY_WORKER_URL = "https://music-proxy.xxx.workers.dev";

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);
  
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  
  if (!path) {
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'music-proxy-pages-function',
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 构建目标 URL
  const targetUrl = `${PROXY_WORKER_URL}/${path}${url.search}`;
  
  // 复制请求头
  const newHeaders = new Headers(request.headers);
  newHeaders.delete('host');
  
  try {
    // 流式转发（支持 Range 请求）
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });
    
    // 复制响应头
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      code: 502,
      msg: 'Music Proxy Error',
      error: error.message,
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
