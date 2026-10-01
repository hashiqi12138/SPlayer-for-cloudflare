/**
 * 生成路由表与上游路由规则的一致性检查（离线）
 *
 * 背景
 * ----
 * build-modules.cjs 把 `module/<name>.js` 映射成路由，默认规则是「下划线换成斜杠」，
 * 但上游 server.js 里有一张 specificRoute 例外表：
 *
 *     const special = {
 *       'daily_signin.js': '/daily_signin',
 *       'fm_trash.js': '/fm_trash',
 *       'personal_fm.js': '/personal_fm',
 *     }
 *
 * 漏掉这张表会让这几个接口注册到**错误的路径**上，真实路径直接 404。
 * 线上确实出过：`GET /personal_fm` 返回 `{ code: 404, msg: 'Not Found' }`。
 *
 * 这个测试的价值在于「不写死预期」
 * --------------------------------
 * 它从上游源码里**解析**出规则，再与生成结果逐条比对。所以：
 *   - 上游往例外表里加条目 → 这里失败，而不是等用户来报 404
 *   - 我们的映射逻辑写错 → 这里失败，而不是部署后才发现
 * 如果只是断言几个固定路径，下一次同样的问题会换个接口再犯。
 *
 * 依赖：需要先 `npm run deps:setup` 把 ncm-source 检出到固定版本。
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { moduleFns, routeStats } from '../src/generated-routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NCM_DIR = path.resolve(__dirname, '..', 'ncm-source')
const MODULE_DIR = path.join(NCM_DIR, 'module')
const SERVER_JS = path.join(NCM_DIR, 'server.js')

/** 默认映射：文件名 -> 路由（与 build-modules.cjs 的 moduleNameToRoute 保持同一规则） */
function defaultRoute(file) {
  return '/' + file.replace(/_/g, '/').replace(/\.js$/, '')
}

/** 从上游 server.js 里解析 specificRoute 例外表 */
function parseUpstreamSpecificRoutes(source) {
  const block = /const special = \{([\s\S]*?)\n\s*\}/.exec(source)
  if (!block) return null
  const map = {}
  for (const m of block[1].matchAll(/'([^']+\.js)'\s*:\s*'([^']+)'/g)) {
    map[m[1]] = m[2]
  }
  return map
}

describe('generated-routes 与上游路由规则一致', () => {
  it('依赖已就位（缺失时提示先跑 deps:setup）', () => {
    assert.ok(
      fs.existsSync(MODULE_DIR) && fs.existsSync(SERVER_JS),
      `找不到上游依赖：${NCM_DIR}\n请先执行: npm run deps:setup`,
    )
  })

  it('每个未跳过模块的预期路由都已注册', () => {
    const specific = parseUpstreamSpecificRoutes(fs.readFileSync(SERVER_JS, 'utf8'))
    assert.ok(specific, '无法从上游 server.js 解析出 specificRoute 例外表，解析规则可能需要更新')

    const skipped = new Set((routeStats.skippedModules || []).map((s) => s.route))
    const files = fs.readdirSync(MODULE_DIR).filter((f) => f.endsWith('.js'))

    const missing = []
    for (const file of files) {
      const expected = specific[file] || defaultRoute(file)
      if (skipped.has(expected)) continue
      if (typeof moduleFns[expected] !== 'function') missing.push(`${expected}  (来自 ${file})`)
    }

    assert.deepEqual(
      missing,
      [],
      `以下接口注册到了错误的路径（上游例外表：${JSON.stringify(specific)}）：\n` +
        missing.join('\n'),
    )
  })

  it('例外表里的接口确实用原名路径，而不是下划线被替换后的路径', () => {
    const specific = parseUpstreamSpecificRoutes(fs.readFileSync(SERVER_JS, 'utf8'))
    for (const [file, route] of Object.entries(specific)) {
      const wrong = defaultRoute(file)
      if (route === wrong) continue
      assert.equal(typeof moduleFns[route], 'function', `${route} 应当存在（来自 ${file}）`)
      assert.equal(moduleFns[wrong], undefined, `${wrong} 不应存在，正确路径是 ${route}`)
    }
  })

  it('路由表里没有多出来的项', () => {
    const specific = parseUpstreamSpecificRoutes(fs.readFileSync(SERVER_JS, 'utf8'))
    const skipped = new Set((routeStats.skippedModules || []).map((s) => s.route))
    const expected = new Set(
      fs
        .readdirSync(MODULE_DIR)
        .filter((f) => f.endsWith('.js'))
        .map((file) => specific[file] || defaultRoute(file))
        .filter((r) => !skipped.has(r)),
    )

    const extra = Object.keys(moduleFns).filter((r) => !expected.has(r))
    assert.deepEqual(extra, [], `生成了上游不存在的路由：\n${extra.join('\n')}`)
  })
})
