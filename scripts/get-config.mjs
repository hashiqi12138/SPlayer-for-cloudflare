#!/usr/bin/env node
/**
 * 从 deploy.config.json 读一个配置值并打印（供 bash 脚本取用）
 *
 * bash 里读 JSON 不方便，用它替代容易出错的 grep/sed 解析：
 *   PAGES_PROJECT=$(node scripts/get-config.mjs pagesProject)
 *
 * 用法: node scripts/get-config.mjs <key>
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.join(__dirname, '..', 'deploy.config.json')

const key = process.argv[2]
if (!key) {
  console.error('用法: node scripts/get-config.mjs <key>')
  process.exit(2)
}

let cfg
try {
  cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
} catch (e) {
  console.error(`无法读取 deploy.config.json: ${e.message}`)
  process.exit(2)
}

const value = cfg[key]
if (value === undefined || value === null) {
  console.error(`deploy.config.json 中没有 ${key}`)
  process.exit(2)
}

// 只输出值本身，便于命令替换；空字符串表示该键存在但为空
process.stdout.write(String(value))
