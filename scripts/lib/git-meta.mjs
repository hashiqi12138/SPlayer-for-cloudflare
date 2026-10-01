/**
 * 仓库状态查询（提交号 / 工作区是否真的脏）
 *
 * 为什么单独抽出来
 * ----------------
 * 同一套判断有三处要用，而且三处必须给出**一致**的结论，否则「线上对应哪个提交」
 * 这件事就说不清：
 *   1. scripts/finalize-dist.mjs     写进产物 version.json 的 commit / dirty
 *   2. scripts/deploy-pages.sh       传给 wrangler 的 --commit-hash / --commit-dirty
 *   3. scripts/deploy-pages.ps1      同上（PowerShell 侧）
 * 各自实现一遍的话，只要有一处口径不同，Pages 控制台与 /version.json 就会互相矛盾。
 *
 * 为什么不用 `git status --porcelain` 判空
 * ---------------------------------------
 * 它会被两类噪音长期占据，导致 dirty **永远是 true**：
 *   - 子模块：补丁本来就写在子模块工作区里，`deps:setup` / `deps:update` 之后
 *     `splayer-frontend`、`ncm-source` 必然是脏的，而这两步是发布前的必经流程。
 *   - 换行符：`core.autocrlf=true` 的机器上，工具产物可能以 CRLF 落盘；git 比较时
 *     归一化回 LF，于是 `git diff` 是空的、`git status` 却报「已修改」。
 * 改用 `git diff HEAD`（比的是**内容**，且忽略子模块）+ 未跟踪文件。
 * dirty 的真正含义只有一个：「线上的这个提交号还准不准」。
 */

import { execFileSync } from 'node:child_process'

/** 执行 git 并返回裁剪后的 stdout；失败（如不在 git 仓库）返回空串 */
export function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  } catch (e) {
    return ''
  }
}

/** 当前 HEAD 的完整提交号；取不到返回 null */
export function commitHash(root) {
  return git(root, ['rev-parse', 'HEAD']) || null
}

/**
 * 当前 HEAD 的提交标题（单行）
 *
 * 用途：作为 `wrangler pages deploy --commit-message` 传过去。
 * 为什么要显式传：wrangler 拿到 `--commit-hash` 后会用**它自己所在目录**（部署时是
 * 子模块 splayer-frontend）去 `git show` 这个提交以取标题 —— 而本仓库的提交在子模块
 * 里并不存在，于是每次都打印一行 `fatal: bad object <sha>`。部署本身不受影响
 * （退出码仍是 0），但会让人误以为出了问题。这里把标题直接喂给它，就不必再查库。
 */
export function commitSubject(root) {
  return git(root, ['log', '-1', '--pretty=%s']) || null
}

/**
 * 工作区是否「真的」有未提交改动
 *
 * 未跟踪文件也算：新文件没提交，同样说不清线上对应哪个提交。
 */
export function workingTreeDirty(root) {
  const trackedChanges = git(root, ['diff', 'HEAD', '--name-only', '--ignore-submodules=all'])
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard'])
  return trackedChanges.length > 0 || untracked.length > 0
}
