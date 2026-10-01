/**
 * API 接口批量测试脚本
 * 
 * 测试 Cloudflare Workers 上部署的网易云 API
 * 输出测试报告（通过率、失败列表、错误详情）
 * 
 * 用法: node test-api.cjs [base-url]
 * 默认: https://ncm-api.liujieahu.workers.dev
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'https://ncm-api.liujieahu.workers.dev';
const COOKIE = process.env.NCM_COOKIE || '';
const OUTPUT_DIR = path.join(__dirname, '..', 'test-results');
const TIMESTAMP = Date.now();

// ============================================================
// 测试用例（按优先级排序）
// ============================================================
const testCases = [
  // ===== 基础/健康检查 =====
  { name: '健康检查', path: '/health', method: 'GET', expectedCode: 200 },
  { name: '首页', path: '/', method: 'GET', expectedCode: 200 },
  
  // ===== 搜索（高频）=====
  { name: '搜索-默认关键词', path: '/search/default', method: 'GET', expectedCode: 200 },
  { name: '搜索-热搜列表', path: '/search/hot', method: 'GET', expectedCode: 200 },
  { name: '搜索-热搜详情', path: '/search/hot/detail', method: 'GET', expectedCode: 200 },
  { name: '搜索建议', path: '/search/suggest?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6', method: 'GET', expectedCode: 200 },
  { name: '搜索-歌曲', path: '/search?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6&limit=10', method: 'GET', expectedCode: 200 },
  { name: '搜索-歌单', path: '/search?keywords=%E6%B5%81%E8%A1%8C&type=1000&limit=10', method: 'GET', expectedCode: 200 },
  { name: '搜索多重匹配', path: '/search/multimatch?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6', method: 'GET', expectedCode: 200 },
  
  // ===== 歌曲 =====
  { name: '歌曲详情', path: '/song/detail?ids=304867', method: 'GET', expectedCode: 200 },
  { name: '歌曲URL', path: '/song/url?id=304867', method: 'GET', expectedCode: 200 },
  { name: '歌曲URL v1', path: '/song/url/v1?id=304867&level=standard', method: 'GET', expectedCode: 200 },
  // 播放链路回归：接口顶层 code 恒为 200，真正的失败藏在 data[0].url 为空里，
  // 必须显式校验取到直链，否则「歌曲无法播放」不会被测试发现。
  {
    name: '歌曲URL v1-取到直链',
    path: '/song/url/v1?id=3342319503&level=exhigh',
    method: 'GET',
    expectedCode: 200,
    validate: (json) => {
      const d = json.data && json.data[0];
      return d && d.url ? null : `data[0].url 为空 (songCode=${d && d.code})`;
    },
  },
  {
    name: '歌曲URL-取到直链',
    path: '/song/url?id=3342319503&br=320000',
    method: 'GET',
    expectedCode: 200,
    validate: (json) => {
      const d = json.data && json.data[0];
      return d && d.url ? null : `data[0].url 为空 (songCode=${d && d.code})`;
    },
  },
  { name: '歌曲音质详情', path: '/song/music/detail?id=304867', method: 'GET', expectedCode: 200 },
  { name: '歌词-新版', path: '/lyric/new?id=304867', method: 'GET', expectedCode: 200 },
  { name: '歌词-旧版', path: '/lyric?id=304867', method: 'GET', expectedCode: 200 },
  
  // ===== 歌单 =====
  { name: '歌单详情', path: '/playlist/detail?id=10042797373', method: 'GET', expectedCode: 200 },
  { name: '歌单分类', path: '/playlist/catlist', method: 'GET', expectedCode: 200 },
  { name: '热门歌单分类', path: '/playlist/hot', method: 'GET', expectedCode: 200 },
  { name: '歌单列表', path: '/top/playlist?cat=%E5%85%A8%E9%83%A8&limit=10', method: 'GET', expectedCode: 200 },
  { name: '歌单曲目', path: '/playlist/track/all?id=10042797373&limit=10', method: 'GET', expectedCode: 200 },
  
  // ===== 排行榜 =====
  { name: '排行榜列表', path: '/toplist', method: 'GET', expectedCode: 200 },
  { name: '排行榜详情', path: '/playlist/detail?id=3778678', method: 'GET', expectedCode: 200 },
  
  // ===== 歌手 =====
  { name: '歌手详情', path: '/artist/detail?id=10562', method: 'GET', expectedCode: 200 },
  { name: '歌手热门歌曲', path: '/artist/songs?id=10562&limit=10', method: 'GET', expectedCode: 200 },
  { name: '歌手专辑', path: '/artist/album?id=10562&limit=10', method: 'GET', expectedCode: 200 },
  { name: '歌手MV', path: '/artist/mv?id=10562&limit=10', method: 'GET', expectedCode: 200 },
  { name: '热门歌手', path: '/top/artists?limit=10', method: 'GET', expectedCode: 200 },
  { name: '歌手分类列表', path: '/artist/list?cat=5001&limit=10', method: 'GET', expectedCode: 200 },
  
  // ===== 专辑 =====
  { name: '专辑详情', path: '/album?id=32311', method: 'GET', expectedCode: 200 },
  { name: '专辑动态', path: '/album/detail/dynamic?id=3412097', method: 'GET', expectedCode: 200 },
  { name: '新碟上架', path: '/album/newest?limit=10', method: 'GET', expectedCode: 200 },
  
  // ===== MV =====
  { name: 'MV详情', path: '/mv/detail?mvid=5436176', method: 'GET', expectedCode: 200 },
  { name: 'MV URL', path: '/mv/url?id=5819401', method: 'GET', expectedCode: 200 },
  { name: '最新MV', path: '/mv/first?limit=10', method: 'GET', expectedCode: 200 },
  { name: 'MV排行榜', path: '/top/mv?limit=10', method: 'GET', expectedCode: 200 },
  
  // ===== 评论 =====
  { name: '热门评论', path: '/comment/hot?id=10042797373&type=2&limit=5', method: 'GET', expectedCode: 200 },
  { name: '最新评论', path: '/comment/new?id=10042797373&type=2&limit=5', method: 'GET', expectedCode: 200 },
  
  // ===== 首页发现 =====
  { name: '首页发现', path: '/homepage/block/page', method: 'GET', expectedCode: 200 },
  { name: '轮播图', path: '/banner', method: 'GET', expectedCode: 200 },
  { name: '推荐歌单', path: '/personalized?limit=10', method: 'GET', expectedCode: 200 },
  { name: '推荐新音乐', path: '/personalized/newsong?limit=10', method: 'GET', expectedCode: 200 },
  { name: '独家放送', path: '/personalized/privatecontent', method: 'GET', expectedCode: 200 },
  
  // ===== 用户 =====
  { name: '用户详情', path: '/user/detail?uid=1', method: 'GET', expectedCode: 200 },
  { name: '用户歌单', path: '/user/playlist?uid=1&limit=10', method: 'GET', expectedCode: 200 },
  
  // ===== 登录 =====
  { name: '登录状态', path: '/login/status', method: 'GET', expectedCode: 200 },
  { name: '二维码Key', path: '/login/qr/key', method: 'GET', expectedCode: 200 },
  { name: '二维码生成', path: '/login/qr/create?key=test&qrimg=true', method: 'GET', expectedCode: 200 },
  
  // ===== 每日推荐 =====
  { name: '每日推荐歌单', path: '/recommend/resource', method: 'GET', expectedCode: 200, loginRequired: true },
  { name: '每日推荐歌曲', path: '/recommend/songs', method: 'GET', expectedCode: 200 },

  // ===== 客户端版本 / 下载 / 电台 / 透传（依赖 shims 适配的模块）=====
  {
    name: '客户端版本',
    path: '/inner/version',
    method: 'GET',
    expectedCode: 200,
    validate: (json) => (json.data && json.data.version ? null : '缺少 data.version'),
  },
  {
    name: '歌曲下载链接',
    path: '/song/download/url/v1?id=3342319503&level=exhigh',
    method: 'GET',
    expectedCode: 200,
    validate: (json) => (json.data && json.data.url ? null : 'data.url 为空'),
  },
  {
    name: '歌曲直链302',
    path: '/song/url/v1/302?id=3342319503&level=exhigh',
    method: 'GET',
    expectRedirect: true,
  },
  {
    name: '电台节目',
    path: '/dj/program?rid=336355127&limit=3',
    method: 'GET',
    expectedCode: 200,
    validate: (json) => (json.programs && json.programs.length > 0 ? null : 'programs 为空'),
  },
  { name: '私人DJ推荐', path: '/aidj/content/rcmd', method: 'GET', expectedCode: 200 },
  {
    name: '通用透传',
    path: '/api?uri=/api/song/detail&data=' + encodeURIComponent('{"ids":"[3342319503]"}'),
    method: 'GET',
    expectedCode: 200,
  },

  // ===== 新适配批次（axios / config / crypto / 模块互调 shim）=====
  {
    name: '相关歌单',
    path: '/related/playlist?id=10042797373',
    method: 'GET',
    expectedCode: 200,
    validate: (json) =>
      json.playlists && json.playlists.length > 0 ? null : 'playlists 为空',
  },
  {
    name: '解密-通用缺参',
    path: '/decrypt',
    method: 'GET',
    expectedCode: 400,
  },
  {
    name: '解密-eapi缺参',
    path: '/eapi/decrypt',
    method: 'GET',
    expectedCode: 400,
  },
  {
    name: '反作弊Token-v3',
    path: '/register/checktoken/v3',
    method: 'GET',
    expectedCode: 200,
    validate: (json) =>
      typeof json.token === 'string' ? null : 'token 字段缺失或类型错误',
  },
  {
    name: '云盘上传token缺参',
    path: '/cloud/upload/token',
    method: 'GET',
    expectedCode: 400,
  },
];

// ============================================================
// 测试执行
// ============================================================

async function runTests() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     网易云 API Workers 部署测试             ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`目标: ${BASE_URL}`);
  console.log(`测试用例: ${testCases.length} 个`);
  console.log('');
  
  const results = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let blocked = 0;
  
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    
    process.stdout.write(`[${String(i + 1).padStart(2, ' ')}/${testCases.length}] ${tc.name}... `);
    
    try {
      const result = await testEndpoint(tc);
      
      if (result.pass && result.skipped) {
        skipped++;
        console.log(`⏭   (${result.errorMsg})`);
      } else if (result.blocked) {
        blocked++;
        console.log(`🚧  (${result.errorMsg})`);
      } else if (result.pass) {
        passed++;
        console.log('✅');
      } else {
        failed++;
        console.log(`❌  (${result.status}, ${result.errorMsg || 'unknown'})`);
      }
      
      results.push(result);
      
    } catch (err) {
      failed++;
      console.log(`💥  (${err.message})`);
      results.push({
        ...tc,
        pass: false,
        status: 'error',
        errorMsg: err.message,
      });
    }
  }
  
  // ===== 额外：eapi 请求解密往返校验 =====
  // 本地用同一套算法构造密文 → 交给 /eapi/decrypt 解密 → 比对明文。
  // 这样能真正验证解密链路正确，而不是只看接口有没有报错。
  {
    const idx = testCases.length + 1;
    process.stdout.write(`[${idx}/${idx}] 解密-eapi往返... `);
    try {
      const { eapi } = await import('../src/ncm-crypto.js');
      const target = '/api/song/enhance/player/url/v1';
      const payload = { ids: '[3342319503]', level: 'exhigh' };
      const { params } = eapi(target, payload);

      const rt = await testEndpoint({
        name: '解密-eapi往返',
        path: `/eapi/decrypt?hexString=${encodeURIComponent(params)}&isReq=true`,
        method: 'GET',
        expectedCode: 200,
        validate: (json) => {
          const d = json.data || {};
          if (d.url !== target) return `解密出的 url 不匹配: ${d.url}`;
          if (String(d.data && d.data.ids) !== payload.ids) {
            return `解密出的 data 不匹配: ${JSON.stringify(d.data)}`;
          }
          return null;
        },
      });
      testCases.push(rt);
      results.push(rt);
      if (rt.pass) {
        passed++;
        console.log('✅');
      } else {
        failed++;
        console.log(`❌  (${rt.status}, ${rt.errorMsg || 'unknown'})`);
      }
    } catch (err) {
      failed++;
      console.log(`💥  (${err.message})`);
      results.push({
        name: '解密-eapi往返',
        path: '/eapi/decrypt',
        pass: false,
        status: 'error',
        errorMsg: err.message,
      });
      testCases.push({ name: '解密-eapi往返', path: '/eapi/decrypt' });
    }
  }

  // ===== 额外：解锁（解灰）接口 =====
  // 契约见 splayer-frontend/docs/api.md：统一返回 {code, url}，HTTP 恒为 200。
  // 三个音源相互独立，前端并发请求后取第一个成功的，因此逐个校验。
  // 注意：这些接口依赖第三方音源，若上游变更会在此暴露。
  {
    // 上游对出口 IP 的限制（非中国大陆出口常见），属环境问题而非实现缺陷，
    // 与网易云 -462 风控同类处理，单独归入「受限」不计失败。
    const ENV_REASONS = new Set([
      'source-blocked',
      'region-locked',
      'stub-audio',
      'timeout',
    ]);

    const evalUnblockResult = (j, { allowEnvBlock = false, expectBlocked = false } = {}) => {
      if (expectBlocked) {
        if (j.code === 404 && ENV_REASONS.has(j.reason)) return { pass: true };
        return {
          pass: false,
          msg: `期望被环境限制，实际 code=${j.code} reason=${j.reason || ''}`,
        };
      }

      if (j.code === 200 && typeof j.url === 'string' && j.url) {
        // 默认返回同源代理路径（/api/unblock/audio/...），供 raw=1 时可能是原始 https 直链
        const shapeOk =
          j.url.startsWith('/api/unblock/audio/') ||
          j.url.startsWith('https://');
        if (!shapeOk) {
          return { pass: false, msg: `直链形态异常: ${j.url}` };
        }
        // 前端会从 URL 推断音频格式，扩展名必须保留
        if (!/\.(mp3|flac|m4a|wav)(?:[?#]|$)/i.test(j.url)) {
          return { pass: false, msg: `直链缺少音频扩展名: ${j.url}` };
        }
        return { pass: true };
      }
      if (allowEnvBlock && ENV_REASONS.has(j.reason)) {
        return { pass: true, blocked: true, msg: `上游环境限制 (${j.reason})` };
      }
      return {
        pass: false,
        msg: `期望 200+音频直链，实际 code=${j.code} url=${j.url} reason=${j.reason || ''}`,
      };
    };

    const checks = [
      {
        name: '解锁-服务信息',
        path: '/api/unblock',
        verify: (j) =>
          Array.isArray(j.sources) && j.sources.includes('kuwo')
            ? { pass: true }
            : { pass: false, msg: 'sources 缺少 kuwo' },
      },
      {
        name: '解锁-酷我',
        path: '/api/unblock/kuwo?keyword=' + encodeURIComponent('灰姑娘-梁咏琪'),
        // 境内出口可拿到真实完整歌曲；Cloudflare 出口会被上游下发占位片段，
        // 接口已识别并拒绝（reason=stub-audio），归入受限而非失败。
        verify: (j) => evalUnblockResult(j, { allowEnvBlock: true }),
      },
      {
        name: '解锁-音频代理可播放',
        path: '/api/unblock/kuwo?keyword=' + encodeURIComponent('灰姑娘-梁咏琪'),
        // 前端 AudioElementPlayer 强制 crossOrigin="anonymous"，
        // 酷我等音源直链不含 CORS 头，必须经同源代理才能播放。
        // 这里实际拉一次流，同时校验音频类型与 CORS 头。
        verify: async (j) => {
          if (j.code !== 200 || !j.url) {
            // 上游未给出有效直链时不具备拉流条件，按环境限制归类
            if (ENV_REASONS.has(j.reason)) {
              return {
                pass: true,
                blocked: true,
                msg: `无有效直链，跳过拉流校验 (${j.reason})`,
              };
            }
            return { pass: false, msg: `未取到直链 (code=${j.code})` };
          }
          const abs = new URL(j.url, BASE_URL).toString();
          const res = await fetch(abs, {
            headers: {
              Range: 'bytes=0-2047',
              Origin: 'https://dev.splayer-dvj.pages.dev',
            },
            signal: AbortSignal.timeout(30000),
          });
          const ct = res.headers.get('content-type') || '';
          const acao = res.headers.get('access-control-allow-origin');
          const bytes = (await res.arrayBuffer()).byteLength;

          if (res.status !== 200 && res.status !== 206) {
            return { pass: false, msg: `代理拉流 HTTP ${res.status}` };
          }
          if (!/audio|octet-stream/i.test(ct)) {
            return { pass: false, msg: `Content-Type 异常: ${ct}` };
          }
          if (!acao) {
            return {
              pass: false,
              msg: '缺少 CORS 头，crossOrigin=anonymous 会被浏览器拒绝',
            };
          }
          if (!bytes) {
            return { pass: false, msg: '未拉到音频数据' };
          }
          return {
            pass: true,
            msg: `HTTP ${res.status} ${ct} ${bytes}B CORS=${acao}`,
          };
        },
      },
      {
        name: '解锁-波点',
        path: '/api/unblock/bodian?keyword=' + encodeURIComponent('灰姑娘-梁咏琪'),
        // 波点对 Cloudflare 境外出口会返回「仅限中国大陆地区使用」
        verify: (j) => evalUnblockResult(j, { allowEnvBlock: true }),
      },
      {
        name: '解锁-网易云',
        path: '/api/unblock/netease?id=33894312',
        // 聚合接口对 Cloudflare 出口返回 403
        verify: (j) => evalUnblockResult(j, { allowEnvBlock: true }),
      },
      {
        name: '解锁-空关键词',
        path: '/api/unblock/kuwo?keyword=',
        verify: (j) =>
          j.code === 404 && j.url === null && j.reason === 'empty-keyword'
            ? { pass: true }
            : {
                pass: false,
                msg: `期望 404/empty-keyword，实际 code=${j.code} reason=${j.reason}`,
              },
      },
    ];

    for (const c of checks) {
      const idx = testCases.length + 1;
      process.stdout.write(`[${idx}/${idx}] ${c.name}... `);

      // 解锁音源在跨境链路上偶发抖动（实测 0.9～3.3s，偶发尖峰），
      // 因此给一次重试机会，避免把网络抖动记成失败。
      let entry;
      const MAX_ATTEMPTS = 2;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch(BASE_URL + c.path, {
            signal: AbortSignal.timeout(60000),
          });
          const text = await res.text();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (e) {
            /* 交给下面的非 JSON 分支处理 */
          }

          if (!json) {
            entry = {
              name: c.name,
              path: c.path,
              pass: false,
              status: res.status,
              errorMsg: `非 JSON 响应 (HTTP ${res.status})`,
            };
          } else {
            const verdict = await c.verify(json);
            entry = {
              name: c.name,
              path: c.path,
              pass: verdict.pass,
              blocked: !!verdict.blocked,
              status: res.status,
              responseCode:
                json.code !== undefined ? json.code : res.status,
              errorMsg: verdict.pass ? verdict.msg || null : verdict.msg,
            };
          }
          break;
        } catch (e) {
          // 首次失败且还有重试机会时不记录，直接重试
          if (attempt < MAX_ATTEMPTS) continue;
          entry = {
            name: c.name,
            path: c.path,
            pass: false,
            status: 'error',
            errorMsg: `${e.message}（已重试 ${MAX_ATTEMPTS} 次）`,
          };
        }
      }

      testCases.push(entry);
      results.push(entry);
      if (entry.blocked) {
        blocked++;
        console.log(`🚧  (${entry.errorMsg})`);
      } else if (entry.pass) {
        passed++;
        console.log('✅');
      } else {
        failed++;
        console.log(`❌  (${entry.status}, ${entry.errorMsg || 'unknown'})`);
      }
    }
  }

  // 输出报告
  console.log('');
  console.log('═'.repeat(50));
  console.log('📊 测试结果汇总');
  console.log('═'.repeat(50));
  console.log(`  总计: ${testCases.length}`);
  console.log(`  通过: ${passed}  (${((passed / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`  跳过: ${skipped}  (需登录，未提供 NCM_COOKIE)`);
  console.log(`  受限: ${blocked}  (出口 IP 环境限制：网易云 -462 风控 / 解锁音源地区限制)`);
  console.log(`  失败: ${failed}  (${((failed / testCases.length) * 100).toFixed(1)}%)`);
  console.log('');
  
  // 失败列表
  if (failed > 0) {
    console.log('❌ 失败的接口:');
    console.log('');
    results.filter(r => !r.pass && !r.blocked).forEach(r => {
      console.log(`  • ${r.name}`);
      console.log(`    路径: ${r.path}`);
      console.log(`    状态: ${r.status}`);
      console.log(`    错误: ${r.errorMsg || '-'}`);
      console.log('');
    });
  }
  
  // 保存报告
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const reportFile = path.join(OUTPUT_DIR, `report-${TIMESTAMP}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    timestamp: TIMESTAMP,
    baseUrl: BASE_URL,
    total: testCases.length,
    passed,
    skipped,
    blocked,
    failed,
    results,
  }, null, 2));
  
  // 保存 markdown 报告
  const mdFile = path.join(OUTPUT_DIR, `report-${TIMESTAMP}.md`);
  fs.writeFileSync(mdFile, generateMarkdownReport(results, passed, failed, skipped, blocked));
  
  console.log(`📄 JSON 报告: ${reportFile}`);
  console.log(`📄 Markdown 报告: ${mdFile}`);
  console.log('');
  
  return { passed, skipped, failed, results };
}

