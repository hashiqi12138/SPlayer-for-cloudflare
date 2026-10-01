#!/usr/bin/env bash
#
# API Worker 部署脚本（bash 版）
#
# 用法:
#   ./scripts/deploy-api-worker.sh                   交互式（会询问是否先本地测试）
#   ./scripts/deploy-api-worker.sh --non-interactive  跳过所有询问，便于自动化
#
# 与 deploy-api-worker.ps1 等价。

set -euo pipefail

USAGE='用法: deploy-api-worker.sh [--non-interactive]

环境变量:
  NON_INTERACTIVE=1   等同 --non-interactive

注意: Worker 只有一个正式环境，不接受 --preview。'

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

parse_common_args "$@"
reject_preview_target

banner "部署 api-enhanced Worker"

# ------------------------------------------------------------
# 前置检查：依赖目录 / 补丁与单测闸门 / wrangler / 登录
#
# 上游 ncm-source 以 submodule 固定版本引入，本地适配以 patch 叠加，
# 统一由 scripts/deps.mjs 管理。部署前必须确认：子模块已就位、补丁已应用、
# 且单测在当前版本上通过 —— 否则中止。
#
# 先确认 node 可执行：后面所有检查都依赖它，缺了的话报错会指向
# 「依赖校验失败」这种误导性的结论。
# ------------------------------------------------------------
check_node
ensure_local_deps
require_dir "$API_WORKER_DIR/ncm-source" 'workers/api/ncm-source'
verify_deps
check_wrangler
check_login 0
echo

# ------------------------------------------------------------
# 安装依赖
# ------------------------------------------------------------
log_step "安装 Worker 依赖"
cd "$API_WORKER_DIR"
if [ -d node_modules ]; then
  log_dim "node_modules 已存在，跳过安装（如需重装请先删除该目录）"
else
  npm install || die "npm install 失败" "可检查网络后重试"
fi
log_ok "依赖就绪"
echo

# ------------------------------------------------------------
# 可选：先起本地 wrangler dev 自测
# ------------------------------------------------------------
if confirm "是否先本地测试？(y/N)" n; then
  log_step "启动本地开发服务器 (Ctrl+C 停止)"
  npx --no-install wrangler dev
  echo
fi

# ------------------------------------------------------------
# 部署
# ------------------------------------------------------------
log_step "开始部署"
npx --no-install wrangler deploy

echo
banner "API Worker 部署完成"
log_warn "注意: API Worker 为实验性功能，遇到问题请参考 workers/api/ADAPTATION_TODO.md"
echo
