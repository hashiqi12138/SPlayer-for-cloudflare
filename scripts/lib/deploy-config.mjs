/**
 * deploy.config.json 的读取、校验与占位符映射
 *
 * 为什么单独抽出来
 * ----------------
 * 同一份配置有三处要读：
 *   1. scripts/prepare-pages.mjs  部署时注入真实地址
 *   2. scripts/verify.mjs         校验配置完整性与占位符一一对应
 *   3. scripts/deploy*.{ps1,sh}   取 Pages 项目名 / 分支 / 访问地址
 * 如果各自维护「需要哪些字段」「占位符叫什么」，迟早会出现「部署能跑但校验通过不了」
 * 或反过来的情况。这里作为唯一事实来源。
 *
 * 与 workers/api/scripts/config.cjs 的关系：那个是给探针脚本用的 CommonJS 版本，
 * 面向「临时调试」场景；这里是给部署链路用的 ESM 版本。两者读的是同一个文件。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..', '..')
export const CONFIG_FILE = path.join(ROOT, 'deploy.config.json')

/**
 * 部署链路必需的字段
 *
 * pagesProdBranch 放在必需项而不是给默认值，是有意的：它必须与 Cloudflare Pages
 * 项目设置里的 Production branch **完全一致**，而这个值只有使用者知道。
 * 给一个「看起来合理」的默认值（比如 main）反而危险 —— 猜错时部署会静静进到预览
 * 环境，而脚本仍然打印「正式环境」，从输出上完全看不出来。缺了就报错更安全。
 */
export const REQUIRED_CONFIG_KEYS = [
  'apiWorkerUrl',
  'proxyWorkerUrl',
  'pagesProject',
  'pagesProdBranch',
]

/**
 * 可选字段（缺失时由调用方给默认值）
 *
 * Pages 区分正式与预览两个环境，因此分支和地址是分开的两组：
 *   - pagesProdBranch    正式分支名（必需，见上）
 *   - pagesProdUrl       正式地址（Pages 项目主域名）
 *   - pagesPreviewBranch 预览分支别名（--preview 发布时用）
 *   - pagesPreviewUrl    预览地址（<branch>.<project>.pages.dev）
 * 之前只有一组（pagesBranch/pagesUrl），结果每次发布都发到 dev 预览分支，
 * 正式环境一次都没发过 —— 分开之后，「发哪里」是显式选择而不是隐含默认。
 *
 * 关于为什么正式也必须显式传 --branch
 * ---------------------------------
 * Cloudflare Pages 把「分支名等于项目 Production branch 的那次部署」视为正式部署。
 * 不能靠「不传 --branch」来发正式：wrangler 不传时会从当前 git 仓库自动探测分支，
 * 而部署是在子模块目录（splayer-frontend）里执行的，子模块是 detached HEAD，
 * 探测出来是 `HEAD` —— 于是本该发正式的部署变成了一个叫 HEAD 的预览部署。
 * 实测就是这么发生的：脚本打印「目标: 正式环境」，Pages 控制台里却是 Preview。
 */
export const OPTIONAL_CONFIG_KEYS = ['pagesProdUrl', 'pagesPreviewBranch', 'pagesPreviewUrl']

/**
 * Pages Functions 模板里的占位符 → deploy.config.json 字段
 *
 * 模板侧只写占位符，真实地址只在配置里维护；这张表是两者唯一的连接点。
 * verify 会同时检查「模板里的占位符都在表里」和「表里的占位符模板都在用」，
 * 避免任一侧单方面改动后悄悄失效。
 */
export const PLACEHOLDER_TO_CONFIG_KEY = {
  __API_WORKER_URL__: 'apiWorkerUrl',
  __PROXY_WORKER_URL__: 'proxyWorkerUrl',
}

/** 匹配形如 __FOO_BAR__ 的占位符 */
export const PLACEHOLDER_RE = /__[A-Z0-9_]+__/g

/** 读取并校验配置；不合法时抛错（由调用方决定怎么呈现） */
export function loadConfig(file = CONFIG_FILE) {
  if (!fs.existsSync(file)) {
    throw new Error(`缺少 ${path.relative(ROOT, file)}：该文件是地址的唯一事实来源，请从仓库恢复`)
  }

  let cfg
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`${path.relative(ROOT, file)} 不是合法 JSON：${e.message}`)
  }

  const missing = REQUIRED_CONFIG_KEYS.filter((k) => !cfg[k])
  if (missing.length) {
    throw new Error(`${path.relative(ROOT, file)} 缺少必需字段：${missing.join(', ')}`)
  }

  return cfg
}

/** 把配置解析成占位符替换表 */
export function resolveReplacements(cfg) {
  const replacements = {}
  for (const [token, key] of Object.entries(PLACEHOLDER_TO_CONFIG_KEY)) {
    replacements[token] = cfg[key]
  }
  return replacements
}
