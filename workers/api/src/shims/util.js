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

/**
 * 中国大陆 IP 池（用于 X-Real-IP）
 *
 * 上游从 `data/china_ip_ranges` 里按权重随机挑一个段，Workers 读不了那个文件，
 * 这里改成一份**实测可用**的前缀白名单。
 *
 * 为什么不能简单随机 `116.x.x.x`：原实现是 `116.25~94.x.x`，实测 116.90 以上
 * 的段会被网易云判成海外（`song/url` 回 code 404），116.40 / 116.70 也时好时坏。
 * 所以只放逐一验证过、连打 4 次全通的段 —— 池子小一点无所谓，随机踩雷才是灾难。
 * 验证方式：`/song/url/v1?id=347230&level=exhigh&realIP=<IP>` 是否返回直链。
 */
const CN_IP_PREFIXES = [
  [116, 25],
  [116, 55],
  [116, 85],
  [117, 136],
  [120, 230],
  [183, 14],
  [39, 144],
  [223, 104],
  [111, 202],
]

function generateRandomChineseIP() {
  const [a, b] = CN_IP_PREFIXES[floor(random() * CN_IP_PREFIXES.length)]
  return `${a}.${b}.${getRandomInt(1, 255)}.${getRandomInt(1, 255)}`
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
