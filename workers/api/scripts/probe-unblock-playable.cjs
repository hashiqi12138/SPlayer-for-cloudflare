/**
 * 端到端校验：经 Pages 拿到解锁直链，并实际发起 Range 请求确认可播放
 * 用法: node scripts/probe-unblock-playable.cjs [pages-base]
 */
const BASE = process.argv[2] || 'https://dev.splayer-dvj.pages.dev';

const CASES = [
  ['酷我', '/api/unblock/kuwo?keyword=' + encodeURIComponent('灰姑娘-梁咏琪')],
  ['波点', '/api/unblock/bodian?keyword=' + encodeURIComponent('灰姑娘-梁咏琪')],
];

(async () => {
  console.log(`目标: ${BASE}\n`);
  for (const [name, path] of CASES) {
    try {
      const res = await fetch(BASE + path, { signal: AbortSignal.timeout(40000) });
      const j = await res.json();
      console.log(`[${name}] code=${j.code} reason=${j.reason || '-'}`);

      if (j.code !== 200 || !j.url) {
        console.log('  跳过拉流校验（未拿到直链）\n');
        continue;
      }

      console.log(`  URL: ${j.url.slice(0, 100)}...`);
      const head = await fetch(j.url, {
        headers: { Range: 'bytes=0-2047' },
        signal: AbortSignal.timeout(30000),
      });
      const buf = await head.arrayBuffer();
      const ok = head.status === 206 || head.status === 200;
      console.log(
        `  拉流: HTTP ${head.status} | ${head.headers.get('content-type')} | ${buf.byteLength} bytes  ${ok ? '✅ 可播放' : '❌'}\n`,
      );
    } catch (e) {
      console.log(`[${name}] EXC ${e.message}\n`);
    }
  }
})();