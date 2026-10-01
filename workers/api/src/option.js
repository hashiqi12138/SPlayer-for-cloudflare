/**
 * api-enhanced createOption 的 ESM 版本
 *
 * 对应 ncm-source/util/option.js
 * 在 Cloudflare Workers 中 process.env 由 nodejs_compat 提供
 */

const createOption = (query, crypto = '', checkToken = false) => {
  const env = (typeof process !== 'undefined' && process.env) || {}
  return {
    crypto: query.crypto || crypto || '',
    cookie: query.cookie || env.NETEASE_COOKIE,
    ua: query.ua || '',
    proxy: query.proxy,
    realIP: query.realIP,
    randomCNIP:
      env.ENABLE_RANDOM_CN_IP === 'true'
        ? !['false', false].includes(query.randomCNIP)
        : ['true', true].includes(query.randomCNIP),
    e_r: query.e_r || undefined,
    domain: query.domain || '',
    checkToken: query.checkToken || checkToken,
    headers: query.headers || {},
    timeout: query.timeout || 0,
  }
}

export default createOption
export { createOption }
