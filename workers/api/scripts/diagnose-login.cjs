/**
 * 登录态诊断：定位「登录态丢失 / 歌曲不可播放」发生在哪一环
 *
 * 依次检查：
 *   1. cookie 本身是否有效（直连网易云）
 *   2. Worker 三种 cookie 传递方式的登录态结果
 *   3. 同一 cookie 直连网易云的结果（基线对照）
 *   4. 同一首歌在 Worker / 直连下的权限差异
 *
 * 用法:
 *   $env:NCM_COOKIE = "MUSIC_U=xxxxx"
 *   node scripts/diagnose-login.cjs [base-url]
 */
const path = require('path');
const axios = require('axios');
const enc = require(path.join(__dirname, '..', 'ncm-source', 'util', 'crypto.js'));

const BASE = process.argv[2] || 'https://ncm-api.liujieahu.workers.dev';
const COOKIE = process.env.NCM_COOKIE || '';
const DOMAIN = 'https://music.163.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
const SONG_IDS = ['2702937653', '3342319503', '1901371647'];

if (!COOKIE) {
  console.error('缺少 NCM_COOKIE 环境变量');
  process.exit(2);
}

async function workerGet(pathname, headers = {}) {
  const r = await fetch(BASE + pathname, { headers });
  const t = await r.text();
  try { return { http: r.status, json: JSON.parse(t) }; } catch (e) { return { http: r.status, json: {} }; }
}

async function directPost(uri, data) {
  const body = new URLSearchParams(enc.weapi({ ...data, csrf_token: '', e_r: false })).toString();
  const r = await axios.post(DOMAIN + '/weapi/' + uri.substr(5), body, {
    headers: { Cookie: COOKIE, 'User-Agent': UA, Referer: DOMAIN, 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    validateStatus: () => true, timeout: 20000,
  });
  return r.data;
}

const brief = (j) => {
  const d = j && j.data && !Array.isArray(j.data) ? j.data : j;
  const acc = d && d.account;
  return `code=${j && j.code} account=${acc ? acc.id : '-'} nick=${d && d.profile ? d.profile.nickname : '-'}`;
};

(async () => {
  console.log('=== 1. cookie 本身是否有效（直连网易云） ===');
  const acc = await directPost('/api/w/nuser/account/get', {});
  console.log('  ' + brief(acc));

  console.log('\n=== 2. Worker 三种传递方式 ===');
  const q = '?cookie=' + encodeURIComponent(COOKIE);
  for (const [name, pathname, headers] of [
    ['查询参数', '/login/status' + q, {}],
    ['请求头', '/login/status', { Cookie: COOKIE }],
    ['两者都带', '/login/status' + q, { Cookie: COOKIE }],
  ]) {
    const r = await workerGet(pathname, headers);
    console.log(`  ${name.padEnd(8)} -> http=${r.http} ${brief(r.json)}`);
  }

  console.log('\n=== 3. 歌曲权限：Worker vs 直连 ===');
  const direct = await directPost('/api/v3/song/detail', {
    c: '[' + SONG_IDS.map((id) => `{"id":${id}}`).join(',') + ']',
    ids: '[' + SONG_IDS.join(',') + ']',
  });
  const dp = new Map((direct.privileges || []).map((p) => [p.id, p]));
  const wp = new Map(
    (((await workerGet('/song/detail?ids=' + SONG_IDS.join(','), { Cookie: COOKIE })).json.privileges) || [])
      .map((p) => [p.id, p])
  );
  for (const id of SONG_IDS) {
    const d = dp.get(Number(id)) || {};
    const w = wp.get(Number(id)) || {};
    console.log(`  id=${id}  直连: st=${d.st} pl=${d.pl} plLevel=${d.plLevel}  |  Worker: st=${w.st} pl=${w.pl} plLevel=${w.plLevel}`);
  }
  console.log('\n说明：若「直连」为 st=0/pl>0 而「Worker」为 st=-100/pl=0，');
  console.log('      说明网易云未采纳 Worker 出口 IP 的登录态（风控），而非接口移植问题。');
})();