/**
 * 自动生成路由脚本 v2
 *
 * 更健壮的 data 对象提取（括号匹配算法）
 *
 * 用法: node scripts/generate-routes.cjs
 */

const fs = require('fs')
const path = require('path')

const MODULE_DIR = path.join(__dirname, '..', 'ncm-source', 'module')
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'generated-routes.js')

/**
 * 找到匹配的闭括号位置
 */
function findMatchingBrace(code, startIndex) {
  let depth = 0
  let inString = false
  let stringChar = ''
  let escape = false

  for (let i = startIndex; i < code.length; i++) {
    const char = code[i]

    if (escape) {
      escape = false
      continue
    }

    if (inString) {
      if (char === '\\') {
        escape = true
      } else if (char === stringChar) {
        inString = false
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true
      stringChar = char
      continue
    }

    if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }

  return -1
}

/**
 * 提取模块中的 data 对象
 * 返回对象字面量代码字符串（不带 const data = 前缀）
 */
function extractDataObject(content) {
  // 模式 1: const data = {...}
  const match = content.match(/const data\s*=\s*\{/)
  if (match) {
    const openBraceIndex = match.index + match[0].length - 1
    const closeBraceIndex = findMatchingBrace(content, openBraceIndex)
    if (closeBraceIndex !== -1) {
      const full = content.substring(match.index, closeBraceIndex + 1)
      return full.replace(/^const data\s*=\s*/, '').trim()
    }
  }

  // 模式 2: request(path, {...}, option) — data 直接写在调用里
  // 找到 request( 后的第一个 {
  const reqMatch = content.match(/request\(\s*[`'"]/)
  if (reqMatch) {
    // 从 request( 位置往后找第一个逗号后的 {
    const startIdx = reqMatch.index
    // 找到第一个参数结束（逗号）
    let parenDepth = 0
    let inString = false
    let stringChar = ''
    let escape = false
    let commaPos = -1

    for (let i = startIdx; i < content.length; i++) {
      const char = content[i]

      if (escape) {
        escape = false
        continue
      }
      if (inString) {
        if (char === '\\') escape = true
        else if (char === stringChar) inString = false
        continue
      }
      if (char === '"' || char === "'" || char === '`') {
        inString = true
        stringChar = char
        continue
      }
      if (char === '(') parenDepth++
      else if (char === ')') {
        parenDepth--
        if (parenDepth === 0) break
      }
      if (char === ',' && parenDepth === 1) {
        commaPos = i
        break
      }
    }

    if (commaPos > 0) {
      // 从逗号后找第一个 {
      const afterComma = content.substring(commaPos + 1)
      const braceMatch = afterComma.match(/^\s*\{/)
      if (braceMatch) {
        const openIdx = commaPos + 1 + braceMatch.index + braceMatch[0].length - 1
        const closeIdx = findMatchingBrace(content, openIdx)
        if (closeIdx > 0) {
          return content.substring(openIdx, closeIdx + 1)
        }
      }
    }
  }

  return null
}

function detectCrypto(content) {
  // createOption(query, 'weapi') 形式
  const match = content.match(/createOption\(query,\s*['"](\w+)['"]\)/)
  if (match) return match[1]

  // createOption(query) 形式 — 默认 crypto 为空（即 api 明文模式）
  // 对应 option.js: crypto = query.crypto || crypto || ''
  if (content.match(/createOption\(query\s*\)/)) {
    return 'api'
  }

  return 'api' // 默认走明文
}

function detectApiPath(content) {
  const match = content.match(/request\(\s*`([^`]+)`/)
  if (match) return match[1]

  const match2 = content.match(/request\(\s*'([^']+)'/)
  if (match2) return match2[1]

  const match3 = content.match(/request\(\s*"([^"]+)"/)
  if (match3) return match3[1]

  return null
}

function moduleNameToRoute(filename) {
  return '/' + filename.replace(/_/g, '/').replace('.js', '')
}

function isComplexModule(content) {
  // 多步请求
  if (content.includes('.then(') && (content.match(/request\(/g) || []).length > 1) return true

  // 有 try/catch 包裹复杂逻辑
  if (content.includes('try {') && content.includes('catch')) return true

  // 动态 path
  if (content.includes('${') && content.includes('request(`')) return true

  return false
}

function main() {
  const files = fs.readdirSync(MODULE_DIR).filter((f) => f.endsWith('.js'))
  const routes = []
  const skipped = []
  const errors = []

  for (const file of files) {
    const filePath = path.join(MODULE_DIR, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    const routePath = moduleNameToRoute(file)

    // 跳过复杂模块
    if (isComplexModule(content)) {
      skipped.push({ route: routePath, file, reason: 'complex' })
      continue
    }

    const dataCode = extractDataObject(content)
    const crypto = detectCrypto(content)
    const apiPath = detectApiPath(content)

    if (!dataCode || !apiPath) {
      errors.push({ route: routePath, file, reason: `data: ${!!dataCode}, apiPath: ${!!apiPath}` })
      continue
    }

    routes.push({
      route: routePath,
      crypto,
      apiPath,
      dataCode: dataCode,
    })
  }

  // 生成输出
  let output = `/**
 * 自动生成的路由定义
 * 
 * 来源: api-enhanced module 目录
 * 生成时间: ${new Date().toISOString()}
 * 
 * 总数: ${routes.length} 个简单接口
 * 跳过: ${skipped.length} 个复杂接口（需手动处理）
 * 错误: ${errors.length} 个
 */

import { createRequest } from './ncm-request-handler.js';

const resourceTypeMap = {
  '0': 'R_SO_4_',
  '1': 'R_MV_5_',
  '2': 'A_PL_0_',
  '3': 'R_AL_3_',
  '4': 'A_DJ_1_',
  '5': 'R_VI_62_',
  '6': 'A_EV_2_',
  '7': 'A_DR_14_',
};

export function registerGeneratedRoutes(app) {
`

  for (const r of routes) {
    // 去掉 "const data = " 前缀，保留对象字面量
    const dataObj = r.dataCode

    output += `
  // ${r.route} (${r.crypto})
  app.all('${r.route}', handleModule((query, request) => {
    const data = ${dataObj}
    return request('${r.apiPath}', data, { crypto: '${r.crypto}' });
  }));
`
  }

  output += `
}

// ===== 工具函数 =====

function handleModule(moduleFn) {
  return async (req, res) => {
    try {
      const query = { ...req.query, ...req.body };
      if (req.cookies) {
        query.cookie = req.cookies;
      } else if (req.headers.cookie) {
        query.cookie = req.headers.cookie;
      }
      
      const ip = req.ip || 
                 req.headers['cf-connecting-ip'] || 
                 req.headers['x-forwarded-for'] || '';
      
      const requestFn = (p, data, options = {}) => {
        return createRequest(p, data, {
          ...options,
          ip: options.ip || ip,
        });
      };
      
      const result = await moduleFn(query, requestFn);
      
      if (result.cookie && result.cookie.length > 0 && !query.noCookie) {
        for (const cookie of result.cookie) {
          const cookieStr = req.protocol === 'https'
            ? cookie + '; SameSite=None; Secure'
            : cookie;
          res.append('Set-Cookie', cookieStr);
        }
      }
      
      if (result.redirectUrl) {
        res.redirect(result.status || 302, result.redirectUrl);
        return;
      }
      
      res.status(result.status || 200).json(result.body);
      
    } catch (err) {
      let status = 500;
      let body = { code: 500, msg: 'Internal Server Error' };
      
      if (err && typeof err === 'object') {
        status = err.status || err.statusCode || 500;
        if (err.body) {
          body = err.body;
        } else if (err.message) {
          body = { code: status, msg: String(err.message) };
        } else {
          try { body = { code: status, msg: JSON.stringify(err) }; } catch (e) { body = { code: status, msg: String(err) }; }
        }
      } else {
        body = { code: status, msg: String(err) };
      }
      
      if (err?.cookie && !req.query?.noCookie) {
        res.append('Set-Cookie', err.cookie);
      }
      
      res.status(status).json(body);
    }
  };
}

export const routeStats = {
  total: ${routes.length},
  skipped: ${skipped.length},
  errors: ${errors.length},
  skippedRoutes: ${JSON.stringify(skipped.map((s) => s.route))},
  errorRoutes: ${JSON.stringify(errors.map((e) => ({ route: e.route, reason: e.reason })))},
};
`

  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8')

  console.log(`✅ 生成完成: ${routes.length} 个简单接口`)
  console.log(`⚠️  跳过 ${skipped.length} 个复杂接口:`)
  skipped.slice(0, 15).forEach((s) => console.log(`   - ${s.route} (${s.reason})`))
  if (skipped.length > 15) console.log(`   ... 还有 ${skipped.length - 15} 个`)

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} 个解析错误:`)
    errors.slice(0, 10).forEach((e) => console.log(`   - ${e.route}: ${e.reason}`))
  }

  console.log(`\n输出: ${OUTPUT_FILE}`)
}

main()
