#!/usr/bin/env node
/**
 * 打印仓库状态，供 bash / PowerShell 部署脚本取用
 *
 * 用法:
 *   node scripts/git-meta.mjs hash    # 完整提交号；取不到时打印空串
 *   node scripts/git-meta.mjs dirty   # true / false
 *
 * 判断口径见 scripts/lib/git-meta.mjs —— 与 finalize-dist.mjs 共用同一份实现，
 * 保证 Pages 控制台与产物里的 /version.json 说法一致。
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { commitHash, workingTreeDirty } from './lib/git-meta.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const what = process.argv[2]
switch (what) {
  case 'hash':
    process.stdout.write(commitHash(ROOT) || '')
    break
  case 'dirty':
    process.stdout.write(workingTreeDirty(ROOT) ? 'true' : 'false')
    break
  default:
    console.error('用法: node scripts/git-meta.mjs <hash|dirty>')
    process.exit(2)
}
