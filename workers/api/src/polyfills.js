/**
 * Cloudflare Workers Polyfills for api-enhanced
 * 
 * 轻量级兼容层 - 只处理最必要的兼容问题
 */

// ============================================================
// 全局变量
// ============================================================

// 默认中国 IP（用于一些需要 IP 的场景）
global.cnIp = '223.104.195.83';

// 标记运行在 Workers 环境中
global.isWorkersEnv = true;

// ============================================================
// child_process 兼容
// 
// Workers 中的 child_process 是存根，不能真正执行命令
// 我们提供空实现，让 import 不报错
// ============================================================
import * as cp from 'node:child_process';

// 确保 child_process 的导入不会报错
// 实际使用时，版本检查等功能应该被禁用

// ============================================================
// os.tmpdir() 兼容
// ============================================================
import os from 'node:os';

// 保存原始 tmpdir
const _origTmpdir = os.tmpdir;

// Workers 中没有真正的临时目录，提供一个虚拟路径
// 注意：不要重写 os 模块的方法（可能是只读的）
// 需要用到临时文件的功能在 Workers 中应该被禁用

// ============================================================
// fs 兼容
// 
// 注意：Workers 的 fs 模块是只读文件系统（打包时的文件）
// 不要尝试修改 fs 模块的方法
// 动态模块加载需要另寻方案
// ============================================================

// 不 patch fs，保持原生实现

// ============================================================
// console 增强
// ============================================================
// Workers 原生支持 console，无需额外处理

export function applyAllPolyfills() {
  console.log('[polyfills] Workers environment polyfills initialized');
  console.log('[polyfills] Node compat v2 enabled by default (2026-08-04)');
}

export default applyAllPolyfills;
