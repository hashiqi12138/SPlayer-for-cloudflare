/**
 * 用前端真实传参格式验证三个音源，找出可用于回归测试的稳定样例
 * 用法: node scripts/probe-unblock-samples.cjs [base-url]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8788';

// 前端 song.ts 的调用方式：
//   netease -> { id }
//   kuwo/bodian -> { keyword, songName, artist }
const SAMPLES = [
  {
    label: '付费原版 海阔天空',
    songName: '海阔天空',
    artist: 'Beyond',
    id: 347230,
  },
  {
    label: '免费 DJ 版 海阔天空',
    songName: '海阔天空 (伴奏|DJ Yuslee版)',
    artist: 'BEYOND&DJ Yuslee',
    id: 2702937653,
  },
  {
    label: '免费 灰姑娘',
    songName: '灰姑娘',
    artist: '梁咏琪',
    id: 33894312,
  },
];

const SERVERS = ['netease', 'kuwo', 'bodian'];

async function call(server, sample) {
  const params =
    server === 'netease'
      ? { id: sample.id }
      : { keyword: `${sample.songName}-${sample.artist}`, songName: sample.songName, artist: sample.artist };
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/unblock/${server}?${qs}`, {
      signal: AbortSignal.timeout(40000),
    });
    const j = await res.json();
    return {
      ok: j.code === 200 && !!j.url,
      code: j.code,
      url: j.url,
      ms: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, code: 'EXC', url: null, ms: Date.now() - started, err: e.message };
  }
}

(async () => {
  console.log(`目标: ${BASE}\n`);
  for (const s of SAMPLES) {
    console.log(`--- ${s.label} ---`);
    for (const server of SERVERS) {
      const r = await call(server, s);
      const mark = r.ok ? '✅' : '❌';
      console.log(
        `  ${mark} ${server.padEnd(8)} code=${String(r.code).padEnd(6)} ${String(r.ms).padStart(5)}ms  ${
          r.url ? r.url.slice(0, 62) : r.err || ''
        }`,
      );
    }
    console.log('');
  }
})();