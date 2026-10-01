/**
 * ncm-source/util/logger.js 的 Workers 替代实现
 *
 * 原实现依赖 ANSI 颜色转义，在 Workers 日志里没有意义；
 * 这里保留同名方法，直接转发到 console。
 */
const logger = {
  debug: (msg, ...args) => console.log('[DEBUG]', msg, ...args),
  info: (msg, ...args) => console.log('[INFO]', msg, ...args),
  warn: (msg, ...args) => console.warn('[WARN]', msg, ...args),
  error: (msg, ...args) => console.error('[ERROR]', msg, ...args),
  success: (msg, ...args) => console.log('[SUCCESS]', msg, ...args),
  critical: (msg, ...args) => console.error('[CRITICAL]', msg, ...args),
};

export default logger;