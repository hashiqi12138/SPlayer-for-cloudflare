/**
 * NCM API 请求处理器 - Cloudflare Workers 适配版
 * 
 * 基于 api-enhanced/util/request.js 移植
 * 
 * 目前支持的加密模式：
 * - api: 明文模式（最简单，用于验证基础链路）
 * - eapi: 待移植
 * - weapi: 待移植
 * - linuxapi: 待移植
 * - xeapi: 待移植
 * - neapi: 待移植
 * 
 * 主要改动：
 * - axios → fetch（Workers 原生支持）
 * - http/https agent → 移除（Workers 自动管理连接）
 * - 代理功能 → 移除（Workers 环境不需要）
 * - fs 文件读取 → 适配 Workers 只读 fs
 * - os.tmpdir → 内存存储
 */

import CryptoJS from 'crypto-js';
import { eapi, eapiResDecrypt, weapi, linuxapi } from './ncm-crypto.js';

// 内联配置
const APP_CONF = {
  apiDomain: 'https://interface.music.163.com',
  eapiDomain: 'https://interfacepc.music.163.com',
  xeapiDomain: 'https://interface3.music.163.com',
  neapiDomain: 'https://interface3.music.163.com',
  domain: 'https://music.163.com',
  encrypt: true,
  encryptResponse: false,
};

// ============================================================
// 常量
// ============================================================
const DOMAIN = APP_CONF.domain;
const API_DOMAIN = APP_CONF.apiDomain;
const EAPI_DOMAIN = APP_CONF.eapiDomain;
const XEAPI_DOMAIN = APP_CONF.xeapiDomain;
const NEAPI_DOMAIN = APP_CONF.neapiDomain;
const ENCRYPT_RESPONSE = APP_CONF.encryptResponse;

// 全局变量（Workers 单例，注意并发安全）
let anonymousToken = '';
let deviceId = '';

// 初始化 deviceId
function initDeviceId() {
  if (!deviceId) {
    const chars = 'abcdef0123456789';
    let id = '';
    for (let i = 0; i < 32; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    deviceId = id;
  }
  return deviceId;
}

initDeviceId();

// 设置匿名 token
export function setAnonymousToken(token) {
  anonymousToken = token;
}

export function getAnonymousToken() {
  return anonymousToken;
}

// ============================================================
// 工具函数
// ============================================================
function cookieToJson(cookieStr) {
  if (!cookieStr) return {};
  const result = {};
  String(cookieStr).split(/;\s*/).forEach(pair => {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 1) return;
    try {
      const key = decodeURIComponent(pair.slice(0, eqIdx).trim());
      const value = decodeURIComponent(pair.slice(eqIdx + 1).trim());
      result[key] = value;
    } catch (e) {
      // ignore
    }
  });
  return result;
}

function cookieObjToString(cookieObj) {
  const parts = [];
  for (const [key, value] of Object.entries(cookieObj)) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join('; ');
}

function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const WNMCID = (function () {
  const randomString = generateRandomString(6);
  return `${randomString}.${Date.now().toString()}.01.0`;
})();

const osMap = {
  pc: {
    os: 'pc',
    appver: '3.1.17.204416',
    osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
    channel: 'netease',
  },
  android: {
    os: 'android',
    appver: '8.20.20.231215173437',
    osver: '14',
    channel: 'xiaomi',
  },
  iphone: {
    os: 'iPhone OS',
    appver: '9.0.90',
    osver: '16.2',
    channel: 'distribution',
  },
};

const userAgentMap = {
  weapi: {
    pc: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  },
  api: {
    pc: 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.29.205117',
    android: 'NeteaseMusic/9.5.61.260802021928(9005061);Dalvik/2.1.0 (Linux; U; Android 12; HBN-AL00 Build/cd737a2.0)',
    iphone: 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)',
  },
};

function chooseUserAgent(crypto, uaType = 'pc') {
  return (userAgentMap[crypto] && userAgentMap[crypto][uaType]) || '';
}

function processCookieObject(cookie, crypto) {
  const _ntes_nuid = CryptoJS.lib.WordArray.random(32).toString();
  const os = osMap[cookie.os] || osMap.pc;

  const processed = {
    ...cookie,
    __remember_me: 'true',
    ntes_kaola_ad: '1',
    _ntes_nuid: cookie._ntes_nuid || _ntes_nuid,
    _ntes_nnid: cookie._ntes_nnid || `${_ntes_nuid},${Date.now().toString()}`,
    WNMCID: cookie.WNMCID || WNMCID,
    WEVNSM: cookie.WEVNSM || '1.0.0',
    osver: cookie.osver || os.osver,
    deviceId: cookie.deviceId || deviceId,
    os: cookie.os || os.os,
    channel: cookie.channel || os.channel,
    appver: cookie.appver || os.appver,
  };

  if (!processed.MUSIC_U && anonymousToken) {
    processed.MUSIC_A = cookie.MUSIC_A || anonymousToken;
  }

  return processed;
}

