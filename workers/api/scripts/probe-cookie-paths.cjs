/**
 * Cookie 传递路径矩阵探针
 *
 * 对 {接口} × {cookie 传入方式} × {目标环境} 做全组合，
 * 借 domain 覆盖把 Worker 出站请求打到回显服务，检查出站 Cookie 里
 * 是否真的带上了 MUSIC_U —— 定位登录态在哪一环丢失。
 *
 * 用法:
 *   $env:NCM_COOKIE = "MUSIC_U=xxx;os=pc;"
 *   node scripts/probe-cookie-paths.cjs
 */
const COOKIE = process.env.NCM_COOKIE || '';
const ECHO = 'https://httpbin.org/anything';

const BASES = [
  ['已部署 Worker', 'https://ncm-api.liujieahu.workers.dev'],
  ['本地 dev', 'http://127.0.0.1:8788'],
];

const CASES = [
  ['song/url/v1', '/song/url/v1?id=3342319503&level=exhigh'],
  ['song/detail', '/song/detail?ids=304867'],
  ['login/status', '/login/status'],
];

async function probe(base, path, viaQuery, viaHeader) {
  const parts = [`${path}&domain=${encodeURIComponent(ECHO)}`];
  if (viaQuery) parts.push(`cookie=${encodeURIComponent(COOKIE)}`);
  const headers = viaHeader ? { Cookie: COOKIE } : {};
  const res = await fetch(base + parts.join('&'), { headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* ignore */ }
  const outbound = (json && json.headers && json.headers.Cookie) || '';
  const m = outbound.match(/MUSIC_U=([^;]*)/);
  return {
    has: !!m,
    clean: m ? !/%3B|%3D|;/.test(m[1]) : false,
    len: outbound.length,
  };
}

(async () => {
  if (!COOKIE) {
    console.error('缺少 NCM_COOKIE');
    process.exit(2);
  }
  for (const [baseName, base] of BASES) {
    console.log(`\n===== ${baseName} =====`);
    for (const [name, path] of CASES) {
      for (const [how, viaQuery, viaHeader] of [
        ['查询参数', true, false],
        ['请求头  ', false, true],
        ['两者都给', true, true],
      ]) {
        try {
          const r = await probe(base, path, viaQuery, viaHeader);
          const flag = r.has && r.clean ? '✅' : '❌';
          console.log(`  ${flag} ${name.padEnd(13)} ${how} -> MUSIC_U=${r.has} 未被污染=${r.clean} cookieLen=${r.len}`);
        } catch (e) {
          console.log(`  💥 ${name.padEnd(13)} ${how} -> ${e.message}`);
        }
      }
    }
  }
})();