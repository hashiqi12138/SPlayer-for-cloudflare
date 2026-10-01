/**
 * 对照实验：用未经改动的 ncm-source/util/crypto.js 直接请求 eapi，
 * 复刻参考实现（data.header + createHeaderCookie）的请求形态，
 * 用来判断 song/url/v1 的 404 是移植缺陷还是上游真实返回。
 */
const path = require('path')
const axios = require('axios')
const encrypt = require(path.join(__dirname, '..', 'ncm-source', 'util', 'crypto.js'))

const EAPI_DOMAIN = 'https://interfacepc.music.163.com'
const UA = 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)'

function buildHeader(cookie) {
  return {
    osver: cookie.osver,
    deviceId: cookie.deviceId,
    os: cookie.os,
    appver: cookie.appver,
    versioncode: cookie.versioncode || '140',
    mobilename: cookie.mobilename || '',
    buildver: cookie.buildver || String(Date.now()).substr(0, 10),
    resolution: cookie.resolution || '1920x1080',
    __csrf: cookie.__csrf || '',
    channel: cookie.channel,
    requestId: `${Date.now()}_${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(4, '0')}`,
  }
}

async function callEapi(uri, data, cookie, useHeader = true) {
  const header = buildHeader(cookie)
  if (cookie.MUSIC_U) header.MUSIC_U = cookie.MUSIC_U
  const body = useHeader ? { ...data, e_r: false, header } : { ...data, e_r: false }
  const enc = encrypt.eapi(uri, body)
  const url = EAPI_DOMAIN + '/eapi/' + uri.substr(5)
  const res = await axios.post(url, new URLSearchParams(enc).toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      'User-Agent': UA,
      Cookie: Object.keys(header)
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(header[k])}`)
        .join('; '),
    },
    validateStatus: () => true,
  })
  return res.data
}

;(async () => {
  const baseCookie = {
    os: 'pc',
    appver: '3.1.17.204416',
    deviceId: '0123456789abcdef0123456789abcdef',
    osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
    channel: 'netease',
  }

  const cases = [
    ['2702937653 潇湘水云(st=-100)', '2702937653'],
    ['3342319503 明知故犯(可播放)', '3342319503'],
    ['347230 海阔天空(st=-100)', '347230'],
  ]

  for (const [label, id] of cases) {
    for (const useHeader of [true, false]) {
      try {
        const d = await callEapi(
          '/api/song/enhance/player/url/v1',
          { ids: `[${id}]`, level: 'exhigh', encodeType: 'flac' },
          baseCookie,
          useHeader,
        )
        const x = (d.data || [])[0] || {}
        console.log(
          `[参考实现${useHeader ? '+header' : '-header'}] ${label} -> url=${x.url ? 'OK' : 'null'} code=${x.code} level=${x.level}`,
        )
      } catch (e) {
        console.log(`[参考实现] ${label} -> EXC ${e.message}`)
      }
    }
  }
})()
