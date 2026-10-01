/**
 * 参考加密实现对照：用 ncm-source/util/crypto.js 的 weapi 直接请求 NCM
 */
const path = require('path');
const axios = require('axios');
const encrypt = require(path.join(__dirname, '..', 'ncm-source', 'util', 'crypto.js'));

const DOMAIN = 'https://music.163.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';

const cases = [
  ['album', '/api/v1/album/3412097', {}],
  ['mv/detail', '/api/v1/mv/detail', { id: 5819401 }],
  ['recommend/resource', '/api/v1/discovery/recommend/resource', {}],
  ['login/status', '/api/w/nuser/account/get', {}],
  ['album/detail/dynamic', '/api/album/detail/dynamic', { id: 3412097 }],
];

(async () => {
  for (const [name, uri, data] of cases) {
    const payload = { ...data, csrf_token: '', e_r: false };
    const body = new URLSearchParams(encrypt.weapi(payload)).toString();
    const url = DOMAIN + '/weapi/' + uri.substr(5);
    try {
      const res = await axios.post(url, body, {
        headers: {
          'User-Agent': UA,
          'Referer': DOMAIN,
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
        validateStatus: () => true,
      });
      const d = res.data;
      console.log(`[${res.status}] ${name}  code=${d && d.code} keys=${d && typeof d === 'object' ? Object.keys(d).slice(0, 8).join(',') : String(d).slice(0, 60)}`);
    } catch (e) {
      console.log(`[EXC] ${name}  ${e.message}`);
    }
  }
})();