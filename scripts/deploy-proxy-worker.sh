#!/usr/bin/env bash
#
# 音乐代理 Worker 部署脚本（bash 版）
#
# 用法:
#   ./scripts/deploy-proxy-worker.sh
#
# 与 deploy-proxy-worker.ps1 等价：该 Worker 不依赖上游 submodule，因此不走发布闸门。

set -euo pipefail

USAGE='用法: deploy-proxy-worker.sh

注意: Worker 只有一个正式环境，不接受 --preview。'

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

parse_common_args "$@"
reject_preview_target

banner "部署音乐代理 Worker"

check_node
ensure_local_deps
require_dir "$PROXY_WORKER_DIR" 'workers/music-proxy'
check_wrangler
# 未登录时允许自动拉起 wrangler login（这是首次部署最省事的一条路径）
check_login 1
echo

log_step "开始部署"
cd "$PROXY_WORKER_DIR"
npx --no-install wrangler deploy

echo
banner "音乐代理 Worker 部署完成"
log_dim "访问 *.workers.dev 查看部署结果"
echo
