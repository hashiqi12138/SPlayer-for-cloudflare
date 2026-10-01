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

const fs = require('fs')
const path = require('path')

const MODULE_DIR = path.join(__dirname, '..', 'ncm-source', 'module')
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'generated-routes.js')

// 允许的额外 require：映射为文件顶部的 ESM import。
// 这些模块在原仓库依赖 fs / ANSI 日志 / JSON 文件，Workers 里无法直接加载，
// 因此用 src/shims/* 提供等价实现。
const SHIM_REQUIRES = {
  'crypto-js': {
    id: '__CryptoJS__',
    import: "import CryptoJS from 'crypto-js';\nconst __CryptoJS__ = CryptoJS;",
  },
  axios: { id: '__axios__', import: "import __axios__ from './shims/axios.js';" },
  '../util/logger.js': { id: '__logger__', import: "import __logger__ from './shims/logger.js';" },
  '../util/logger': { id: '__logger__', import: "import __logger__ from './shims/logger.js';" },
  '../util/index.js': { id: '__util__', import: "import __util__ from './shims/util.js';" },
  '../util/index': { id: '__util__', import: "import __util__ from './shims/util.js';" },
  '../util': { id: '__util__', import: "import __util__ from './shims/util.js';" },
  '../package.json': { id: '__pkg__', import: "import __pkg__ from './shims/pkg.js';" },
  // config.json 提供具名导出（APP_CONF / resourceTypeMap），
  // 原做法是整行删掉，会让用到 APP_CONF 的模块在运行时取到 undefined
  '../util/config.json': {
    id: '__config__',
    import: "import * as __config__ from './shims/config.js';",
  },
  './config.json': {
    id: '__config__',
    import: "import * as __config__ from './shims/config.js';",
  },
  // util/crypto 的 Workers 版实现（含 eapi 解密、xeapiSign 等可移植部分）
  '../util/crypto.js': { id: '__crypto__', import: "import __crypto__ from './shims/crypto.js';" },
  '../util/crypto': { id: '__crypto__', import: "import __crypto__ from './shims/crypto.js';" },
}

/**
 * 上游 server.js 的 specificRoute 例外表
 *
 * 默认规则是把文件名里的下划线换成斜杠（`personal_fm.js` -> `/personal/fm`），
 * 但这几个接口在上游是「下划线原样保留」的，必须单独列出。
 *
 * 这张表不是可选的：漏掉它会让这几个接口注册到**错误的路径**上，真实路径直接 404。
 * 线上就出过 —— `GET /personal_fm` 返回 `{code:404,"msg":"Not Found"}`。
 *
 * 来源: ncm-source/server.js 中传给 getModulesDefinitions 的 special 映射
 *      （examples/get_static_moddef.js 里是同一张表）
 * 维护方式: 上游改动时 `git -C workers/api/ncm-source log -- server.js` 看一眼这张表，
 *          并在 test/generated-routes.test.mjs 里同步预期
 */
const SPECIFIC_ROUTES = {
  'daily_signin.js': '/daily_signin',
  'fm_trash.js': '/fm_trash',
  'personal_fm.js': '/personal_fm',
}

function moduleNameToRoute(filename) {
  if (SPECIFIC_ROUTES[filename]) return SPECIFIC_ROUTES[filename]
  return '/' + filename.replace(/_/g, '/').replace(/\.js$/, '')
}

