/**
 * 诊断：在 Node 中直接跑我们移植后的 request handler，
 * 与参考实现对比，判断是"移植逻辑问题"还是"Workers 环境问题"
 */
import { createRequest } from '../src/ncm-request-handler.js';

const MUSIC_U = process.env.MUSIC_U_TEST;
const CSRF = process.env.CSRF_TEST || '';

const cases = [
  ['仅 MUSIC_U', `MUSIC_U=${MUSIC_U}`, {}],
  ['MUSIC_U + __csrf + os', `MUSIC_U=${MUSIC_U}; __csrf=${CSRF}; os=pc`, {}],
  ['模拟 Worker 注入 X-Real-IP', `MUSIC_U=${MUSIC_U}; __csrf=${CSRF}; os=pc`, { ip: '1.2.3.4' }],
];

for (const [label, ck, extra] of cases) {
  try {
    const res = await createRequest('/api/w/nuser/account/get', {}, { crypto: 'weapi', cookie: ck, ...extra });
    const b = res.body || {};
    console.log(`[${label}] status=${res.status} code=${b.code} account=${b.account ? '有' : 'null'} profile=${b.profile ? b.profile.nickname : 'null'}`);
  } catch (e) {
    const b = e && e.body ? e.body : e;
    console.log(`[${label}] ERR status=${e && e.status} body=${JSON.stringify(b).slice(0, 200)}`);
  }
}