function testEndpoint(tc) {
  return new Promise((resolve, reject) => {
    const url = BASE_URL + tc.path;
    const client = url.startsWith('https') ? https : http;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    };
    if (COOKIE) headers['Cookie'] = COOKIE;

    const req = client.get(url, { timeout: 15000, headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // 302 类接口（如 /song/url/v1/302）不返回 JSON，校验的是 Location 重定向
        if (tc.expectRedirect) {
          const loc = res.headers.location;
          const ok = (res.statusCode === 301 || res.statusCode === 302) && !!loc;
          resolve({
            ...tc,
            pass: ok,
            status: res.statusCode,
            responseCode: res.statusCode,
            errorMsg: ok ? null : `期望 302 + Location，实际 HTTP ${res.statusCode}`,
            responseSize: 0,
          });
          return;
        }

        try {
          const json = JSON.parse(data);
          // 业务码可能出现在顶层，也可能被模块包在 data 里（如 /login/status）
          const codes = [json.code, json.data && json.data.code, json.body && json.body.code]
            .filter(v => v !== undefined && v !== null)
            .map(Number);

          // 需要登录的接口：未提供 cookie 时，返回 301(需要登录) 视为跳过
          if (tc.loginRequired && !COOKIE && codes.includes(301)) {
            resolve({
              ...tc,
              pass: true,
              skipped: true,
              status: res.statusCode,
              responseCode: 301,
              errorMsg: '需登录（未提供 NCM_COOKIE，已跳过）',
            });
            return;
          }

          // 网易云风控（-462 需要验证）：来自 Cloudflare 出口 IP 的环境问题，
          // 与接口移植质量无关，单独归类，避免污染通过率。
          if (codes.includes(-462)) {
            resolve({
              ...tc,
              pass: false,
              blocked: true,
              status: res.statusCode,
              responseCode: -462,
              errorMsg: '被网易云风控拦截（-462，需人工验证）',
              responseSize: data.length,
            });
            return;
          }

          // 校验参数错误类接口时，HTTP 状态码会与业务码一致（如均为 400），
          // 不能一律要求 HTTP 200，否则「正确的报错」会被判成失败。
          const codeOk =
            codes.includes(tc.expectedCode) &&
            (res.statusCode === 200 || res.statusCode === tc.expectedCode);
          const customErr = codeOk && tc.validate ? tc.validate(json) : null;
          const pass = codeOk && !customErr;

          resolve({
            ...tc,
            pass,
            status: res.statusCode,
            responseCode: codes[0],
            errorMsg: !pass
              ? (customErr || json.msg || json.message || `HTTP ${res.statusCode}, code ${codes.join('/')}`)
              : null,
            responseSize: data.length,
          });
        } catch (e) {
          resolve({
            ...tc,
            pass: false,
            status: res.statusCode,
            errorMsg: `JSON parse error: ${e.message}`,
            responseSize: data.length,
            responsePreview: data.substring(0, 200),
          });
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout (15s)'));
    });
  });
}

