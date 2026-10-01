#!/usr/bin/env node
/**
 * 安装仓库自带的 git hooks（可选，显式执行一次即可）
 *
 *   npm run hooks:install    启用
 *   git config --unset core.hooksPath    关闭
 *
 * 为什么不自动装：改用户的 git 配置属于「意外行为」。这里只在你明确执行时生效，
 * 并且是可逆的一条命令。
 *
 * 为什么用 core.hooksPath 而不是往 .git/hooks 拷文件：
 * 拷贝出去的脚本不会随仓库更新，久而久之就和仓库里的版本对不上了。
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HOOKS_DIR = '.githooks'

function git(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}

const probe = git(['rev-parse', '--git-dir'])
if (probe.status !== 0) {
  console.error('❌ 当前目录不是 git 仓库')
  process.exit(1)
}

const current = git(['config', '--get', 'core.hooksPath'])
if (current.status === 0 && current.stdout.trim() !== HOOKS_DIR) {
  console.warn(`⚠️  core.hooksPath 已被设为 ${current.stdout.trim()}`)
  console.warn('   继续会覆盖该设置。如确认，请先执行: git config --unset core.hooksPath')
  process.exit(1)
}

const set = git(['config', 'core.hooksPath', HOOKS_DIR])
if (set.status !== 0) {
  console.error(`❌ 设置 core.hooksPath 失败：${set.stderr || set.stdout}`)
  process.exit(1)
}

// POSIX 上补可执行位；Windows 的 git 不依赖该位
const hook = path.join(ROOT, HOOKS_DIR, 'pre-commit')
if (fs.existsSync(hook) && process.platform !== 'win32') {
  fs.chmodSync(hook, 0o755)
}

console.log(`✅ 已启用仓库 hooks（core.hooksPath=${HOOKS_DIR}）`)
console.log('   提交前会执行: npm run verify -- --no-bash')
console.log('   关闭: git config --unset core.hooksPath')
