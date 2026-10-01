#!/usr/bin/env node
/**
 * 仓库自检门禁
 *
 * 设计原则
 * --------
 * **CI 与本地跑的是同一条命令**。以前这些检查散在 workflow 的一段段内联 bash 里，
 * Windows 上想复现只能靠肉眼读 YAML —— 一旦两边行为不一致，CI 就变成「只有推上去
 * 才知道红不红」的黑盒。收拢到这里之后：
 *
 *   npm run verify              本地能跑的，CI 也跑这些
 *   npm run verify -- --with-build   额外验证生成物可复现（需要先 npm run deps:setup）
 *
 * 不做的事
 * --------
 * 不跑接口测试（test:api）：它依赖外网与真实登录态，属于集成测试，不放进常规门禁。
 * 不校验发布闸门（deps.mjs verify-deploy）：那要求先跑过 deps:update，是部署时的事。
 */

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  CONFIG_FILE,
  PLACEHOLDER_RE,
  PLACEHOLDER_TO_CONFIG_KEY,
  REQUIRED_CONFIG_KEYS,
  ROOT,
} from './lib/deploy-config.mjs'

const argv = new Set(process.argv.slice(2))
const WITH_BUILD = argv.has('--with-build')
const SKIP_BASH = argv.has('--no-bash')

/** 不属于本仓库的内容：上游 submodule、依赖、构建产物、本地状态 */
const SKIP_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'out',
  'dist',
  '.wrangler',
  'test-results',
  'splayer-frontend',
  'ncm-source',
])

const results = []
let failed = 0

function record(ok, title, details = []) {
  results.push({ ok, title, details })
  if (!ok) failed++
}

/** 跳过不算通过也不算失败：环境不具备，且 CI 会覆盖这一项 */
function skip(title, reason) {
  results.push({ ok: true, title, details: [reason], skipped: true })
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd),
    ...opts,
  })
}

/**
 * 找一个能真正执行部署脚本的 bash
 *
 * Windows 上的 `bash` 很可能是 WSL 的入口，它读不了 G:\ 这种 Windows 路径，
 * 直接用会把「环境不具备」误报成「脚本坏了」。这里要求 `uname -o` 返回
 * Msys / Cygwin 才认账（Git Bash、MSYS2 都属于这一类）。
 * 也可用 VERIFY_BASH_PATH 显式指定。
 */
function posixBash() {
  const candidate = process.env.VERIFY_BASH_PATH || 'bash'
  // 用登录 shell（-l）探测与执行：MSYS2/Git Bash 直接以非登录方式被 spawn 时，
  // PATH 里可能没有 /usr/bin，脚本里再调 `bash` 就会找不到自己。
  const probe = run(candidate, ['-lc', 'uname -o'], { stdio: 'pipe' })
  if (probe.status !== 0) return null
  const os = String(probe.stdout || '').trim()
  if (process.platform !== 'win32') return { cmd: candidate, uname: os }
  if (!/msys|cygwin/i.test(os)) return null
  return { cmd: candidate, uname: os }
}

/** Windows 路径 -> MSYS/Cygwin 可识别的 /c/... 形式 */
function toPosixPath(p) {
  return p.replace(/^([A-Za-z]):[\\/]/, (_, d) => `/${d.toLowerCase()}/`).replace(/\\/g, '/')
}

// ------------------------------------------------------------
// 文件收集
// ------------------------------------------------------------

/** 受 git 跟踪的文件；没有 git 时回退为遍历目录 */
function trackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    return out.split('\n').filter(Boolean)
  } catch (e) {
    return walk(ROOT).map((p) => path.relative(ROOT, p).replace(/\\/g, '/'))
  }
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_SEGMENTS.has(entry.name)) continue
      walk(path.join(dir, entry.name), acc)
    } else if (entry.isFile()) {
      acc.push(path.join(dir, entry.name))
    }
  }
  return acc
}

const tracked = trackedFiles()
const owned = (rel) => !rel.split('/').some((seg) => SKIP_SEGMENTS.has(seg))
const ourSourceFiles = walk(ROOT)

