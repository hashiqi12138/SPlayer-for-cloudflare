#!/usr/bin/env bash
#
# 一键部署脚本（bash 版）— 把全部组件部署到 Cloudflare
#
# 用法:
#   ./scripts/deploy-all.sh                交互式选择部署范围
#   ./scripts/deploy-all.sh --mode=4       直接全部部署
#   ./scripts/deploy-all.sh --mode=3 --non-interactive
#   ./scripts/deploy-all.sh --mode=3 --preview        前端发到预览环境
#
# 部署范围:
#   1 = 音乐代理 Worker
#   2 = API Worker
#   3 = 前端 Pages
#   4 = 全部（代理 + API + 前端）
#
# 与 deploy-all.ps1 的差异：交互式默认值取 4（脚本就叫 deploy-all，默认全量更符合直觉）；
# 非交互式**必须**显式给出 --mode，避免自动化里因为默认值而误部署。

set -euo pipefail

USAGE='用法: deploy-all.sh [--mode=1|2|3|4] [--non-interactive] [--preview]

部署范围:
  1  音乐代理 Worker
  2  API Worker
  3  前端 Pages
  4  全部（代理 + API + 前端）

参数:
  --preview           前端发到预览环境（分支别名）
                      仅对前端 Pages 有意义，Worker 只有一个正式环境

环境变量:
  NON_INTERACTIVE=1   等同 --non-interactive'

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

MODE=''

# 先摘出 --mode=，其余参数交给公共解析
REMAINING=()
for arg in "$@"; do
  case "$arg" in
    --mode=*)
      MODE="${arg#--mode=}"
      ;;
    *)
      REMAINING+=("$arg")
      ;;
  esac
done
parse_common_args "${REMAINING[@]+"${REMAINING[@]}"}"

banner "SPlayer + api-enhanced 全 Cloudflare 部署"

# ------------------------------------------------------------
# 先确定部署范围
#
# 刻意放在前置检查之前：参数写错属于「用户输入问题」，应该在
# 拉依赖、查登录之前就报错，而不是先跑一堆检查再说「你参数不对」。
# ------------------------------------------------------------
if [ -z "$MODE" ]; then
  if is_non_interactive; then
    die "非交互模式下必须显式指定部署范围" "例如: ./scripts/deploy-all.sh --mode=4 --non-interactive"
  fi
  log_step "选择部署范围"
  log_rule
  log_dim "1. 音乐代理 Worker"
  log_dim "2. API Worker"
  log_dim "3. 前端 Pages"
  log_dim "4. 全部部署（代理 + API + 前端）"
  echo
  MODE="$(ask '请选择 (1-4)' 4)"
fi

case "$MODE" in
  1 | 2 | 3 | 4) ;;
  *) die "无效的部署范围：$MODE" "可选 1 / 2 / 3 / 4" ;;
esac

# --preview 只对前端有意义。只选 Worker 时直接报错，而不是静默忽略 ——
# 静默忽略会让人以为「我发的是预览」，实际却改了线上 worker。
if deploy_target_is_preview && { [ "$MODE" = '1' ] || [ "$MODE" = '2' ]; }; then
  die "--preview 只适用于前端 Pages（--mode=3 / 4）" \
    "Worker 只有一个正式环境，没有预览环境可发"
fi

echo
# ------------------------------------------------------------
# 前置检查
# ------------------------------------------------------------
log_step "前置检查"
log_rule
check_node
need_cmd git "安装 Git 后重试（依赖以 git submodule 引入）"
log_ok "Git $(git --version | awk '{print $3}')"
check_wrangler
echo

# ------------------------------------------------------------
# 登录（未登录时自动拉起浏览器登录）
# ------------------------------------------------------------
log_step "Cloudflare 登录"
log_rule
check_login 1
echo

# 子脚本一律以 --non-interactive 调用：上层已经做完交互，
# 下层再问一次（例如 API Worker 询问是否本地测试）会卡住自动化。
run_child() {
  local script="$1"
  local extra=("--non-interactive")
  # --preview 只对 Pages 有意义：Worker 只有一个正式环境，
  # 把 --preview 透传给 worker 脚本只会被它拒绝，所以这里按脚本分派。
  if [ "$script" = 'deploy-pages.sh' ] && deploy_target_is_preview; then
    extra+=("--preview")
  fi
  bash "$SCRIPT_DIR/$script" "${extra[@]}"
}

case "$MODE" in
  1)
    run_child deploy-proxy-worker.sh
    ;;
  2)
    run_child deploy-api-worker.sh
    ;;
  3)
    run_child deploy-pages.sh
    ;;
  4)
    log_step "【1/3】部署音乐代理 Worker"
    run_child deploy-proxy-worker.sh

    echo
    log_step "【2/3】部署 API Worker"
    # API Worker 失败不阻断前端：代理 + 前端可用时站内绝大多数功能仍可访问
    if ! run_child deploy-api-worker.sh; then
      log_warn "API Worker 部署失败，但音乐代理与前端仍可用"
    fi

    echo
    log_step "【3/3】部署前端 Pages"
    run_child deploy-pages.sh
    ;;
esac

echo
banner "全部部署完成"
log_dim "部署完成后如需自定义域名，请在 Cloudflare 控制台配置 Pages / Workers 路由"
echo
