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
// 3. shell 脚本、补丁与生成物必须是 LF
//
// 行尾的 \r 会被 bash 当成命令的一部分（$'\r': command not found）；
// 补丁里的 \r 会让 git apply 的上下文匹配失败。
//
// 生成物（generated-routes.js）单列进来是因为它要求「跨平台字节一致」：
// git 比对会归一化换行，所以 CRLF/LF 的差异在 `git diff` 里看不见，
// 但它是「构建可复现」的实际破坏者 —— 必须在这里单独守住。
// ------------------------------------------------------------
{
  const broken = []
  const lfFiles = tracked.filter((f) => f.endsWith('.sh') || f.endsWith('.patch'))
  for (const extra of ['workers/api/src/generated-routes.js']) {
    if (tracked.includes(extra)) lfFiles.push(extra)
  }
  for (const rel of lfFiles) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    if (fs.readFileSync(abs).includes(0x0d)) broken.push(rel)
  }
  record(broken.length === 0, '.sh / .patch / 生成物 均为 LF 换行', broken)
}

// ------------------------------------------------------------
// 3.5 .sh 的「可执行位」必须记进 git
//
// 这条是踩出来的：git 里若是 100644，Linux 上 checkout 出来的 .sh 就没有 +x，
// 而 `bash -c <路径>` 会把路径当命令执行、直接 Permission denied。
// Windows 不校验可执行位（MSYS2 下看着像 755），所以本地一直绿、CI 一直红，
// 而且失败信息只是一句 Permission denied，很容易被当成环境问题忽略。
// ------------------------------------------------------------
{
  const out = run('git', ['ls-files', '-s', '--', '*.sh'], { stdio: 'pipe' }).stdout || ''
  const bad = out
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('100755'))
    .map((l) => `${(l.split('\t')[1] || l).trim()}：应为 100755（git update-index --chmod=+x）`)
  record(bad.length === 0, '.sh 在 git 中记录为可执行', bad)
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
// 4b. PowerShell 语法检查
//
// 与 bash 侧的 `bash -n` 对称。`.ps1` 是 Windows 上真正被执行的那一半，
// 此前却没有任何语法门禁 —— 改坏了要等到真的部署那一刻才会暴露。
// 这里用 PowerShell 自带的解析器（不执行脚本），只做语法分析。
//
// 找不到 powershell 就跳过：非 Windows 环境通常没有，CI 由 Windows 任务覆盖。
// ------------------------------------------------------------
{
  const files = tracked.filter((f) => f.endsWith('.ps1'))

  const candidates = process.platform === 'win32' ? ['powershell', 'pwsh'] : ['pwsh']
  const shell = candidates.find(
    (c) =>
      run(c, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { stdio: 'pipe' })
        .status === 0,
  )

  if (!shell) {
    skip(
      'PowerShell 语法检查',
      `跳过：当前环境没有可用的 PowerShell（试过 ${candidates.join(' / ')}）`,
    )
  } else {
    const broken = []
    for (const rel of files) {
      const abs = path.join(ROOT, rel)
      if (!fs.existsSync(abs)) continue
      // 路径里的单引号要按 PowerShell 的规则转义（双写），否则原样拼进脚本会解析失败
      const quoted = abs.replace(/'/g, "''")
      const code =
        `$e=$null; [System.Management.Automation.Language.Parser]::ParseFile('${quoted}', [ref]$null, [ref]$e) | Out-Null; ` +
        `if ($e -and $e.Count -gt 0) { $e | ForEach-Object { Write-Output ("{0}: {1}" -f $_.Extent.StartLineNumber, $_.Message) }; exit 1 }`
      const r = run(shell, ['-NoProfile', '-NonInteractive', '-Command', code], { stdio: 'pipe' })
      if (r.status !== 0) {
        const first = `${r.stdout || ''}${r.stderr || ''}`
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)[0]
        broken.push(`${rel} — ${first || '解析失败'}`)
      }
    }
    record(broken.length === 0, `PowerShell 语法检查（${files.length} 个文件）`, broken)
  }
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
    for (const key of ['apiWorkerUrl', 'proxyWorkerUrl', 'pagesProdUrl', 'pagesPreviewUrl']) {
      if (cfg[key] && !/^https?:\/\/\S+$/.test(cfg[key])) {
        cfgOk = false
        details.push(`${key} 不是合法 http(s) 地址：${cfg[key]}`)
      }
    }
    // 正式与预览必须落在**不同**的分支上。
    // 两者相同时两次发布互相当作对方，正式环境就永远不会更新 ——
    // 而脚本仍然会打印「正式环境」，属于最难察觉的一类配置错误。
    if (
      cfg.pagesProdBranch &&
      cfg.pagesPreviewBranch &&
      cfg.pagesProdBranch === cfg.pagesPreviewBranch
    ) {
      cfgOk = false
      details.push(
        `pagesProdBranch 与 pagesPreviewBranch 相同（${cfg.pagesProdBranch}）：` +
          '正式与预览必须用不同分支，否则「发正式」等于又发了一次预览',
      )
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
// 10. 离线单元测试
//
// 这是整个门禁里最重要的一项：接口集成测试要外网与登录态，只有这里能在
// 每次提交前把「cookie 解析、cookie 优先级、eapi 请求体、状态码映射」这类
// 真实踩过的坑跑一遍，而且只要几百毫秒。
//
// 依赖 workers/api 自己的 node_modules（crypto-js 等），与根目录是两套。
// ------------------------------------------------------------
{
  const workerDeps = path.join(ROOT, 'workers', 'api', 'node_modules', 'crypto-js')
  if (!fs.existsSync(workerDeps)) {
    record(false, '单元测试', [
      '缺少 workers/api 依赖（crypto-js），无法运行',
      '请执行: npm run setup:worker-deps',
    ])
  } else {
    const r = run(
      process.execPath,
      ['--test', '--test-reporter=tap', 'workers/api/test/**/*.test.mjs'],
      { stdio: 'pipe' },
    )
    const out = `${r.stdout || ''}${r.stderr || ''}`
    const failed = out
      .split('\n')
      .filter((l) => /^\s*not ok /.test(l))
      .map((l) => l.trim().slice(0, 120))
    const summary = /^# tests (\d+)/m.exec(out)
    const passed = /^# pass (\d+)/m.exec(out)
    record(
      r.status === 0,
      `单元测试通过（${passed ? passed[1] : '?'}/${summary ? summary[1] : '?'}）`,
      failed,
    )
  }
}

// ------------------------------------------------------------
// 11. 部署脚本自检（需要 bash）
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
    // 用 `bash -lc 'bash <路径>'` 而不是 `bash -lc '<路径>'`：
    // 后者会把路径当**命令**执行，依赖文件的「可执行位」。Windows 不校验可执行位，
    // 所以本地一直是绿的；Linux runner 上 git 里若没有记录 +x，就会直接
    // `Permission denied` —— 表现出来是「自检失败但一条 [FAIL] 都没有」。
    // 显式用 bash 解释执行，就不再依赖文件模式（仓库里同时也把脚本标成可执行）。
    const r = run(bash.cmd, ['-lc', `bash '${target}'`], { stdio: 'pipe' })
    const out = `${r.stdout || ''}${r.stderr || ''}`
    const lines = out.split('\n').filter((l) => l.trim())
    const offenders = lines.filter((l) => l.includes('[FAIL]')).map((l) => l.trim())

    // 只列出 [FAIL] 行是不够的：自检若「中途异常退出」，一条 [FAIL] 都不会打印，
    // 结果就变成「某项失败但看不到任何原因」。所以失败时把输出末尾一并带出来，
    // 保证任何形式的失败都留得下线索（这一段也会进 CI 的 job summary）。
    const details =
      r.status === 0
        ? offenders
        : offenders.length > 0
          ? offenders
          : [
              '自检没有输出 [FAIL]，多半是中途异常退出。输出末尾：',
              ...lines.slice(-20).map((l) => l.trim()),
            ]

    record(r.status === 0, '部署脚本自检通过', details)
  }
}