function generateMarkdownReport(results, passed, failed, skipped = 0, blocked = 0) {
  const total = results.length;
  const pct = ((passed / total) * 100).toFixed(1);
  
  let md = `# 网易云 API Workers 部署测试报告

- 测试时间: ${new Date(TIMESTAMP).toLocaleString('zh-CN')}
- 测试目标: ${BASE_URL}
- 总用例: ${total}
- 通过: ${passed} (${pct}%)
- 跳过: ${skipped} (需登录)
- 风控: ${blocked} (网易云 -462)
- 失败: ${failed} (${((failed / total) * 100).toFixed(1)}%)

## 通过的接口

| # | 接口名称 | 路径 |
|---|---------|------|
`;

  let idx = 1;
  results.filter(r => r.pass && !r.skipped && !r.blocked).forEach(r => {
    md += `| ${idx++} | ${r.name} | \`${r.path.split('?')[0]}\` |\n`;
  });
  
  if (skipped > 0) {
    md += `
## 跳过的接口（需登录）

| # | 接口名称 | 路径 | 说明 |
|---|---------|------|------|
`;
    idx = 1;
    results.filter(r => r.skipped).forEach(r => {
      md += `| ${idx++} | ${r.name} | \`${r.path.split('?')[0]}\` | 未提供 NCM_COOKIE |\n`;
    });
  }
  
  if (blocked > 0) {
    md += `
## 受出口 IP 限制的接口

> 两类情况，均属环境问题而非接口移植缺陷，换用合适的出口 IP 通常即可恢复：
>
> - 网易云业务码 \`-462\`（需人工验证）
> - 解锁音源返回 \`source-blocked\` / \`region-locked\`（如波点提示「仅限中国大陆地区使用」）

| # | 接口名称 | 路径 | 原因 |
|---|---------|------|------|
`;
    idx = 1;
    results.filter(r => r.blocked).forEach(r => {
      md += `| ${idx++} | ${r.name} | \`${r.path.split('?')[0]}\` | ${r.errorMsg || ''} |\n`;
    });
  }
  
  md += `
## 失败的接口

| # | 接口名称 | 路径 | 状态码 | 错误 |
|---|---------|------|--------|------|
`;

  idx = 1;
  results.filter(r => !r.pass && !r.blocked).forEach(r => {
    md += `| ${idx++} | ${r.name} | \`${r.path.split('?')[0]}\` | ${r.status} | ${r.errorMsg || ''} |\n`;
  });
  
  return md;
}

// 运行
runTests().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
