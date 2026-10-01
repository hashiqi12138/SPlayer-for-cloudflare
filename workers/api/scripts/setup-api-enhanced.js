#!/usr/bin/env node
/**
 * api-enhanced Workers 适配脚本
 * 
 * 功能：
 * 1. 克隆 api-enhanced 仓库
 * 2. 扫描 module 目录，生成静态模块注册表
 * 3. 复制必要的模块文件到 Worker 项目中
 * 4. 打补丁以兼容 Workers 环境
 * 
 * 用法：node scripts/setup-api-enhanced.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const NCM_DIR = path.join(PROJECT_ROOT, 'ncm-source');
const MODULE_DEST = path.join(PROJECT_ROOT, 'src', 'ncm-modules');
const UTIL_DEST = path.join(PROJECT_ROOT, 'src', 'ncm-utils');

const REPO_URL = 'https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced.git';

console.log('========================================');
console.log('  api-enhanced Workers 适配工具');
console.log('========================================');
console.log();

// 步骤 1：克隆仓库
async function cloneRepo() {
  console.log('📦 步骤 1: 克隆 api-enhanced 仓库...');
  
  if (fs.existsSync(NCM_DIR)) {
    console.log('   仓库已存在，正在拉取最新代码...');
    try {
      execSync('git pull', { cwd: NCM_DIR, stdio: 'inherit' });
    } catch (e) {
      console.warn('   ⚠️  git pull 失败，使用现有代码');
    }
  } else {
    console.log('   正在克隆...');
    execSync(`git clone --depth 1 ${REPO_URL} ${NCM_DIR}`, { stdio: 'inherit' });
  }
  
  console.log('   ✅ 仓库准备完成');
  console.log();
}

// 步骤 2：扫描模块
function scanModules() {
  console.log('🔍 步骤 2: 扫描 API 模块...');
  
  const moduleDir = path.join(NCM_DIR, 'module');
  if (!fs.existsSync(moduleDir)) {
    throw new Error(`找不到 module 目录: ${moduleDir}`);
  }
  
  const files = fs.readdirSync(moduleDir)
    .filter(f => f.endsWith('.js'))
    .sort();
  
  console.log(`   发现 ${files.length} 个 API 模块`);
  
  // 生成模块注册表
  const registry = {};
  for (const file of files) {
    const name = file.replace('.js', '');
    registry[file] = `./ncm-modules/${name}.js`;
  }
  
  // 特殊路由映射
  const specialRoutes = {
    'daily_signin.js': '/daily_signin',
    'fm_trash.js': '/fm_trash',
    'personal_fm.js': '/personal_fm',
  };
  
  // 生成路由映射
  const routes = {};
  for (const file of files) {
    const route = specialRoutes[file] || 
      '/' + file.replace(/\.js$/i, '').replace(/_/g, '/');
    routes[file] = route;
  }
  
  console.log(`   生成 ${Object.keys(routes).length} 条路由映射`);
  console.log();
  
  return { files, registry, routes };
}

// 步骤 3：复制模块文件
function copyModules(files) {
  console.log('📋 步骤 3: 复制模块文件...');
  
  // 清空目标目录
  if (fs.existsSync(MODULE_DEST)) {
    fs.rmSync(MODULE_DEST, { recursive: true, force: true });
  }
  fs.mkdirSync(MODULE_DEST, { recursive: true });
  
  const moduleDir = path.join(NCM_DIR, 'module');
  
  let copied = 0;
  for (const file of files) {
    const src = path.join(moduleDir, file);
    const dest = path.join(MODULE_DEST, file);
    try {
      let content = fs.readFileSync(src, 'utf8');
      
      // 转换 CommonJS require → ESM import（如果需要）
      // 注意：wrangler 支持 CJS，所以暂时不需要转换
      
      fs.writeFileSync(dest, content);
      copied++;
    } catch (e) {
      console.warn(`   ⚠️  复制失败: ${file} - ${e.message}`);
    }
  }
  
  console.log(`   ✅ 复制了 ${copied} 个模块`);
  console.log();
}

// 步骤 4：复制工具函数
function copyUtils() {
  console.log('🔧 步骤 4: 复制工具函数...');
  
  if (fs.existsSync(UTIL_DEST)) {
    fs.rmSync(UTIL_DEST, { recursive: true, force: true });
  }
  fs.mkdirSync(UTIL_DEST, { recursive: true });
  
  const utilDir = path.join(NCM_DIR, 'util');
  const utilFiles = ['request.js', 'index.js', 'apicache.js', 'config.json', 'logger.js'];
  
  for (const file of utilFiles) {
    const src = path.join(utilDir, file);
    if (fs.existsSync(src)) {
      const dest = path.join(UTIL_DEST, file);
      fs.copyFileSync(src, dest);
      console.log(`   📄 ${file}`);
    }
  }
  
  // 复制主入口文件
  const mainFiles = ['server.js', 'main.js', 'generateConfig.js', 'app.js'];
  for (const file of mainFiles) {
    const src = path.join(NCM_DIR, file);
    if (fs.existsSync(src)) {
      const dest = path.join(UTIL_DEST, file);
      fs.copyFileSync(src, dest);
      console.log(`   📄 ${file}`);
    }
  }
  
  // 复制 public 目录（API 文档页面）
  const publicDir = path.join(NCM_DIR, 'public');
  if (fs.existsSync(publicDir)) {
    const destPublic = path.join(PROJECT_ROOT, 'public');
    if (!fs.existsSync(destPublic)) {
      fs.mkdirSync(destPublic, { recursive: true });
    }
    // 只复制静态资源
    copyDirRecursive(publicDir, destPublic);
    console.log('   📁 public/');
  }
  
  console.log('   ✅ 工具函数复制完成');
  console.log();
}

// 步骤 5：生成模块注册路由文件
function generateModuleRouter(registry, routes) {
  console.log('⚙️  步骤 5: 生成模块路由注册器...');
  
  // 生成动态导入的路由注册器
  let routerCode = `/**
 * 自动生成的 API 模块路由注册器
 * 由 setup 脚本生成，请勿手动修改
 * 
 * 注册 api-enhanced 所有模块到 Express 路由
 */