// ------------------------------------------------------------
// 1. 已被 gitignore 却仍在版本控制里的文件
//
// 这类文件（生成的测试报告、本地凭据）一旦入库，之后每次改动都会产生无意义的 diff，
// 而且很容易让人误以为「仓库里就该有它」。本仓库就踩过：24 个测试报告被跟踪了很久。
// ------------------------------------------------------------
{
  let stale = []
  let gitOk = true
  try {
    stale = execFileSync('git', ['ls-files', '-i', '-c', '--exclude-standard'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
  } catch (e) {
    gitOk = false
  }
  if (!gitOk) {
    skip('版本控制卫生', '跳过：git 不可用')
  } else {
    record(
      stale.length === 0,
      '没有「已被忽略却仍被跟踪」的文件',
      stale.slice(0, 10).concat(stale.length > 10 ? [`… 共 ${stale.length} 个`] : []),
    )
  }
}

// ------------------------------------------------------------
// 2. PowerShell 脚本必须带 UTF-8 BOM
//
// Windows PowerShell 5.1 会把无 BOM 的 UTF-8 按系统 ANSI 代码页解码，
// 脚本里的中文变成乱码后可能破坏引号/括号配对，直接报解析错误。
// ------------------------------------------------------------
{
  const broken = []
  for (const rel of tracked.filter((f) => f.endsWith('.ps1'))) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    const b = fs.readFileSync(abs)
    if (!(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)) broken.push(rel)
  }
  record(broken.length === 0, '.ps1 带 UTF-8 BOM', broken)
}

// ------------------------------------------------------------
// 3. shell 脚本与补丁必须是 LF
//
// 行尾的 \r 会被 bash 当成命令的一部分（$'\r': command not found）；
// 补丁里的 \r 会让 git apply 的上下文匹配失败。
// ------------------------------------------------------------
{
  const broken = []
  for (const rel of tracked.filter((f) => f.endsWith('.sh') || f.endsWith('.patch'))) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    if (fs.readFileSync(abs).includes(0x0d)) broken.push(rel)
  }
  record(broken.length === 0, '.sh / .patch 均为 LF 换行', broken)
}

// ------------------------------------------------------------
// 4. 自有 JS 语法检查
// ------------------------------------------------------------
{
  const files = ourSourceFiles.filter((p) => /\.(js|cjs|mjs)$/.test(p))
  const broken = []
  for (const abs of files) {
    const r = run(process.execPath, ['--check', abs], { stdio: 'ignore' })
    if (r.status !== 0) broken.push(path.relative(ROOT, abs))
  }
  record(broken.length === 0, `JS 语法检查（${files.length} 个文件）`, broken)
}

// ------------------------------------------------------------
// 5. JSON 可解析 + 部署配置完整
// ------------------------------------------------------------
{
  const jsonFiles = [
    'package.json',
    'package-lock.json',
    'deploy.config.json',
    'workers/api/package.json',
  ].filter((f) => fs.existsSync(path.join(ROOT, f)))

  const broken = []
  for (const rel of jsonFiles) {
    try {
      JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
    } catch (e) {
      broken.push(`${rel}: ${e.message}`)
    }
  }
  record(broken.length === 0, 'JSON 可解析', broken)

  // 配置文件是部署链路的中枢，缺字段必须在这里就拦住，而不是等部署到一半才报
  let cfgOk = true
  const details = []
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    const missing = REQUIRED_CONFIG_KEYS.filter((k) => !cfg[k])
    if (missing.length) {
      cfgOk = false
      details.push(`缺少字段：${missing.join(', ')}`)
    }
    for (const key of ['apiWorkerUrl', 'proxyWorkerUrl', 'pagesUrl']) {
      if (cfg[key] && !/^https?:\/\/\S+$/.test(cfg[key])) {
        cfgOk = false
        details.push(`${key} 不是合法 http(s) 地址：${cfg[key]}`)
      }
    }
  } catch (e) {
    cfgOk = false
    details.push(e.message)
  }
  record(cfgOk, 'deploy.config.json 完整且取值合法', details)
}

// ------------------------------------------------------------
// 6. 占位符与配置字段一一对应
//
// 两个方向都查：
//   模板里出现的占位符必须在映射表里（否则部署时注入不到，线上会露出 __XXX__）
//   映射表里的占位符必须在模板里用到（否则说明模板改了、表没跟上）
// ------------------------------------------------------------
{
  const templateDir = path.join(ROOT, 'frontend-config', 'functions')
  const found = new Set()
  const walkTemplates = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walkTemplates(p)
      else for (const m of fs.readFileSync(p, 'utf8').match(PLACEHOLDER_RE) || []) found.add(m)
    }
  }
  walkTemplates(templateDir)

  const details = []
  for (const token of found) {
    if (!PLACEHOLDER_TO_CONFIG_KEY[token]) {
      details.push(`模板使用了未登记的占位符 ${token}（请在 lib/deploy-config.mjs 登记）`)
    }
  }
  for (const token of Object.keys(PLACEHOLDER_TO_CONFIG_KEY)) {
    if (!found.has(token)) {
      details.push(`映射表里的 ${token} 在 frontend-config/functions 中已不再使用`)
    }
  }
  record(details.length === 0, `占位符与配置字段一致（模板中 ${found.size} 个）`, details)
}

// ------------------------------------------------------------
// 7. 秘密不入库
//
// 只扫被 git 跟踪的文件：生成物里可能带调试用的 cookie，那是本地文件、
// 不该被拿来判定「仓库泄露了秘密」。
// ------------------------------------------------------------
{
  const PATTERNS = [
    { re: /MUSIC_U=[A-Za-z0-9%+_\-/]{20,}/, name: '网易云 MUSIC_U cookie 值' },
    { re: /__csrf=[A-Za-z0-9%_\-]{10,}/, name: '网易云 __csrf 值' },
    { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, name: '私钥' },
    {
      re: /CLOUDFLARE_API_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/,
      name: 'Cloudflare API Token',
    },
  ]
  const TEXT_EXT = /\.(js|cjs|mjs|json|md|ps1|sh|toml|yml|yaml|txt|patch|env|example)$/

  const hits = []
  for (const rel of tracked) {
    if (!TEXT_EXT.test(rel)) continue
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    const text = fs.readFileSync(abs, 'utf8')
    for (const { re, name } of PATTERNS) {
      if (re.test(text)) hits.push(`${rel}（疑似${name}）`)
    }
  }
  record(hits.length === 0, '未发现疑似凭据入库', hits)
}

