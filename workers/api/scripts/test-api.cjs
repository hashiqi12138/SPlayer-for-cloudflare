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
  
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    
    process.stdout.write(`[${String(i + 1).padStart(2, ' ')}/${testCases.length}] ${tc.name}... `);
    
    try {
      const result = await testEndpoint(tc);
      
      if (result.pass && result.skipped) {
        skipped++;
        console.log(`⏭   (${result.errorMsg})`);
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
  
  // 输出报告
  console.log('');
  console.log('═'.repeat(50));
  console.log('📊 测试结果汇总');
  console.log('═'.repeat(50));
  console.log(`  总计: ${testCases.length}`);
  console.log(`  通过: ${passed}  (${((passed / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`  跳过: ${skipped}  (需登录，未提供 NCM_COOKIE)`);
  console.log(`  失败: ${failed}  (${((failed / testCases.length) * 100).toFixed(1)}%)`);
  console.log('');
  
  // 失败列表
  if (failed > 0) {
    console.log('❌ 失败的接口:');
    console.log('');
    results.filter(r => !r.pass).forEach(r => {
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
    failed,
    results,
  }, null, 2));
  
  // 保存 markdown 报告
  const mdFile = path.join(OUTPUT_DIR, `report-${TIMESTAMP}.md`);
  fs.writeFileSync(mdFile, generateMarkdownReport(results, passed, failed, skipped));
  
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

          const pass = res.statusCode === 200 && codes.includes(tc.expectedCode);

          resolve({
            ...tc,
            pass,
            status: res.statusCode,
            responseCode: codes[0],
            errorMsg: !pass ? (json.msg || json.message || `HTTP ${res.statusCode}, code ${codes.join('/')}`) : null,
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

function generateMarkdownReport(results, passed, failed, skipped = 0) {
  const total = results.length;
  const pct = ((passed / total) * 100).toFixed(1);
  
  let md = `# 网易云 API Workers 部署测试报告

- 测试时间: ${new Date(TIMESTAMP).toLocaleString('zh-CN')}
- 测试目标: ${BASE_URL}
- 总用例: ${total}
- 通过: ${passed} (${pct}%)
- 跳过: ${skipped} (需登录)
- 失败: ${failed} (${((failed / total) * 100).toFixed(1)}%)

## 通过的接口

| # | 接口名称 | 路径 |
|---|---------|------|
`;

  let idx = 1;
  results.filter(r => r.pass && !r.skipped).forEach(r => {
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
  
  md += `
## 失败的接口

| # | 接口名称 | 路径 | 状态码 | 错误 |
|---|---------|------|--------|------|
`;

  idx = 1;
  results.filter(r => !r.pass).forEach(r => {
    md += `| ${idx++} | ${r.name} | \`${r.path.split('?')[0]}\` | ${r.status} | ${r.errorMsg || ''} |\n`;
  });
  
  return md;
}

// 运行
runTests().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
