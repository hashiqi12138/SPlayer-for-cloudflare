/**
 * 模块转译生成器
 * 
 * 把 api-enhanced 的 CommonJS 模块整体转译为 ESM 可用的函数映射。
 * 与旧版（只提取 data 字面量）相比，本版保留：
 *   - 预处理语句（query.ids.split、const type、const threadId 等）
 *   - 动态 API 路径（模板字符串）
 *   - 多步请求
 * 
 * 用法: node scripts/build-modules.cjs
 * 输出: src/generated-routes.js
 */

const fs = require('fs');
const path = require('path');

const MODULE_DIR = path.join(__dirname, '..', 'ncm-source', 'module');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'generated-routes.js');

// 允许的额外 require（会映射为文件顶部 import / 局部 const）
const ALLOWED_EXTRA_REQUIRES = {
  'crypto-js': '__CryptoJS__',
};

function moduleNameToRoute(filename) {
  return '/' + filename.replace(/_/g, '/').replace(/\.js$/, '');
}

function transpile(content) {
  // 1. 去掉已知的 require 行
  let code = content
    .replace(/^\s*const\s*\{[^}]*\}\s*=\s*require\(\s*['"][^'"]*config\.json['"]\s*\)\s*;?\s*$/gm, '')
    .replace(/^\s*const\s+\w+\s*=\s*require\(\s*['"][^'"]*option\.js['"]\s*\)\s*;?\s*$/gm, '');

  // 2. 处理允许的额外 require
  const usedCryptoJs = /require\(\s*['"]crypto-js['"]\s*\)/.test(code);
  if (usedCryptoJs) {
    code = code.replace(
      /^\s*const\s+\w+\s*=\s*require\(\s*['"]crypto-js['"]\s*\)\s*;?\s*$/gm,
      'const CryptoJS = __CryptoJS__;'
    );
    code = code.replace(/require\(\s*['"]crypto-js['"]\s*\)/g, '__CryptoJS__');
  }

  // 3. 若仍有未支持的 require，放弃该模块
  const remaining = [...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
  if (remaining.length > 0) {
    return { ok: false, reason: 'unsupported require: ' + [...new Set(remaining)].join(', ') };
  }

  // 4. 取出 module.exports 之后的内容作为函数表达式
  const m = code.match(/module\.exports\s*=/);
  if (!m) return { ok: false, reason: 'no module.exports' };

  let fn = code.slice(m.index + m[0].length).trim();
  // 去掉结尾分号
  fn = fn.replace(/;\s*$/, '');

  if (!/^(async\s*)?\(/.test(fn) && !/^(async\s+)?function/.test(fn)) {
    return { ok: false, reason: 'exports is not a function expression' };
  }

  return { ok: true, fn, usesCryptoJs: usedCryptoJs };
}

function main() {
  const files = fs.readdirSync(MODULE_DIR).filter(f => f.endsWith('.js')).sort();
  const entries = [];
  const skipped = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(MODULE_DIR, file), 'utf-8');
    const route = moduleNameToRoute(file);
    const r = transpile(content);
    if (!r.ok) {
      skipped.push({ route, file, reason: r.reason });
      continue;
    }
    entries.push({ route, file, fn: r.fn, usesCryptoJs: r.usesCryptoJs });
  }

  const usesCryptoJs = entries.some(e => e.usesCryptoJs);

  let out = `/**
 * 自动生成 —— 请勿手动编辑
 *
 * 来源: api-enhanced/ncm-source/module
 * 生成时间: ${new Date().toISOString()}
 *
 * 已转译: ${entries.length} 个模块
 * 已跳过: ${skipped.length} 个（依赖特殊，走 module-router.js 手动实现）
 */

import createOption from './option.js';
${usesCryptoJs ? "import CryptoJS from 'crypto-js';\nconst __CryptoJS__ = CryptoJS;\n" : ''}
// 评论等接口的资源类型映射（对应 util/config.json）
const resourceTypeMap = {
  '0': 'R_SO_4_',
  '1': 'R_MV_5_',
  '2': 'A_PL_0_',
  '3': 'R_AL_3_',
  '4': 'A_DJ_1_',
  '5': 'R_VI_62_',
  '6': 'A_EV_2_',
  '7': 'A_DR_14_',
};

export const moduleFns = {
`;

  for (const e of entries) {
    out += `\n  // ${e.route}  <-- ${e.file}\n  '${e.route}': ${e.fn},\n`;
  }

  out += `};

export function registerGeneratedRoutes(app) {
  for (const [route, fn] of Object.entries(moduleFns)) {
    app.all(route, handleModule(fn));
  }
}

function handleModule(moduleFn) {
  return async (req, res) => {
    try {
      const query = { ...req.query, ...req.body };
      if (req.cookies) query.cookie = req.cookies;
      else if (req.headers.cookie) query.cookie = req.headers.cookie;

      const ip =
        req.ip || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '';

      const requestFn = (p, data, options = {}) =>
        createRequest(p, data, { ...options, ip: options.ip || ip });

      const result = await moduleFn(query, requestFn);

      if (result.cookie && result.cookie.length > 0 && !query.noCookie) {
        for (const cookie of result.cookie) {
          res.append('Set-Cookie', req.protocol === 'https' ? cookie + '; SameSite=None; Secure' : cookie);
        }
      }

      if (result.redirectUrl) {
        res.redirect(result.status || 302, result.redirectUrl);
        return;
      }

      res.status(result.status || 200).json(result.body);
    } catch (err) {
      let status = 500;
      let body = { code: 500, msg: 'Internal Server Error' };
      if (err && typeof err === 'object') {
        status = err.status || err.statusCode || 500;
        if (err.body) body = err.body;
        else if (err.message) body = { code: status, msg: String(err.message) };
        else {
          try { body = { code: status, msg: JSON.stringify(err) }; }
          catch (e) { body = { code: status, msg: String(err) }; }
        }
      } else {
        body = { code: status, msg: String(err) };
      }
      if (err?.cookie && !req.query?.noCookie) res.append('Set-Cookie', err.cookie);
      res.status(status).json(body);
    }
  };
}

export const routeStats = {
  total: ${entries.length},
  skipped: ${skipped.length},
  skippedModules: ${JSON.stringify(skipped.map(s => ({ route: s.route, reason: s.reason })))},
};
`;

  // handleModule 里用到 createRequest，需要 import
  out = out.replace(
    "import createOption from './option.js';",
    "import createOption from './option.js';\nimport { createRequest } from './ncm-request-handler.js';"
  );

  fs.writeFileSync(OUTPUT_FILE, out, 'utf-8');

  console.log(`已转译: ${entries.length} 个模块`);
  console.log(`已跳过: ${skipped.length} 个`);
  const byReason = {};
  for (const s of skipped) {
    const key = s.reason.split(':')[0];
    byReason[key] = (byReason[key] || 0) + 1;
  }
  console.log('跳过原因统计:', JSON.stringify(byReason));
  console.log('\n跳过明细:');
  skipped.forEach(s => console.log(`  - ${s.route}  (${s.reason})`));
  console.log(`\n输出: ${OUTPUT_FILE}`);
}

main();