// ============================================================
// 核心请求函数
// ============================================================

export async function createRequest(uri, data, options = {}) {
  const answer = { status: 500, body: {}, cookie: [] };
  // 在 try 外声明，catch 中才能引用到（便于错误定位）
  let url = '';
  let bodyData = null;

  try {
    const headers = options.headers ? { ...options.headers } : {};
    const ip = options.realIP || options.ip || '';
    
    // IP 头
    if (ip) {
      headers['X-Real-IP'] = ip;
      headers['X-Forwarded-For'] = ip;
    }
    
    // 加密方式
    let crypto = options.crypto;
    if (crypto === '') {
      crypto = APP_CONF.encrypt ? 'eapi' : 'api';
    }
    
    // Cookie 处理
    let cookie = options.cookie || {};
    if (typeof cookie === 'string') {
      cookie = cookieToJson(cookie);
    }
    if (typeof cookie === 'object') {
      cookie = processCookieObject(cookie, crypto);
      headers['Cookie'] = cookieObjToString(cookie);
    }
    
    const csrfToken = cookie['__csrf'] || '';
    
    data.e_r = options.e_r !== undefined
      ? options.e_r
      : (data.e_r !== undefined ? data.e_r : ENCRYPT_RESPONSE);
    
    switch (crypto) {
      case 'api':
        // 明文模式
        headers['User-Agent'] = options.ua || chooseUserAgent('api', 'pc');
        url = (options.domain || API_DOMAIN) + uri;
        bodyData = new URLSearchParams(data).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=utf-8';
        break;
      
      case 'eapi':
        // Electron 端加密（最常用）
        headers['User-Agent'] = options.ua || chooseUserAgent('api', 'pc');
        headers['Referer'] = options.domain || DOMAIN;
        
        // eapi 加密
        const eapiData = eapi(uri, data);
        bodyData = new URLSearchParams(eapiData).toString();
        url = (options.domain || EAPI_DOMAIN) + '/eapi/' + uri.substr(5);
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=utf-8';
        break;
      
      case 'weapi':
        // Web 端加密（登录等用）
        headers['Referer'] = options.domain || DOMAIN;
        headers['User-Agent'] = options.ua || chooseUserAgent('weapi');
        
        data.csrf_token = csrfToken;
        // checkToken 暂时跳过（反作弊 token，大部分接口不需要）
        // if (options.checkToken) {
        //   headers['X-antiCheatToken'] = token;
        // }
        
        // weapi 加密
        const weapiData = weapi(data);
        bodyData = new URLSearchParams(weapiData).toString();
        url = (options.domain || DOMAIN) + '/weapi/' + uri.substr(5);
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=utf-8';
        break;
      
      case 'linuxapi':
        // Linux 端加密
        headers['User-Agent'] = options.ua || chooseUserAgent('linuxapi', 'linux');
        
        const linuxData = linuxapi({
          method: 'POST',
          url: (options.domain || DOMAIN) + uri,
          params: data,
        });
        bodyData = new URLSearchParams(linuxData).toString();
        url = (options.domain || DOMAIN) + '/api/linux/forward';
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=utf-8';
        break;
      
      case 'xeapi':
      case 'neapi':
        // 复杂加密，暂时降级到 eapi
        console.warn(`[request] ${crypto} mode not fully implemented, using eapi fallback`);
        headers['User-Agent'] = options.ua || chooseUserAgent('api', 'pc');
        const fallbackData = eapi(uri, data);
        bodyData = new URLSearchParams(fallbackData).toString();
        url = (options.domain || EAPI_DOMAIN) + '/eapi/' + uri.substr(5);
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=utf-8';
        break;
      
      default:
        console.log('[ERR] Unknown Crypto:', crypto);
        throw new Error(`Unknown crypto: ${crypto}`);
    }
    
    // 是否需要解密响应
    const use_e_r = (crypto === 'eapi' || crypto === 'weapi') && data.e_r;
    const use_xeapi = crypto === 'xeapi';
    const use_neapi = crypto === 'neapi';
    
    // 发送请求（使用 fetch 替代 axios）
    const fetchOptions = {
      method: 'POST',
      headers: headers,
      body: bodyData,
      // Workers fetch 自动管理连接池，不需要 agent
    };
    
    // 超时处理（Workers 有自己的超时机制）
    // if (options.timeout > 0) { ... }
    
    const response = await fetch(url, fetchOptions);
    
    // 获取 Set-Cookie
    // Workers 的 Headers.get('set-cookie') 会把多个 Set-Cookie 用逗号拼成一串，
    // 而 cookie 的 Expires 属性自身就含逗号，无法按逗号安全拆分，
    // 因此必须用 getAll('set-cookie') / getSetCookie() 取原始数组（对应 Node 端的 set-cookie 数组）
    const rawSetCookies = (() => {
      const h = response.headers;
      try {
        if (typeof h.getAll === 'function') {
          const list = h.getAll('set-cookie');
          if (Array.isArray(list)) return list;
        }
        if (typeof h.getSetCookie === 'function') {
          const list = h.getSetCookie();
          if (Array.isArray(list)) return list;
        }
      } catch (e) {
        // getAll 对非 Set-Cookie 头会抛错，回退到 get
      }
      const single = h.get('set-cookie');
      return single ? [single] : [];
    })();
    if (rawSetCookies.length > 0) {
      // 去掉 Domain 属性（浏览器端按当前域写入），并清理尾部多余分号
      // 字符类排除逗号，避免误吞相邻 cookie
      const cleanCookie = (x) =>
        x.replace(/\s*Domain=[^;,]+;?/gi, '').replace(/;\s*$/, '').trim();
      answer.cookie = rawSetCookies.map(cleanCookie).filter(Boolean);
    }
    
    // 解析响应
    const contentType = response.headers.get('content-type') || '';
    let body;
    
    // 如果是加密响应，需要先解密
    if (use_e_r) {
      // eapi/weapi 加密响应
      const responseText = await response.text();
      try {
        // eapi 响应解密
        const decrypted = eapiResDecrypt(responseText, false);
        if (decrypted) {
          body = decrypted;
        } else {
          // 解密失败，尝试直接解析
          body = JSON.parse(responseText);
        }
      } catch (e) {
        try {
          body = JSON.parse(responseText);
        } catch (e2) {
          body = responseText;
        }
      }
    } else if (use_xeapi || use_neapi) {
      // xeapi/neapi 加密响应，暂不支持解密
      const responseText = await response.text();
      try {
        body = JSON.parse(responseText);
      } catch (e) {
        body = { code: 500, msg: 'Encrypted response not supported yet', raw: responseText.slice(0, 200) };
      }
    } else if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
      try {
        body = JSON.parse(body);
      } catch (e) {
        // 不是 JSON，保持原文
      }
    }
    
    answer.body = typeof body === 'object' ? body : { code: 500, msg: 'Invalid response' };
    
    if (answer.body.code) {
      answer.body.code = Number(answer.body.code);
    }
    
    answer.status = Number(answer.body.code || response.status);
    
    // 特殊状态码处理
    const SPECIAL_STATUS_CODES = new Set([201, 302, 400, 502, 800, 801, 802, 803]);
    if (SPECIAL_STATUS_CODES.has(answer.body.code)) {
      answer.status = 200;
    }
    
    answer.status = answer.status > 100 && answer.status < 600 ? answer.status : 400;
    
    if (answer.status === 200) {
      return answer;
    } else {
      console.log('[ERR]', answer);
      throw answer;
    }
    
  } catch (err) {
    // 业务错误：NCM 返回非 200 业务码时抛出的 answer 结构
    // 原样抛出，保留原始 status / body（如 301 需要登录、404 资源不存在）
    if (err && typeof err === 'object' && err.status !== undefined && err.body !== undefined) {
      throw err;
    }
    answer.status = 502;
    // 详细记录错误
    console.error('[Request Error]', {
      uri,
      crypto: options.crypto,
      url: url || '(not set)',
      errType: typeof err,
      errMessage: err?.message,
      errStack: err?.stack?.split('\n').slice(0, 5).join(' | '),
    });
    answer.body = { 
      code: 502, 
      msg: err?.body?.msg || err?.message || String(err),
      debug: {
        crypto: options.crypto,
        url: url || '(not set)',
        errType: typeof err,
        stack: err?.stack?.split('\n').slice(0, 5).join(' | '),
      }
    };
    throw answer;
  }
}

export default createRequest;

// 兼容 CommonJS 风格调用
export function createRequestHandler(req) {
  // 返回一个绑定了请求上下文的 request 函数
  return function request(path, data, options = {}) {
    // 从 Express 请求中提取信息
    const ip = req?.ip || '';
    
    return createRequest(path, data, {
      ...options,
      ip: options.ip || ip,
    });
  };
}