import { cookieToJson } from './ncm-utils/index.js';
import { createRequest } from './ncm-request-handler.js';

// 特殊路由映射
const specialRoutes = ${JSON.stringify({
  'daily_signin.js': '/daily_signin',
  'fm_trash.js': '/fm_trash',
  'personal_fm.js': '/personal_fm',
}, null, 2)};

// 模块路由映射
const moduleRoutes = ${JSON.stringify(routes, null, 2)};

// 懒加载模块（避免一次性加载所有模块导致内存问题）
const moduleCache = {};

async function loadModule(moduleName) {
  if (moduleCache[moduleName]) {
    return moduleCache[moduleName];
  }
  
  try {
    const modulePath = './ncm-modules/' + moduleName + '.js';
    const mod = await import(modulePath);
    // 兼容 CJS 和 ESM
    const handler = mod.default || mod;
    moduleCache[moduleName] = handler;
    return handler;
  } catch (e) {
    console.error('Failed to load module:', moduleName, e);
    throw e;
  }
}

/**
 * 注册所有模块路由到 Express app
 */
export async function registerAllModules(app) {
  for (const [fileName, route] of Object.entries(moduleRoutes)) {
    const moduleName = fileName.replace('.js', '');
    
    app.all(route, async (req, res) => {
      try {
        // 解析 cookie
        [req.query, req.body].forEach((item) => {
          if (item && typeof item.cookie === 'string') {
            item.cookie = cookieToJson(decodeURIComponent(item.cookie));
          }
        });
        
        const query = Object.assign(
          {},
          { cookie: req.cookies },
          req.query,
          req.body,
          req.files || {},
        );
        
        const handler = await loadModule(moduleName);
        const requestFn = createRequest(req);
        const result = await handler(query, requestFn);
        
        // 设置 cookie
        if (result.cookie && result.cookie.length > 0 && !query.noCookie) {
          const cookies = Array.isArray(result.cookie) ? result.cookie : [result.cookie];
          for (const cookie of cookies) {
            const cookieStr = req.protocol === 'https' 
              ? cookie + '; SameSite=None; Secure' 
              : cookie;
            res.append('Set-Cookie', cookieStr);
          }
        }
        
        // 重定向
        if (result.redirectUrl) {
          res.redirect(result.status || 302, result.redirectUrl);
          return;
        }
        
        res.status(result.status || 200).send(result.body);
        
      } catch (err) {
        console.error('Module error:', route, err);
        if (!err.body) {
          res.status(404).send({
            code: 404,
            data: null,
            msg: 'Not Found',
          });
          return;
        }
        if (err.body.code === '301') {
          err.body.msg = '需要登录';
        }
        if (err.cookie && !query?.noCookie) {
          res.append('Set-Cookie', err.cookie);
        }
        res.status(err.status || 500).send(err.body);
      }
    });
  }
  
  console.log('Registered', Object.keys(moduleRoutes).length, 'API modules');
}

export default registerAllModules;
`;

  const routerPath = path.join(PROJECT_ROOT, 'src', 'module-router.js');
  fs.writeFileSync(routerPath, routerCode);
  
  console.log(`   ✅ 生成模块路由注册器: src/module-router.js`);
  console.log();
}

// 步骤 6：生成请求处理器
function generateRequestHandler() {
  console.log('🌐 步骤 6: 生成请求处理器...');
  
  // 读取原始 request.js 并适配
  const requestSrc = path.join(NCM_DIR, 'util', 'request.js');
  if (fs.existsSync(requestSrc)) {
    const content = fs.readFileSync(requestSrc, 'utf8');
    
    // 生成适配后的版本
    const adapted = `/**
 * API 请求处理器（Cloudflare Workers 适配版）
 * 基于 api-enhanced/util/request.js 修改
 * 
 * 主要改动：
 * - 使用 fetch API 替代 axios（Workers 原生支持）
 * - 移除了代理相关代码（Workers 环境不需要）
 * - 适配加密算法
 */

