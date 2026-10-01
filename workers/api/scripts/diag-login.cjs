/**
 * 诊断：用参考实现（ncm-source/util/crypto.js）验证 MUSIC_U 是否被网易云认可
 */
const path = require('path');
const axios = require('axios');
const encrypt = require(path.join(__dirname, '..', 'ncm-source', 'util', 'crypto.js'));

const DOMAIN = 'https://music.163.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';

const MUSIC_U = process.env.MUSIC_U_TEST;
const CSRF = process.env.CSRF_TEST || '';

async function call(uri, data, cookieHeader) {
  const body = new URLSearchParams(encrypt.weapi({ ...data, csrf_token: CSRF, e_r: false })).toString();
  const res = await axios.post(DOMAIN + '/weapi/' + uri.substr(5), body, {
    headers: {
      'User-Agent': UA,
      Referer: DOMAIN,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      Cookie: cookieHeader,
    },
    validateStatus: () => true,
  });
  return res.data;
}

(async () => {
  console.log('MUSIC_U 长度:', MUSIC_U ? MUSIC_U.length : 0);
  console.log('MUSIC_U 前 12 位:', MUSIC_U ? MUSIC_U.slice(0, 12) : '(空)');

  const cases = [
    ['仅 MUSIC_U', `MUSIC_U=${MUSIC_U}`],
    ['MUSIC_U + __csrf', `MUSIC_U=${MUSIC_U}; __csrf=${CSRF}`],
    ['MUSIC_U + __csrf + os', `MUSIC_U=${MUSIC_U}; __csrf=${CSRF}; os=pc`],
  ];

  for (const [label, ck] of cases) {
    try {
      const d = await call('/api/w/nuser/account/get', {}, ck);
      console.log(`[${label}] code=${d.code} account=${d.account ? '有' : 'null'} profile=${d.profile ? d.profile.nickname : 'null'}`);
    } catch (e) {
      console.log(`[${label}] EXC ${e.message}`);
    }
  }
})();