function transpile(content) {
  // 1. 去掉已知的 require 行
  //    注意：config.json 不能再整行删除——它现在映射到 shims/config.js，
  //    删除会让 `const { APP_CONF } = require('...config.json')` 整句消失。
  let code = content.replace(
    /^\s*const\s+\w+\s*=\s*require\(\s*['"][^'"]*option\.js['"]\s*\)\s*;?\s*$/gm,
    '',
  )

  // 2. 把可替代的 require 整体替换为 shim 标识符。
  //    直接替换调用表达式（而非整行），这样 `const { x } = require(p)` 与
  //    `const logger = require(p)` 两种写法都能原样保留。
  const usedShims = new Set()
  for (const [reqPath, shim] of Object.entries(SHIM_REQUIRES)) {
    const escaped = reqPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`require\\(\\s*['"]${escaped}['"]\\s*\\)`, 'g')
    if (re.test(code)) {
      code = code.replace(re, shim.id)
      usedShims.add(shim.id)
    }
  }

  // 2.5 同目录模块之间的相互调用：require('./ad_get.js') → __moduleRef('/ad/get')
  //     这些「子模块」本身也是注册在册的路由，运行时按路由名延迟取用即可，
  //     不需要把源码内联进来。
  //     注意：这里必须与 moduleNameToRoute 用同一套路径规则（含 SPECIFIC_ROUTES），
  //     否则 ref 指向的路由名与实际注册的 key 对不上，运行时会取到 undefined。
  const usedModuleRefs = new Set()
  code = code.replace(/require\(\s*['"]\.\/([\w.-]+)\.js['"]\s*\)/g, (match, name) => {
    if (!fs.existsSync(path.join(MODULE_DIR, `${name}.js`))) return match
    const route = moduleNameToRoute(`${name}.js`)
    usedModuleRefs.add(route)
    return `__moduleRef(${JSON.stringify(route)})`
  })

  // 3. 若仍有未支持的 require，放弃该模块
  const remaining = [...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])
  if (remaining.length > 0) {
    return { ok: false, reason: 'unsupported require: ' + [...new Set(remaining)].join(', ') }
  }

  // 4. 取出 module.exports 之后的内容作为函数表达式
  const m = code.match(/module\.exports\s*=/)
  if (!m) return { ok: false, reason: 'no module.exports' }

  // 4.1 补回 shim 绑定。
  //     `const { toBoolean } = require('../util')` 这类声明写在 module.exports 之前，
  //     只截取 exports 之后的代码会把绑定丢掉，运行时报 "xxx is not defined"。
  //     这里只挑出「从 shim 标识符 / __moduleRef 取值」的声明行，塞进函数体开头。
  const head = code.slice(0, m.index)
  const bindings = head
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(const|let|var)\s+.+=\s*(__\w+__|__moduleRef\(['"][^'"]*['"]\))\s*;?$/.test(l))

  let fn = code.slice(m.index + m[0].length).trim()
  // 去掉结尾分号
  fn = fn.replace(/;\s*$/, '')

  // 先校验 exports 本身是函数表达式，再拼接 shim 绑定（否则前缀会干扰判断）
  if (!/^(async\s*)?\(/.test(fn) && !/^(async\s+)?function/.test(fn)) {
    return { ok: false, reason: 'exports is not a function expression' }
  }

  // 绑定必须以「函数体语句」的形式出现，而 exports 是对象属性值（不能直接前缀语句），
  // 因此用一个立即执行函数包一层，把绑定放进闭包里再返回原函数。
  if (bindings.length > 0) {
    fn = `(() => {\n${bindings.join('\n')}\nreturn ${fn};\n})()`
  }

  return { ok: true, fn, usedShims, usedModuleRefs }
}