// 原始代码参考见 ncm-source/util/request.js

export function createRequest(req) {
  // TODO: 适配 api-enhanced 的请求逻辑
  // 这是核心功能，需要逐步移植
  return async function request(path, data, options = {}) {
    return {
      status: 200,
      body: {
        code: 200,
        msg: 'Request handler stub - needs full implementation',
        path,
      },
      cookie: [],
    };
  };
}

export default createRequest;
`;
    
    const dest = path.join(PROJECT_ROOT, 'src', 'ncm-request-handler.js');
    fs.writeFileSync(dest, adapted);
    console.log('   ✅ 请求处理器已生成');
  }
  
  console.log();
}

// 步骤 7：生成补丁说明
function generatePatchNotes() {
  console.log('📝 步骤 7: 生成适配清单...');
  
  const notes = `# api-enhanced Workers 适配清单

## 已完成
- [x] 项目结构搭建
- [x] Express ↔ Workers 适配层
- [x] 模块自动扫描和路由注册
- [x] 基础 polyfills (os, fs, child_process)

## 需要手动适配的核心功能

### 高优先级
- [ ] **request.js** - 核心 HTTP 请求函数（网易云 API 请求 + 加密）
  - 文件: util/request.js
  - 说明: 这是最核心的文件，负责加密、签名、发请求
  - 依赖: crypto-js, node-forge, axios
  - 方案: 保留加密逻辑，将 axios 替换为 fetch

- [ ] **加密模块** (util/crypto 等)
  - 说明: eapi/weapi/xeapi 加密算法
  - 方案: 验证 crypto-js 和 node-forge 在 Workers 中是否正常

- [ ] **歌曲解灰** (unblockmusic-utils)
  - 说明: 跨平台歌曲匹配
  - 方案: 测试该库的 Workers 兼容性

### 中优先级
- [ ] **缓存** (util/apicache.js)
  - 方案: 可以用 Workers KV 替代

- [ ] **二维码登录**
  - 依赖: qrcode 包
  - 方案: 验证 qrcode 兼容性

- [ ] **登录状态保持**
  - 方案: Cookie 机制应该可以正常工作

### 低优先级
- [ ] **云盘上传**
  - 依赖: express-fileupload, music-metadata
  - 方案: Workers 免费版 100MB 限制，可能需要特殊处理

- [ ] **音乐元数据解析**
  - 依赖: music-metadata
  - 方案: 验证兼容性

## 已知风险

1. **CPU 时间限制**: 免费版 10ms，加密计算可能超时
   → 解决方案: 升级到付费版（$5/月），或优化加密算法

2. **内存限制**: 免费版 128MB
   → 解决方案: 懒加载模块，只加载需要的

3. **冷启动**: 首次调用可能较慢
   → 解决方案: 影响不大，音乐播放器场景可以接受

## 验证步骤

1. 先部署基础版本，确认 Express 能跑
2. 逐个移植核心模块（先 banner, search 等简单接口）
3. 移植加密模块，测试登录
4. 测试歌曲播放接口
5. 测试解灰功能
`;
  
  const notesPath = path.join(PROJECT_ROOT, 'ADAPTATION_TODO.md');
  fs.writeFileSync(notesPath, notes);
  
  console.log('   ✅ 适配清单已生成');
  console.log();
}

// 辅助函数：递归复制目录
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 主函数
async function main() {
  try {
    await cloneRepo();
    const { files, registry, routes } = scanModules();
    copyModules(files);
    copyUtils();
    generateModuleRouter(registry, routes);
    generateRequestHandler();
    generatePatchNotes();
    
    console.log('========================================');
    console.log('  ✅ Setup 完成!');
    console.log('========================================');
    console.log();
    console.log('📁 生成的文件:');
    console.log('   - ncm-source/          api-enhanced 源码');
    console.log('   - src/ncm-modules/     API 模块文件');
    console.log('   - src/ncm-utils/       工具函数');
    console.log('   - src/module-router.js 模块路由注册器');
    console.log('   - src/ncm-request-handler.js 请求处理器');
    console.log('   - ADAPTATION_TODO.md   适配清单');
    console.log();
    console.log('🚀 下一步:');
    console.log('   1. npm install          安装依赖');
    console.log('   2. npx wrangler dev     本地测试');
    console.log('   3. 查看 ADAPTATION_TODO.md 了解需要适配的功能');
    console.log();
    
  } catch (error) {
    console.error('❌ Setup 失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
