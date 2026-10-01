#!/usr/bin/env node
/**
 * 前端部署前的准备工作（跨平台）
 *
 * 这段逻辑原本只写在 scripts/deploy-pages.ps1 里。加上 bash 版本后，
 * 若两边各写一份，配置解析、占位符注入这类细节极容易逐渐跑偏，
 * 因此抽成 Node 共享实现，PowerShell 与 bash 都调用它。
 *
 * 职责：
 *   1. 读取 deploy.config.json（地址的唯一事实来源，见 lib/deploy-config.mjs）
 *   2. 同步 frontend-config/functions -> splayer-frontend/functions，
 *      并把 __API_WORKER_URL__ / __PROXY_WORKER_URL__ 注入为真实地址
 *   3. 同步 _redirects
 *   4. 保证 .env 存在，并写入 VITE_API_URL
 *
 * 用法:
 *   node scripts/prepare-pages.mjs [--api-url=/api/netease]
 *   API_URL=/api/netease node scripts/prepare-pages.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PLACEHOLDER_RE, ROOT, loadConfig, resolveReplacements } from './lib/deploy-config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_DIR = path.join(ROOT, 'splayer-frontend')
const CONFIG_DIR = path.join(ROOT, 'frontend-config')

const DEFAULT_API_URL = '/api/netease'

function fail(msg, hint) {
  console.error(`  ❌ ${msg}`)
  if (hint) console.error(`     ${hint}`)
  process.exit(1)
}

/** 同步 Pages Functions 并注入地址 */
function syncFunctions(cfg) {
  const src = path.join(CONFIG_DIR, 'functions')
  const dest = path.join(FRONTEND_DIR, 'functions')
  if (!fs.existsSync(src)) {
    console.log('  ⚠️  frontend-config/functions 不存在，跳过')
    return 0
  }

  // 必须先删掉目标目录再复制：否则会把源目录整个塞进去，
  // 生成 functions/functions/... 的嵌套副本，部署后多出一批无用路由。
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true })
  }
  fs.cpSync(src, dest, { recursive: true })

  const replacements = resolveReplacements(cfg)

  let patched = 0
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(p)
        continue
      }
      if (!entry.name.endsWith('.js')) continue

      const before = fs.readFileSync(p, 'utf8')
      let after = before
      for (const [token, value] of Object.entries(replacements)) {
        after = after.split(token).join(value)
      }
      if (after !== before) {
        fs.writeFileSync(p, after, 'utf8')
        patched++
      }
    }
  }
  walk(dest)

  // 残留占位符说明模板里写了没在 lib/deploy-config.mjs 登记的 token
  const leftovers = []
  const check = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) check(p)
      else if (fs.readFileSync(p, 'utf8').match(PLACEHOLDER_RE)) {
        leftovers.push(path.relative(ROOT, p))
      }
    }
  }
  check(dest)
  if (leftovers.length) {
    fail(`Functions 中仍残留未替换的占位符：${leftovers.join(', ')}`)
  }

  return patched
}

/**
 * 校验 API 地址形态
 *
 * 只允许两种：站内相对路径（/api/netease）或 http(s) 绝对地址。
 * 这道校验是为了拦住一类**静默出错**：MSYS2 / Git Bash 会把形似 POSIX 路径的
 * 参数与环境变量改写成 Windows 路径，/api/netease 会变成
 * E:/build-tool/msys2/api/netease。若只看日志「VITE_API_URL 已设置」是看不出来的，
 * 线上表现却是所有接口 404。这里直接拒绝，并给出排查方向。
 */
function validateApiUrl(apiUrl) {
  if (/^https?:\/\/\S+$/.test(apiUrl)) return
  if (/^\/(?!\/)[^\s:\\]*$/.test(apiUrl)) return
  fail(
    `VITE_API_URL 取值不合法：${apiUrl}`,
    '应为站内相对路径（如 /api/netease）或 http(s) 绝对地址；' +
      '若形如 E:/.../api/netease，说明被 MSYS2/Git Bash 的路径转换改写了',
  )
}

/** 同步 _redirects */
function syncRedirects() {
  const src = path.join(CONFIG_DIR, '_redirects')
  const dest = path.join(FRONTEND_DIR, '_redirects')
  if (!fs.existsSync(src)) {
    console.log('  ⚠️  frontend-config/_redirects 不存在，跳过')
    return
  }
  fs.copyFileSync(src, dest)
}

/** 保证 .env 存在，并写入 VITE_API_URL */
function ensureEnv(apiUrl) {
  const envFile = path.join(FRONTEND_DIR, '.env')
  const envExample = path.join(FRONTEND_DIR, '.env.example')

  if (!fs.existsSync(envFile)) {
    if (fs.existsSync(envExample)) {
      fs.copyFileSync(envExample, envFile)
    } else {
      fs.writeFileSync(
        envFile,
        ['VITE_WEB_PORT=14558', 'VITE_SERVER_PORT=25884', `VITE_API_URL=${apiUrl}`, ''].join('\n'),
        'utf8',
      )
    }
  }

  let content = fs.readFileSync(envFile, 'utf8')
  if (/VITE_API_URL\s*=.*/.test(content)) {
    content = content.replace(/VITE_API_URL\s*=.*/, `VITE_API_URL=${apiUrl}`)
  } else {
    content = content.replace(/\s*$/, '') + `\nVITE_API_URL=${apiUrl}\n`
  }
  fs.writeFileSync(envFile, content, 'utf8')
}

function main() {
  // 优先级：命令行 > 环境变量 > 默认值。
  // 之所以支持环境变量：MSYS2 / Git Bash 会对形似路径的命令行参数做路径转换，
  // `--api-url=/api/netease` 可能被改写成 `C:\...\api\netease`，走环境变量更稳。
  const apiUrlArg = process.argv.find((a) => a.startsWith('--api-url='))
  const apiUrl = apiUrlArg
    ? apiUrlArg.split('=').slice(1).join('=')
    : process.env.API_URL || DEFAULT_API_URL

  console.log('  准备前端部署资源...')

  validateApiUrl(apiUrl)

  let cfg
  try {
    cfg = loadConfig()
  } catch (e) {
    fail(e.message)
  }

  syncRedirects()
  console.log('  ✅ _redirects 已同步')

  const patched = syncFunctions(cfg)
  console.log(`  ✅ Pages Functions 已同步（注入地址 ${patched} 个文件）`)

  ensureEnv(apiUrl)
  console.log(`  ✅ .env 已就绪（VITE_API_URL=${apiUrl}）`)
}

main()