function main() {
  const files = fs
    .readdirSync(MODULE_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()
  const entries = []
  const skipped = []

  for (const file of files) {
    const content = fs.readFileSync(path.join(MODULE_DIR, file), 'utf-8')
    const route = moduleNameToRoute(file)
    const r = transpile(content)
    if (!r.ok) {
      skipped.push({ route, file, reason: r.reason })
      continue
    }
    entries.push({
      route,
      file,
      fn: r.fn,
      usedShims: r.usedShims,
      usedModuleRefs: r.usedModuleRefs,
    })
  }

  // 收集实际用到的 shim import（按 SHIM_REQUIRES 声明顺序，保证输出稳定）。
  // 必须按 id 去重：多个 require 路径会映射到同一个标识符，
  // 重复 import 同名绑定会导致 ESM 语法错误。
  const usedShimIds = new Set()
  for (const e of entries) for (const id of e.usedShims) usedShimIds.add(id)
  // 同目录模块互调用到的路由（用于生成 __moduleRef 辅助函数）
  const usedModuleRefIds = new Set()
  for (const e of entries) {
    if (e.usedModuleRefs) for (const r of e.usedModuleRefs) usedModuleRefIds.add(r)
  }

  const seenIds = new Set()
  const shimImports = Object.values(SHIM_REQUIRES)
    .filter((s) => usedShimIds.has(s.id) && !seenIds.has(s.id) && seenIds.add(s.id))
    .map((s) => s.import)
    .join('\n')

  // 同目录模块互调所需的辅助函数（仅在确有互调时输出）
  const moduleRefHelper =
    usedModuleRefIds.size > 0
      ? `
// 同目录模块互调（如 user_event_all 复用 user_account）：
// 按路由名延迟取用。moduleFns 在下方定义，但调用发生在请求期，不受 TDZ 影响。
const __moduleRef = (route) => (query, request, deps) =>
  moduleFns[route](query, request, deps);
`
      : ''

  let out = `/**
 * 自动生成 —— 请勿手动编辑
 *
 * 来源: api-enhanced/ncm-source/module
 *
 * 本文件刻意不写入生成时间：它是入库产物，输出必须可复现，
 * 否则每次依赖更新都会产生只有时间戳变化的噪音 diff。
 * 需要知道生成时间时看 git 历史即可。
 *
 * 已转译: ${entries.length} 个模块
 * 已跳过: ${skipped.length} 个（依赖特殊，走 module-router.js 手动实现）
 */

import createOption from './option.js';
${shimImports ? shimImports + '\n' : ''}
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
${moduleRefHelper}
export const moduleFns = {
`

  for (const e of entries) {
    out += `\n  // ${e.route}  <-- ${e.file}\n  '${e.route}': ${e.fn},\n`
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
      // 显式传入的 cookie（查询参数 / 表单）优先。
      // req.cookies 恒为对象（见 index.js 的 cookie 中间件），无条件赋值会把
      // URL 上的 cookie 参数覆盖成空对象，导致前端登录态完全丢失。
      const query = { ...req.query, ...req.body };
      if (!query.cookie) {
        query.cookie =
          Object.keys(req.cookies || {}).length > 0
            ? req.cookies
            : req.headers.cookie || {};
      }

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
  skippedModules: ${JSON.stringify(skipped.map((s) => ({ route: s.route, reason: s.reason })))},
};
`

  // handleModule 里用到 createRequest，需要 import
  out = out.replace(
    "import createOption from './option.js';",
    "import createOption from './option.js';\nimport { createRequest } from './ncm-request-handler.js';",
  )

  // 统一成 LF 再落盘。
  //
  // 产物内容是「上游模块源码 + 本文件里的模板」拼出来的，其中上游文件在
  // `core.autocrlf=true` 的机器上可能是 CRLF。若原样写出，这个入库产物在
  // Windows 上就是 CRLF、在 Linux 上是 LF —— 同一份源码构建出两种字节序列，
  // 「构建可复现」就名存实亡（而且 git 比对时会归一化换行，根本发现不了）。
  fs.writeFileSync(OUTPUT_FILE, out.replace(/\r\n/g, '\n'), 'utf-8')

  console.log(`已转译: ${entries.length} 个模块`)
  console.log(`已跳过: ${skipped.length} 个`)
  const byReason = {}
  for (const s of skipped) {
    const key = s.reason.split(':')[0]
    byReason[key] = (byReason[key] || 0) + 1
  }
  console.log('跳过原因统计:', JSON.stringify(byReason))
  console.log('\n跳过明细:')
  skipped.forEach((s) => console.log(`  - ${s.route}  (${s.reason})`))
  console.log(`\n输出: ${OUTPUT_FILE}`)
}

main()
