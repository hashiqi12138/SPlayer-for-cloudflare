#!/usr/bin/env node
/**
 * 构建产物收尾（部署前最后一步，由部署脚本在「构建之后、上传之前」调用）
 *
 * 做三件事，都必须在产物目录里落地才能生效：
 *   1. 把 frontend-config/_redirects、_headers 复制进 out/renderer
 *   2. 写入 version.json（版本 / 提交 / 依赖 pin / 构建时间）
 *   3. 校验必需文件都在，缺任一直接失败
 *
 * 为什么单独有这么一步
 * --------------------
 * 之前 frontend-config/_redirects 被复制到了前端项目根目录，而 wrangler 上传的只有
 * out/renderer —— 也就是说这条 SPA 兜底规则**从来没有生效过**，线上能用只是因为
 * Cloudflare Pages 对未命中路径恰好会回退到 index.html。这种「看起来配了、实际没生效」
 * 的状态最危险：一旦平台行为变化，深层链接会静默 404。
 * 现在把所有「必须出现在产物里」的东西集中在这一步，并且缺文件就报错。
 *
 * 用法:
 *   node scripts/finalize-dist.mjs
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { ROOT } from './lib/deploy-config.mjs'
import { workingTreeDirty } from './lib/git-meta.mjs'

const OUTPUT_DIR = path.join(ROOT, 'splayer-frontend', 'out', 'renderer')
const CONFIG_DIR = path.join(ROOT, 'frontend-config')
const DEPS_STATE = path.join(ROOT, '.deps-state.json')

/** 从 frontend-config 复制进产物的文件（缺了就是配置漂移，直接报错） */
const ASSET_FILES = ['_redirects', '_headers']

/** 产物里必须存在的文件 */
const REQUIRED_IN_OUTPUT = ['index.html', 'version.json', '_redirects']

function fail(msg, hint) {
  console.error(`  ❌ ${msg}`)
  if (hint) console.error(`     ${hint}`)
  process.exit(1)
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch (e) {
    return ''
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return null
  }
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fail(
    `构建产物目录不存在：${path.relative(ROOT, OUTPUT_DIR)}`,
    '这一步必须在构建之后执行，否则产物里不会有版本戳与 Pages 配置',
  )
}

// ------------------------------------------------------------
// 1. Pages 配置（_redirects / _headers）
// ------------------------------------------------------------
let copied = 0
for (const name of ASSET_FILES) {
  const src = path.join(CONFIG_DIR, name)
  if (!fs.existsSync(src)) {
    fail(`缺少 frontend-config/${name}`, '该文件是产物的一部分，请从仓库恢复')
  }
  fs.copyFileSync(src, path.join(OUTPUT_DIR, name))
  copied++
}

// ------------------------------------------------------------
// 2. version.json
// ------------------------------------------------------------
const pkg = readJson(path.join(ROOT, 'package.json')) || {}
const depsState = readJson(DEPS_STATE)

// 判断口径与部署时传给 wrangler 的 --commit-hash / --commit-dirty 共用同一份实现
// （scripts/lib/git-meta.mjs），否则 Pages 控制台与这里的 version.json 会互相矛盾。
const dirty = workingTreeDirty(ROOT)

const info = {
  name: pkg.name || 'splayer-cloudflare',
  version: pkg.version || '0.0.0',
  commit: git(['rev-parse', 'HEAD']) || null,
  commitShort: git(['rev-parse', '--short=7', 'HEAD']) || null,
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) || null,
  // 工作区有未提交改动时，「线上对应哪个提交」就不精确了，必须显式记下来，
  // 否则排查时会被这个字段误导。
  dirty,
  builtAt: new Date().toISOString(),
  deps: {},
  tests: null,
}

for (const [name, d] of Object.entries(depsState?.deps || {})) {
  info.deps[name] = d?.commit ? String(d.commit).slice(0, 7) : null
}
if (depsState?.tests) {
  info.tests = {
    at: depsState.tests.at,
    passed: depsState.tests.passed,
    blocked: depsState.tests.blocked,
    failed: depsState.tests.failed,
  }
}

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'version.json'),
  JSON.stringify(info, null, 2) + '\n',
  'utf8',
)

// ------------------------------------------------------------
// 3. 产物自检
// ------------------------------------------------------------
const missing = REQUIRED_IN_OUTPUT.filter((f) => !fs.existsSync(path.join(OUTPUT_DIR, f)))
if (missing.length) {
  fail(`构建产物缺少必需文件：${missing.join(', ')}`)
}

// 3.1 API 地址是否真的编进了前端
//
// 真实事故：.env 是在构建**之后**才由 prepare-pages.mjs 写出来的，于是
// electron-vite 打包时 import.meta.env 是空对象，`String(import.meta.env["VITE_API_URL"])`
// 被编译成 `String({}.VITE_API_URL)` → 运行时得到字符串 "undefined"，
// 前端所有接口都发到 https://<页面域名>/undefined/song/detail 上。
// 页面能打开、能渲染，只是所有数据都空 —— 从界面完全看不出是构建顺序问题。
//
// 这里直接扫产物 JS：既确认目标地址在，也确认没有残留 `{}.VITE_API_URL` 这种空 env。
const expectedApiUrl = process.env.API_URL || '/api/netease'
const assetsDir = path.join(OUTPUT_DIR, 'assets')
let sawApiUrl = false
let sawEmptyEnv = false

if (fs.existsSync(assetsDir)) {
  for (const name of fs.readdirSync(assetsDir)) {
    if (!name.endsWith('.js')) continue
    const text = fs.readFileSync(path.join(assetsDir, name), 'utf8')
    if (text.includes(expectedApiUrl)) sawApiUrl = true
    if (/\{\s*\}\s*\.\s*VITE_/.test(text)) sawEmptyEnv = true
  }
}

if (sawEmptyEnv) {
  fail(
    '产物里出现空 env（形如 {}.VITE_API_URL），说明构建时 .env 还没生成',
    `请先跑 prepare-pages.mjs 再构建；本次期望的 VITE_API_URL 是 ${expectedApiUrl}`,
  )
}
if (!sawApiUrl) {
  fail(
    `产物里找不到 API 地址 ${expectedApiUrl}`,
    '前端 baseURL 会是 undefined，所有接口都会 404；请确认构建前 .env 已写入 VITE_API_URL',
  )
}

console.log(`  ✅ Pages 配置已进入产物（${copied} 个文件）`)
console.log(
  `  ✅ version.json：${info.version} @ ${info.commitShort || 'unknown'}` +
    `${dirty ? '（工作区有未提交改动）' : ''}`,
)
console.log(`  ✅ 产物自检通过（${REQUIRED_IN_OUTPUT.join(' / ')}，API 地址 ${expectedApiUrl}）`)
if (!info.commit) {
  console.log('  ⚠️  取不到 git 提交号：请确认当前目录仍是 git 仓库')
}
