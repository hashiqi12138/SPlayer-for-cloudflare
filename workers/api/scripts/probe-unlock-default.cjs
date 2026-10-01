/**
 * 校验线上产物中「解锁音源」默认值已生效（酷我 enabled: true）
 *
 * 构建产物经过压缩，这里直接从部署域名拉取 JS 资源，
 * 在压缩代码里查找 songUnlockServer 默认值片段。
 *
 * 用法: node scripts/probe-unlock-default.cjs [pages-base]
 */
const BASE = process.argv[2] || 'https://dev.splayer-dvj.pages.dev';

async function main() {
  console.log(`目标: ${BASE}\n`);

  // 1. 取入口 HTML，拿到所有 JS 资源
  const html = await (await fetch(BASE, { signal: AbortSignal.timeout(30000) })).text();
  const assets = [...html.matchAll(/src="(\.\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  console.log(`入口引用 JS: ${assets.length} 个`);

  // modulepreload 里的 chunk 也要看（stores 在其中）
  const preloads = [...html.matchAll(/href="(\.\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const all = [...new Set([...assets, ...preloads])];

  // 2. 逐个查找 songUnlockServer 默认值
  let found = null;
  for (const rel of all) {
    const url = new URL(rel.replace(/^\.\//, ''), BASE + '/').toString();
    let text;
    try {
      text = await (await fetch(url, { signal: AbortSignal.timeout(60000) })).text();
    } catch (e) {
      continue;
    }
    const m = text.match(/songUnlockServer:\[[^\]]{0,300}\]/);
    if (m) {
      found = { url, snippet: m[0] };
      break;
    }
  }

  if (!found) {
    console.log('❌ 未在产物中找到 songUnlockServer 默认值片段');
    process.exit(1);
  }

  console.log(`\n来源: ${found.url.split('/').pop()}`);
  console.log(`片段: ${found.snippet}\n`);

  // 压缩后枚举不会内联成字符串，而是保留形如 {key:pne.KUWO,enabled:!0}
  // （!0 === true，!1 === false），因此按 KUWO 标识匹配。
  const kuwo = found.snippet.match(/KUWO,enabled:(!0|true|!1|false)/i);
  if (!kuwo) {
    console.log('❌ 片段中未找到 KUWO 配置');
    process.exit(1);
  }
  const enabled = kuwo[1] === '!0' || kuwo[1] === 'true';
  console.log(
    enabled
      ? '✅ 酷我音源默认已启用，解锁可在浏览器中生效'
      : '❌ 酷我音源仍为关闭状态',
  );
  process.exit(enabled ? 0 : 1);
}

main();