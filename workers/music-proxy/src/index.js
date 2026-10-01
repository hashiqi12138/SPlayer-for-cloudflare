/**
 * 网易云音乐 CDN 代理 Worker
 * 
 * 功能：
 * - 代理网易云音乐文件下载/播放请求
 * - 解决 CORS 跨域问题
 * - 支持 Range 请求（流式播放）
 * - 支持 Web 播放器的音频流式传输
 * 
 * 部署路径：/music/unblock/*
 */

// 源站默认值。实际取值优先读环境变量（wrangler.toml 的 [vars]），
// 这样不改代码就能切换源站（例如指向自建镜像）。
// 注意：此前这里只声明了 [vars] 却在代码里写死常量，属于无效配置。
const DEFAULT_MUSIC_ORIGIN = 'https://music.163.com';
const DEFAULT_INTERFACE_ORIGIN = 'https://interface.music.163.com';

// 允许的请求路径前缀（安全限制，防止被滥用）
const ALLOWED_PATH_PREFIXES = [
  "/song/media/outer/url",
  "/weapi/song/enhance/player/url",
  "/eapi/song/enhance/player/url",
  "/api/song/enhance/player/url",
  "/im",
];

// 允许的文件扩展名
const ALLOWED_EXTENSIONS = [
  ".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a",
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
];

function isAllowedPath(pathname) {
  // 检查路径前缀
  for (const prefix of ALLOWED_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }
  // 检查文件扩展名
  const lowerPath = pathname.toLowerCase();
  for (const ext of ALLOWED_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) {
      return true;
    }
  }
  // 网易云音乐标准 CDN 路径格式
  if (pathname.includes("/song/media/") || pathname.includes("/dj/")) {
    return true;
  }
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 源站可经环境变量覆盖
    const MUSIC_ORIGIN = (env && env.MUSIC_ORIGIN) || DEFAULT_MUSIC_ORIGIN;
    const INTERFACE_ORIGIN =
      (env && env.INTERFACE_ORIGIN) || DEFAULT_INTERFACE_ORIGIN;
    
    // 健康检查
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        service: "music-proxy-worker",
        time: new Date().toISOString()
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // 去掉代理前缀（如果有的话）
    // 支持两种调用方式：
    // 1. 直接访问: worker-domain.com/song/media/outer/url?id=xxx
    // 2. 通过前缀: worker-domain.com/music/unblock/song/media/outer/url?id=xxx
    let targetPath = url.pathname;
    if (targetPath.startsWith("/music/unblock/")) {
      targetPath = targetPath.replace(/^\/music\/unblock/, "");
    }
    if (targetPath.startsWith("/music/")) {
      targetPath = targetPath.replace(/^\/music/, "");
    }

    // 安全检查：只允许代理音乐相关的路径
    if (!isAllowedPath(targetPath)) {
      return new Response(JSON.stringify({
        code: 403,
        msg: "Path not allowed",
        path: targetPath
      }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // 处理 CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, Referer, User-Agent",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    // 构建目标 URL
    // 判断是接口请求还是静态资源请求
    const isApiRequest = targetPath.includes("/weapi/") || 
                         targetPath.includes("/eapi/") || 
                         targetPath.includes("/api/") ||
                         targetPath.includes("/song/media/outer/url");
    
    const origin = isApiRequest ? INTERFACE_ORIGIN : MUSIC_ORIGIN;
    const targetUrl = `${origin}${targetPath}${url.search}`;

    // 构建转发请求头
    const newHeaders = new Headers(request.headers);
    
    // 移除可能导致问题的头
    newHeaders.delete("host");
    newHeaders.delete("origin");
    newHeaders.delete("referer");
    
    // 设置网易云需要的 Referer
    newHeaders.set("Referer", "https://music.163.com/");
    newHeaders.set("Origin", "https://music.163.com");
    
    // 设置 UA 模拟浏览器
    if (!newHeaders.get("User-Agent") || newHeaders.get("User-Agent").includes("Cloudflare")) {
      newHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    }

    try {
      // 转发请求
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        // 禁用 Cloudflare 自动缓存音频流，确保 Range 请求正常工作
        cf: {
          cacheTtl: 3600,
          cacheEverything: false,
        }
      });

      // 构建响应
      const responseHeaders = new Headers(response.headers);
      
      // 添加 CORS 头
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
      responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
      
      // 移除可能有问题的安全头
      responseHeaders.delete("content-security-policy");
      responseHeaders.delete("x-frame-options");
      responseHeaders.delete("x-content-type-options");
      
      // 确保 Range 请求的响应头正确传递
      if (response.status === 206) {
        // 部分内容（Range 请求），保持原有响应头
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });

    } catch (error) {
      return new Response(JSON.stringify({
        code: 502,
        msg: "Proxy error",
        error: error.message
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }
  }
};