// ------------------------------------------------------------
// 12. 生成物可复现（--with-build）
// ------------------------------------------------------------
if (WITH_BUILD) {
  const buildScript = path.join(ROOT, 'workers', 'api', 'scripts', 'build-modules.cjs')
  const build = run(process.execPath, [buildScript], { stdio: 'pipe' })
  if (build.status !== 0) {
    record(false, '生成物可复现', [`build-modules 失败：${(build.stderr || '').trim()}`])
  } else {
    // 与 git 里的版本**逐字节**比较，而不是走 `git diff`。
    //
    // `git diff` 会按 .gitattributes 归一化换行：CRLF 与 LF 在它眼里是同一个文件，
    // 于是「Windows 上构建出 CRLF、入库的是 LF」这种真实的不可复现会被判为通过。
    // 直接比字节，换行符差异也逃不掉。
    const rel = 'workers/api/src/generated-routes.js'
    const details = []
    let same = false
    try {
      const committed = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT })
      const onDisk = fs.readFileSync(path.join(ROOT, rel))
      same = committed.equals(onDisk)
      if (!same) {
        details.push(
          `重新构建后与入库版本不一致（入库 ${committed.length} 字节 / 重建 ${onDisk.length} 字节，` +
            `换行符差异也算）`,
          '请执行 npm run deps:update 并提交重建产物',
        )
      }
    } catch (e) {
      details.push(`无法取出入库版本做比较：${e.message}`)
    }
    record(same, 'generated-routes.js 与重新构建结果逐字节一致', details)
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

// ------------------------------------------------------------
// CI 摘要
//
// 失败时把「哪几项挂了、具体是什么」写进 job summary。这样做的好处：
// 排查 CI 失败不必去翻动辄几千行的日志（日志还需要认证才能取），
// 在 GitHub 的 Checks 页面、甚至公开的 check-runs API 上就能直接读到结论。
// 这一步失败不影响退出码。
// ------------------------------------------------------------
if (process.env.GITHUB_STEP_SUMMARY) {
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const md = ['## 仓库自检', '']
  md.push(
    `**结果**：${failed === 0 ? '✅ 全部通过' : `❌ ${failed} / ${results.length} 项未通过`}`,
    '',
  )
  md.push('| 检查项 | 结果 |', '| --- | --- |')
  for (const r of results) {
    md.push(`| ${cell(r.title)} | ${r.skipped ? '跳过' : r.ok ? '通过' : '失败'} |`)
  }

  const failures = results.filter((r) => !r.ok && !r.skipped)
  if (failures.length) {
    md.push('', '### 失败详情', '')
    for (const f of failures) {
      md.push(`- **${cell(f.title)}**`)
      for (const d of f.details.slice(0, 20)) md.push(`  - ${cell(d).slice(0, 300)}`)
    }
  }

  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n', 'utf8')
  } catch (e) {
    console.error(`（写入 job summary 失败，不影响结论：${e.message}）`)
  }
}

process.exit(failed === 0 ? 0 : 1)
