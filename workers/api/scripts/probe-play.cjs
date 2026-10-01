/**
 * 播放链路对照探针：定位「歌曲无法播放」发生在哪一环
 *
 * 对同一首歌、同一 cookie，分别走：
 *   1. 参考实现（ncm-source 直接请求 interfacepc）—— 基线，判断歌本身是否可播
 *   2. 本地 wrangler dev（最新代码）
 *   3. 已部署 Worker / Pages 代理
 *
 * 用法:
 *   $env:NCM_COOKIE = "MUSIC_U=xxx;os=pc;"
 *   node scripts/probe-play.cjs [songId...]
 */
const path = require('path');
const axios = require('axios');
const encrypt = require(path.join(__dirname, '..', 'ncm-source', 'util', 'crypto.js'));

const EAPI_DOMAIN = 'https://interfacepc.music.163.com';
const UA = 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)';
const COOKIE = process.env.NCM_COOKIE || '';
const SONG_IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['2702937653', '3342319503'];

const TARGETS = [
  ['本地 dev', 'http://127.0.0.1:8788'],
  ['已部署 Worker', 'https://ncm-api.liujieahu.workers.dev'],
  ['dev Pages 代理', 'https://dev.splayer-dvj.pages.dev/api/netease'],
];

function parseCookie(str) {
  const out = {};
  String(str).split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i < 1) return;
    out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

async function reference(id) {
  const c = {
    os: 'pc',
    appver: '3.1.17.204416',
    deviceId: '0123456789abcdef0123456789abcdef',
    osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
    channel: 'netease',
    ...parseCookie(COOKIE),
  };
  const header = {
    osver: c.osver,
    deviceId: c.deviceId,
    os: c.os,
    appver: c.appver,
    versioncode: '140',
    buildver: String(Date.now()).substr(0, 10),
    resolution: '1920x1080',
    __csrf: c.__csrf || '',
    channel: c.channel,
    requestId: `${Date.now()}_0001`,
  };
  if (c.MUSIC_U) header.MUSIC_U = c.MUSIC_U;
  const body = { ids: `[${id}]`, level: 'exhigh', encodeType: 'flac', e_r: false, header };
  const enc = encrypt.eapi('/api/song/enhance/player/url/v1', body);
  const res = await axios.post(EAPI_DOMAIN + '/eapi/song/enhance/player/url/v1', new URLSearchParams(enc).toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      'User-Agent': UA,
      Cookie: Object.keys(header).map((k) => `${k}=${header[k]}`).join('; '),
    },
    validateStatus: () => true,
    timeout: 20000,
  });
  return res.data;
}

async function viaWorker(base, id) {
  const q = COOKIE ? `&cookie=${encodeURIComponent(COOKIE)}` : '';
  const res = await fetch(`${base}/song/url/v1?id=${id}&level=exhigh${q}`);
  return { http: res.status, json: await res.json().catch(() => null) };
}

const summarize = (d) => {
  const x = (d && d.data && d.data[0]) || {};
  return `url=${x.url ? 'OK' : 'null'} code=${x.code} level=${x.level} fee=${x.fee} st=${x.st}`;
};

(async () => {
  console.log('cookie:', COOKIE ? `有 (MUSIC_U=${(parseCookie(COOKIE).MUSIC_U || '').slice(0, 10)}...)` : '(无)');
  for (const id of SONG_IDS) {
    console.log(`\n=== song ${id} ===`);
    try {
      console.log(`  [参考实现直连] ${summarize(await reference(id))}`);
    } catch (e) {
      console.log(`  [参考实现直连] EXC ${e.message}`);
    }
    for (const [name, base] of TARGETS) {
      try {
        const r = await viaWorker(base, id);
        console.log(`  [${name}] http=${r.http} ${summarize(r.json)}`);
      } catch (e) {
        console.log(`  [${name}] EXC ${e.message}`);
      }
    }
  }
})();