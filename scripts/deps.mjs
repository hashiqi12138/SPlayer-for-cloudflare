#!/usr/bin/env node
/**
 * 依赖管理：上游 submodule（固定版本）+ 本地补丁 + 更新流水线
 *
 * 背景
 * ----
 * 本项目依赖两个上游仓库：
 *   splayer-frontend  -> SPlayer-Dev/SPlayer
 *   workers/api/ncm-source -> NeteaseCloudMusicApiEnhanced/api-enhanced
 * 两者都以 git submodule 引入，父仓库记录**固定 commit**，保证构建可复现。
 * 我们对上游做过的少量适配以 patch 形式存放于 patches/，随更新自动重新应用。
 *
 * 为什么 submodule 不等于「自动最新」
 * --------------------------------
 * submodule 记录的是固定 commit。要升级必须显式执行本脚本的 update，
 * 它会：拉取上游最新 -> 重新打补丁 -> 重建产物 -> 跑接口单测，
 * **任一步失败即中止**，测试通过后才把新的 commit 暂存为新的 pin。
 *
 * 命令
 * ----
 *   node scripts/deps.mjs status         查看依赖版本 / 补丁状态 / 上次单测结果
 *   node scripts/deps.mjs setup          按 pin 检出依赖并打补丁（不拉上游）
 *   node scripts/deps.mjs apply          仅应用补丁（幂等）
 *   node scripts/deps.mjs update         升级上游 + 打补丁 + 重建 + 单测（发布闸门）
 *   node scripts/deps.mjs verify-deploy  校验依赖与单测状态，供部署脚本调用
 *
 * 环境变量
 * ----
 *   NCM_COOKIE   可选。提供后会额外跑需要登录态的用例。
 *
 * 注意：setup / update 会丢弃子模块工作区的本地改动（这正是「可复现」的前提），
 * 若你在子模块里手改过代码，请先把改动沉淀进 patches/。
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, '.deps-state.json');
const DEV_PORT = 8788;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
const TEST_SCRIPT = path.join(ROOT, 'workers', 'api', 'scripts', 'test-api.cjs');
const BUILD_SCRIPT = path.join(ROOT, 'workers', 'api', 'scripts', 'build-modules.cjs');
const RESULTS_DIR = path.join(ROOT, 'workers', 'api', 'test-results');

/** 依赖清单：submodule 路径 + 对应补丁 */
const DEPS = [
  {
    name: 'ncm-source',
    rel: path.join('workers', 'api', 'ncm-source'),
    patchRel: path.join('patches', 'ncm-source.patch'),
  },
  {
    name: 'splayer-frontend',
    rel: 'splayer-frontend',
    patchRel: path.join('patches', 'splayer-frontend.patch'),
  },
].map((d) => ({
  ...d,
  abs: path.join(ROOT, d.rel),
  patchAbs: path.join(ROOT, d.patchRel),
}));

// ============================================================
// 基础工具
// ============================================================

const log = {
  step: (m) => console.log(`\n▶ ${m}`),
  ok: (m) => console.log(`  ✅ ${m}`),
  warn: (m) => console.log(`  ⚠️  ${m}`),
  err: (m) => console.error(`  ❌ ${m}`),
  info: (m) => console.log(`     ${m}`),
};

function git(args, cwd = ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    code: r.status,
    out: (r.stdout || '').trim(),
    err: (r.stderr || '').trim(),
  };
}

function headOf(dir) {
  const r = git(['rev-parse', 'HEAD'], dir);
  return r.code === 0 ? r.out : null;
}

function shortSha(sha) {
  return sha ? sha.slice(0, 7) : '(未知)';
}

/**
 * 应用补丁的统一参数。
 *
 * 必须带 `--ignore-whitespace`：Windows 上 git 的 core.autocrlf 会把子模块
 * 工作区检出为 CRLF，而 `git diff` 生成的补丁上下文是 LF，不忽略空白差异时
 * 正反向匹配都会失败（看起来像「补丁冲突」，实为换行差异）。
 */
const APPLY_FLAGS = ['apply', '--ignore-whitespace'];

/**
 * 判断补丁状态
 * - not-applied：可干净应用
 * - applied    ：已应用（反向校验通过）
 * - conflict   ：两边都不匹配，通常是上游改动导致补丁过期
 */