// ------------------------------------------------------------
// 8. 锁文件与 package.json 一致
//
// 不一致时 `npm ci` 会直接失败 —— 而在 CI 上失败就太晚了，本地就该拦住。
// 锁文件同时也是 wrangler 版本可复现的前提（部署脚本走本地安装的版本）。
// ------------------------------------------------------------
{
  const pkgPath = path.join(ROOT, 'package.json')
  const lockPath = path.join(ROOT, 'package-lock.json')
  const details = []

  if (!fs.existsSync(lockPath)) {
    details.push('缺少 package-lock.json：依赖版本无法复现，请执行 npm install 后提交')
  } else {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    const rootEntry = lock.packages?.[''] || {}
    const declared = { ...pkg.dependencies, ...pkg.devDependencies }
    const locked = { ...rootEntry.dependencies, ...rootEntry.devDependencies }

    for (const [name, spec] of Object.entries(declared)) {
      if (!(name in locked)) details.push(`锁文件缺少 ${name}（请执行 npm install）`)
      else if (locked[name] !== spec) {
        details.push(`${name} 版本声明不一致：package.json=${spec}，锁文件=${locked[name]}`)
      }
    }
    for (const name of Object.keys(locked)) {
      if (!(name in declared)) details.push(`锁文件多出 ${name}（package.json 里已移除？）`)
    }
  }
  record(details.length === 0, 'package-lock.json 与 package.json 一致', details)
}

// ------------------------------------------------------------
// 9. 代码格式
// ------------------------------------------------------------
{
  const prettierBin = path.join(ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs')
  if (!fs.existsSync(prettierBin)) {
    skip('代码格式', '跳过：未安装依赖，先执行 npm ci')
  } else {
    const r = run(process.execPath, [prettierBin, '--check', '.'], { stdio: 'pipe' })
    const out = `${r.stdout || ''}${r.stderr || ''}`
    const offenders = out
      .split('\n')
      .filter((l) => l.includes('[warn]'))
      .map((l) => l.replace(/^\[warn\]\s*/, '').trim())
    record(
      r.status === 0,
      '代码格式符合 .prettierrc',
      offenders.length ? offenders.concat('运行 npm run format 可自动修复') : [],
    )
  }
}

// ------------------------------------------------------------
// 10. 部署脚本自检（需要 bash）
// ------------------------------------------------------------
{
  const bash = SKIP_BASH ? null : posixBash()
  if (!bash) {
    skip(
      '部署脚本自检',
      SKIP_BASH
        ? '跳过：--no-bash'
        : '跳过：当前环境没有可用的 bash（Windows 请用 Git Bash / MSYS2，或设 VERIFY_BASH_PATH）',
    )
  } else {
    const script = path.join(ROOT, 'scripts', 'tests', 'deploy-scripts.test.sh')
    const target = process.platform === 'win32' ? toPosixPath(script) : script
    const r = run(bash.cmd, ['-lc', target], { stdio: 'pipe' })
    const out = `${r.stdout || ''}${r.stderr || ''}`
    const offenders = out
      .split('\n')
      .filter((l) => l.includes('[FAIL]'))
      .map((l) => l.trim())
    record(r.status === 0, '部署脚本自检通过', offenders)
  }
}

// ------------------------------------------------------------
// 11. 生成物可复现（--with-build）
// ------------------------------------------------------------
if (WITH_BUILD) {
  const buildScript = path.join(ROOT, 'workers', 'api', 'scripts', 'build-modules.cjs')
  const build = run(process.execPath, [buildScript], { stdio: 'pipe' })
  if (build.status !== 0) {
    record(false, '生成物可复现', [`build-modules 失败：${(build.stderr || '').trim()}`])
  } else {
    const diff = run('git', ['diff', '--exit-code', '--', 'workers/api/src/generated-routes.js'], {
      stdio: 'pipe',
    })
    record(
      diff.status === 0,
      'generated-routes.js 与重新构建结果一致',
      diff.status === 0
        ? []
        : ['重新构建后与入库版本不一致：请执行 npm run deps:update 并提交重建产物'],
    )
  }
}

// ------------------------------------------------------------
// 汇总
// ------------------------------------------------------------
console.log('\n仓库自检')
console.log('─'.repeat(72))
for (const r of results) {
  const mark = r.skipped ? '○' : r.ok ? '✅' : '❌'
  console.log(`${mark} ${r.title}`)
  for (const d of r.details) console.log(`     ${d}`)
}
console.log('─'.repeat(72))

if (failed === 0) {
  console.log(`✅ 全部通过（${results.length} 项）`)
} else {
  console.log(`❌ ${failed} / ${results.length} 项未通过`)
}
process.exit(failed === 0 ? 0 : 1)
