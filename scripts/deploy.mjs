#!/usr/bin/env node
/**
 * 部署入口（跨平台分派）
 *
 * 部署脚本有两套实现：
 *   scripts/deploy-pages.ps1  /  scripts/deploy-*.sh
 * 两者流程一致，只是运行环境不同。npm scripts 若直接写死
 * `powershell -File ...`，在 macOS / Linux / CI 上就无法执行。
 * 这里做一层极薄的分派：
 *
 *   Windows  -> PowerShell（deploy-*.ps1）
 *   其他平台 -> bash（deploy-*.sh）
 *
 * 用法:
 *   node scripts/deploy.mjs <pages|api|proxy|all> [额外参数...]
 *
 * 环境变量:
 *   DEPLOY_SHELL=ps1|bash   强制指定实现（例如 Windows 上想用 Git Bash / MSYS2 跑 bash 版）
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const TARGETS = {
  pages: 'deploy-pages',
  api: 'deploy-api-worker',
  proxy: 'deploy-proxy-worker',
  all: 'deploy-all',
}

const [, , target, ...rest] = process.argv
if (!target || !TARGETS[target]) {
  console.error(`用法: node scripts/deploy.mjs <${Object.keys(TARGETS).join('|')}> [参数...]`)
  process.exit(2)
}

const base = TARGETS[target]

// 选择实现：显式配置优先，否则按平台
let shell = (process.env.DEPLOY_SHELL || '').toLowerCase()
if (shell !== 'ps1' && shell !== 'bash') {
  shell = process.platform === 'win32' ? 'ps1' : 'bash'
}

let cmd
let args
if (shell === 'ps1') {
  const script = path.join(__dirname, `${base}.ps1`)
  // 统一转成 PowerShell 的参数写法：
  //   --non-interactive / -y / --yes  -> -NonInteractive
  //   --preview                       -> -Preview
  const psArgs = rest
    .map((a) => {
      if (a === '--non-interactive' || a === '-y' || a === '--yes') return '-NonInteractive'
      if (a === '--preview') return '-Preview'
      // --prod 是 bash 侧的显式写法；PowerShell 侧「不带 -Preview」就是正式环境
      if (a === '--prod') return null
      return a
    })
    .filter((a) => a !== null)
  cmd = 'powershell'
  args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...psArgs]
} else {
  const script = path.join(__dirname, `${base}.sh`)
  cmd = 'bash'
  args = [script, ...rest]
}

console.log(`  [i]  运行: ${shell === 'ps1' ? base + '.ps1' : 'bash ' + base + '.sh'}`)
const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' })
if (r.error) {
  console.error(
    `  [x]  无法启动 ${cmd}：${r.error.message}\n` +
      (shell === 'bash'
        ? '       请确认已安装 bash（Windows 可用 Git Bash / MSYS2 / WSL）'
        : '       请确认已安装 PowerShell'),
  )
  process.exit(1)
}
process.exit(r.status ?? 1)