function patchState(dep) {
  if (!fs.existsSync(dep.patchAbs)) return 'no-patch-file';
  if (git([...APPLY_FLAGS, '--check', dep.patchAbs], dep.abs).code === 0) {
    return 'not-applied';
  }
  if (git([...APPLY_FLAGS, '--reverse', '--check', dep.patchAbs], dep.abs).code === 0) {
    return 'applied';
  }
  return 'conflict';
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// ============================================================
// status
// ============================================================

function cmdStatus() {
  console.log('依赖状态');
  console.log('─'.repeat(72));

  const state = readState();
  for (const dep of DEPS) {
    const head = headOf(dep.abs);
    const st = patchState(dep);
    const pinned = state?.deps?.[dep.name]?.commit;

    console.log(`\n${dep.name}  (${dep.rel})`);
    console.log(`  当前 HEAD   ${shortSha(head)}`);
    console.log(`  上次通过单测 ${shortSha(pinned)}${pinned && pinned === head ? '  ← 与当前一致' : ''}`);
    console.log(`  补丁状态    ${
      { 'applied': '已应用', 'not-applied': '未应用', 'conflict': '冲突（补丁可能已过期）', 'no-patch-file': '无补丁文件' }[st]
    }`);
    if (st === 'not-applied') console.log(`  提示        执行 npm run deps:apply 应用`);
    if (st === 'conflict') console.log(`  提示        上游可能已改动相关文件，需更新 ${dep.patchRel}`);
  }

  console.log('\n上次单测');
  console.log('─'.repeat(72));
  if (!state?.tests) {
    console.log('  尚无记录（执行 npm run deps:update 后写入）');
  } else {
    const t = state.tests;
    console.log(`  时间     ${t.at}`);
    console.log(`  目标     ${t.baseUrl}`);
    console.log(`  结果     通过 ${t.passed} / 受限 ${t.blocked} / 失败 ${t.failed}`);
    console.log(`  结论     ${t.failed === 0 ? '✅ 通过' : '❌ 未通过，不可发布'}`);
  }
}

// ============================================================
// setup / apply
// ============================================================

/** 按 pin 检出依赖（丢弃子模块内改动），再打补丁 */
function cmdSetup() {
  for (const dep of DEPS) {
    log.step(`准备 ${dep.name}`);
    if (!fs.existsSync(dep.abs)) {
      const r = git(['submodule', 'update', '--init', dep.rel]);
      if (r.code !== 0) {
        log.err(`submodule 初始化失败：${r.err || r.out}`);
        return 1;
      }
    }
    // 回到父仓库记录的固定版本
    const r = git(['submodule', 'update', '--init', '--force', dep.rel]);
    if (r.code !== 0) {
      log.err(`检出固定版本失败：${r.err || r.out}`);
      return 1;
    }
    log.ok(`已检出 ${shortSha(headOf(dep.abs))}`);
  }

  const rc = cmdApply();
  if (rc !== 0) return rc;

  log.step('重建生成的产物');
  return cmdRebuild();
}

function cmdApply() {
  for (const dep of DEPS) {
    const st = patchState(dep);
    if (st === 'no-patch-file') {
      log.info(`${dep.name}: 无补丁文件，跳过`);
      continue;
    }
    if (st === 'applied') {
      log.ok(`${dep.name}: 补丁已应用`);
      continue;
    }
    if (st === 'conflict') {
      log.err(`${dep.name}: 补丁无法应用（上游相关文件已变动）`);
      log.info(`请人工核对 ${dep.patchRel}，必要时基于当前上游版本重做补丁`);
      return 1;
    }
    log.step(`应用补丁 ${dep.patchRel}`);
    const r = git([...APPLY_FLAGS, dep.patchAbs], dep.abs);
    if (r.code !== 0) {
      log.err(`应用失败：${r.err || r.out}`);
      return 1;
    }
    log.ok(`${dep.name}: 补丁已应用`);
  }
  return 0;
}

function cmdRebuild() {
  const r = spawnSync('node', [BUILD_SCRIPT], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    log.err('build-modules 失败');
    return 1;
  }
  log.ok('已重建 src/generated-routes.js');
  return 0;
}

// ============================================================
// update（发布闸门）
// ============================================================

async function cmdUpdate() {
  log.step('1/5 拉取上游最新代码');
  for (const dep of DEPS) {
    const before = headOf(dep.abs);
    const r = git(['submodule', 'update', '--init', '--remote', '--force', dep.rel]);
    if (r.code !== 0) {
      log.err(`${dep.name} 更新失败：${r.err || r.out}`);
      log.info('若提示 shallow/历史不足，可在子模块内执行: git fetch --unshallow');
      return 1;
    }
    const after = headOf(dep.abs);
    log.ok(`${dep.name}: ${shortSha(before)} → ${shortSha(after)}${before === after ? '（无变化）' : ''}`);
  }

  log.step('2/5 应用本地补丁');
  const rcApply = cmdApply();
  if (rcApply !== 0) {
    log.err('补丁应用失败，已中止（上游可能改动了补丁涉及的文件）');
    return 1;
  }

  log.step('3/5 重建生成的产物');
  const rcBuild = cmdRebuild();
  if (rcBuild !== 0) return 1;

  log.step('4/5 运行接口单测');
  const testResult = await runTests();
  if (!testResult) {
    log.err('单测未通过，已中止，不会暂存新的依赖版本');
    return 1;
  }

  log.step('5/5 记录依赖状态');
  const deps = {};
  for (const dep of DEPS) {
    deps[dep.name] = {
      commit: headOf(dep.abs),
      patch: patchState(dep),
    };
  }
  writeState({ updatedAt: new Date().toISOString(), deps, tests: testResult });
  log.ok('已写入 .deps-state.json');

  // 把新的 pin 暂存，交由使用者决定何时提交
  git(['add', ...DEPS.map((d) => d.rel)]);
  log.ok('新的依赖版本已暂存（git add），请提交以固定版本');

  console.log('\n✅ 依赖更新完成，且单测通过，可以发布');
  console.log('   发布：npm run deploy:api   /   npm run deploy:pages');
  return 0;
}

// ============================================================
// 单测：起本地 worker -> 跑用例 -> 关掉
// ============================================================

async function waitForHealth(timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${DEV_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return true;
    } catch (e) {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (e) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (e2) {
        /* ignore */
      }
    }
  }
}

