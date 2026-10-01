/**
 * ncm-source/util/index.js 的 Workers 替代实现
 *
 * 原实现用 fs 读取中国 IP 段文件（chinaIPRanges），Workers 无法读本地文件，
 * 这里改为直接随机生成 116.x 段地址（与原实现的兜底分支一致）。
 * 其余纯函数逻辑保持一致。
 */

const random = Math.random
const floor = Math.floor

function getRandomInt(min, max) {
  return floor(random() * (max - min + 1)) + min
}

function toBoolean(val) {
  if (typeof val === 'boolean') return val
  if (val === '') return val
  return val === 'true' || val == '1'
}

function cookieToJson(cookie) {
  if (!cookie) return {}
  if (typeof cookie === 'object') return cookie
  const obj = {}
  for (const item of String(cookie).split(';')) {
    const idx = item.indexOf('=')
    if (idx > 0) obj[item.slice(0, idx).trim()] = item.slice(idx + 1).trim()
  }
  return obj
}

function cookieObjToString(cookie) {
  return Object.keys(cookie)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(cookie[key])}`)
    .join('; ')
}

function getRandom(num) {
  const randomValue = random()
  const floorValue = floor(randomValue * 9 + 1)
  const powValue = Math.pow(10, num - 1)
  return floor((randomValue + floorValue) * powValue)
}

function generateRandomChineseIP() {
  return `116.${getRandomInt(25, 94)}.${getRandomInt(1, 255)}.${getRandomInt(1, 255)}`
}

function getCookieValue(cookieStr, name) {
  if (!cookieStr) return ''
  const parts = ('; ' + cookieStr).split('; ' + name + '=')
  if (parts.length === 2) return parts.pop().split(';').shift()
  return ''
}

function generateChainId(cookie) {
  const randomNum = Math.floor(Math.random() * 1e6)
  const deviceId = getCookieValue(cookie, 'sDeviceId') || 'unknown-' + randomNum
  return `v1_${deviceId}_web_login_${Date.now()}`
}

function generateDeviceId() {
  const hexChars = '0123456789ABCDEF'
  let out = ''
  for (let i = 0; i < 52; i++) {
    out += hexChars[Math.floor(Math.random() * hexChars.length)]
  }
  return out
}

export default {
  toBoolean,
  cookieToJson,
  cookieObjToString,
  getRandom,
  generateRandomChineseIP,
  generateChainId,
  generateDeviceId,
}

export {
  toBoolean,
  cookieToJson,
  cookieObjToString,
  getRandom,
  generateRandomChineseIP,
  generateChainId,
  generateDeviceId,
}
