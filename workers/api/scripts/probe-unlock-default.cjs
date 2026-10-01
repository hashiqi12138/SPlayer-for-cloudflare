/**
 * 校验线上产物中「音乐解锁」默认开关已关闭
 *
 * 背景：解锁三大音源均按出口 IP 限制，Cloudflare 出口无法真正生效，
 * 而上游默认开启；若不禁用，每首不可用歌曲都会并发打 3 个必然失败的请求。
 * 这里直接从部署域名拉 JS 资源，在压缩代码里查找 useSongUnlock 默认值。
 *
 * 用法: node scripts/probe-unlock-default.cjs [pages-base]
 */
const BASE = process.argv[2] || 'https://dev.splayer-dvj.pages.dev';

(async () => {
  console.log(`目标: ${BASE}\n`);

  const html = await (await fetch(BASE, { signal: AbortSignal.timeout(30000) })).text();
  const refs = [
    ...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g),
  ].map((m) => m[1]);
  const all = [...new Set(refs)];
  console.log(`入口引用 JS: ${all.length} 个`);

  let found = null;
  for (const rel of all) {
    const url = new URL(rel, BASE + '/').toString();
    let text;
    try {
      text = await (await fetch(url, { signal: AbortSignal.timeout(60000) })).text();
    } catch (e) {
      continue;
    }
    const m = text.match(/useSongUnlock:\s*(!0|!1|true|false)/);
    if (m) {
      found = { url, value: m[1], snippet: m[0] };
      break;
    }
  }

  if (!found) {
    console.log('❌ 未在产物中找到 useSongUnlock 默认值');
    process.exit(1);
  }

  console.log(`\n来源: ${found.url.split('/').pop()}`);
  console.log(`片段: ${found.snippet}\n`);

  const disabled = found.value === '!1' || found.value === 'false';
  console.log(
    disabled
      ? '✅ 音乐解锁默认已关闭，前端不会发起解锁请求'
      : '❌ 音乐解锁仍为开启状态，会拖慢不可用歌曲的播放',
  );
  process.exit(disabled ? 0 : 1);
})();