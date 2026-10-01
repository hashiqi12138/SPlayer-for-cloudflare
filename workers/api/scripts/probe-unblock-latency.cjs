/**
 * 测量解锁接口在目标环境的真实耗时（多次采样）
 * 用法: node scripts/probe-unblock-latency.cjs [base-url] [rounds]
 */
const cfg = require('./config.cjs');

const BASE = process.argv[2] || cfg.apiWorkerUrl;
const ROUNDS = Number(process.argv[3]) || 3;

const CASES = [
  ['kuwo  ', '/api/unblock/kuwo?keyword=' + encodeURIComponent('灰姑娘-梁咏琪')],
  ['kuwo-raw', '/api/unblock/kuwo?keyword=' + encodeURIComponent('灰姑娘-梁咏琪') + '&raw=1'],
  ['related', '/related/playlist?id=10042797373'],
];

(async () => {
  console.log(`目标: ${BASE}  采样 ${ROUNDS} 轮\n`);
  const stats = {};
  for (let i = 1; i <= ROUNDS; i++) {
    console.log(`--- 第 ${i} 轮 ---`);
    for (const [name, path] of CASES) {
      const t0 = Date.now();
      try {
        const res = await fetch(BASE + path, { signal: AbortSignal.timeout(90000) });
        const j = await res.json();
        const ms = Date.now() - t0;
        (stats[name] = stats[name] || []).push(ms);
        const extra =
          name === 'related'
            ? `playlists=${Array.isArray(j.playlists) ? j.playlists.length : 'n/a'}`
            : `code=${j.code} url=${j.url ? j.url.slice(0, 55) : 'null'}`;
        console.log(`  [${name}] ${String(ms).padStart(6)}ms  ${extra}`);
      } catch (e) {
        const ms = Date.now() - t0;
        (stats[name] = stats[name] || []).push(ms);
        console.log(`  [${name}] ${String(ms).padStart(6)}ms  EXC ${e.message}`);
      }
    }
    console.log('');
  }

  console.log('=== 汇总（毫秒）===');
  for (const [name, arr] of Object.entries(stats)) {
    const sorted = [...arr].sort((a, b) => a - b);
    const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    console.log(`  ${name}: 平均 ${avg}  最小 ${sorted[0]}  最大 ${sorted[sorted.length - 1]}`);
  }
})();