function latestReport() {
  if (!fs.existsSync(RESULTS_DIR)) return null;
  const files = fs
    .readdirSync(RESULTS_DIR)
    .filter((f) => f.startsWith('report-') && f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(RESULTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, files[0].f), 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * 起本地 wrangler dev 跑 test-api.cjs
 * @returns {Promise<null|{baseUrl:string,passed:number,blocked:number,failed:number,at:string}>}
 */
async function runTests() {
  const workerDir = path.join(ROOT, 'workers', 'api');
  log.info(`启动本地 worker（端口 ${DEV_PORT}）...`);

  const server = spawn(`npx wrangler dev --port ${DEV_PORT}`, {
    cwd: workerDir,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  const serverLog = [];
  server.stdout?.on('data', (d) => serverLog.push(d.toString()));
  server.stderr?.on('data', (d) => serverLog.push(d.toString()));

  try {
    const ready = await waitForHealth();
    if (!ready) {
      log.err('本地 worker 启动超时');
      console.log(serverLog.join('').slice(-1500));
      return null;
    }
    log.ok('本地 worker 已就绪');

    const r = spawnSync('node', [TEST_SCRIPT, DEV_URL], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });

    const report = latestReport();
    if (!report) {
      log.err('未找到测试报告，无法判定结果');
      return null;
    }

    const summary = {
      baseUrl: DEV_URL,
      passed: report.passed,
      blocked: report.blocked,
      failed: report.failed,
      at: new Date().toISOString(),
    };

    if (r.status !== 0 || report.failed > 0) {
      log.err(`单测未通过（通过 ${report.passed} / 受限 ${report.blocked} / 失败 ${report.failed}）`);
      return null;
    }
    log.ok(`单测通过（通过 ${report.passed} / 受限 ${report.blocked} / 失败 ${report.failed}）`);
    return summary;
  } finally {
    killTree(server.pid);
  }
}

// ============================================================
// verify-deploy：部署前的闸门
// ============================================================

function cmdVerifyDeploy() {
  console.log('校验依赖与单测状态（发布闸门）');
  console.log('─'.repeat(72));

  const state = readState();
  if (!state) {
    log.err('未找到 .deps-state.json，说明尚未执行过依赖更新');
    log.info('请先执行: npm run deps:update');
    return 1;
  }

  let bad = 0;

  for (const dep of DEPS) {
    const head = headOf(dep.abs);
    const recorded = state.deps?.[dep.name]?.commit;

    if (!head) {
      log.err(`${dep.name}: 依赖目录不可用（${dep.rel}）`);
      bad++;
      continue;
    }
    if (recorded !== head) {
      log.err(`${dep.name}: 当前版本 ${shortSha(head)} 未经过单测（上次通过的是 ${shortSha(recorded)}）`);
      bad++;
      continue;
    }
    const st = patchState(dep);
    if (st !== 'applied' && st !== 'no-patch-file') {
      log.err(`${dep.name}: 补丁状态异常（${st}）`);
      bad++;
      continue;
    }
    log.ok(`${dep.name}: ${shortSha(head)}，补丁已应用`);
  }

  if (state.tests?.failed > 0) {
    log.err(`上次单测存在 ${state.tests.failed} 个失败用例`);
    bad++;
  } else if (state.tests) {
    log.ok(`单测记录：通过 ${state.tests.passed} / 受限 ${state.tests.blocked} / 失败 ${state.tests.failed}`);
  }

  if (bad > 0) {
    console.log('');
    log.err(`存在 ${bad} 项问题，已阻止部署`);
    log.info('请执行: npm run deps:update（更新依赖并跑单测）后再发布');
    return 1;
  }

  console.log('\n✅ 依赖与单测状态正常，允许部署');
  return 0;
}

// ============================================================
// 入口
// ============================================================

async function main() {
  const cmd = process.argv[2] || 'status';
  const table = {
    status: () => cmdStatus(),
    setup: () => cmdSetup(),
    apply: () => cmdApply(),
    update: () => cmdUpdate(),
    'verify-deploy': () => cmdVerifyDeploy(),
  };
  const fn = table[cmd];
  if (!fn) {
    console.error(`未知命令: ${cmd}`);
    console.error(`可用命令: ${Object.keys(table).join(', ')}`);
    process.exit(2);
  }
  const rc = await fn();
  process.exit(rc ?? 0);
}

main().catch((e) => {
  console.error('执行失败:', e);
  process.exit(1);
});
