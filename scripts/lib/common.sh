#!/usr/bin/env bash
# ============================================================
#  bash 部署脚本公共库
#
#  由 scripts/*.sh 通过 source 引入：
#      . "$(dirname "$0")/lib/common.sh"
#
#  设计取舍
#  --------
#  1. 与 PowerShell 版本保持同一套流程（依赖闸门 -> 准备资源 -> 构建 -> 部署），
#     但**不重复实现**易错逻辑：配置解析、Functions 同步、占位符注入、
#     .env 写入统一走 scripts/prepare-pages.mjs（Node 共享模块）。
#  2. 输出标记刻意使用 ASCII（[OK] / [!] / [x]）而不是 emoji：bash 版本要跑在
#     MSYS2、CI、macOS 等各种终端上，emoji 是否正常渲染取决于终端与 locale，
#     ASCII 标记在哪儿都读得懂。颜色在非 TTY 时自动关闭。
#  3. 全部脚本只在 `set -euo pipefail` 下运行，任何一步失败立即中止，
#     绝不在依赖或构建失败的情况下继续部署。
# ============================================================

if [ -z "${BASH_VERSION:-}" ]; then
  echo "错误：这些脚本需要 bash 运行（当前不是 bash）。" >&2
  exit 1
fi

set -euo pipefail

# ------------------------------------------------------------
# MSYS2 / Git Bash 路径转换防护
#
# 这两个运行时会把手写脚本「看起来像 POSIX 路径」的字符串改写成 Windows
# 路径后才交给原生程序（node.exe 等）。实测被改写的情形：
#     命令行参数   --api-url=/api/netease  ->  --api-url=E:/build-tool/msys2/api/netease
#     环境变量     API_URL=/api/netease    ->  E:/build-tool/msys2/api/netease
# 前端会因此拿到一个不存在的 API 前缀，而且不会报错，只是所有接口 404 ——
# 属于「静默出错」，必须在源头掐掉。
#
# 这两个变量是 MSYS2 官方的排除开关（分号或 `*` 分隔的前缀/名字列表）。
# 只在用户没有自己设置时才写入，避免覆盖使用者的显式配置。
# 注意：这里只排除与地址相关的入口，其余路径转换照旧保留 ——
# node 脚本自身的路径仍然依赖它从 /g/... 转成 G:\...。
# ------------------------------------------------------------
: "${MSYS2_ARG_CONV_EXCL:=--api-url}"
: "${MSYS2_ENV_CONV_EXCL:=API_URL}"
export MSYS2_ARG_CONV_EXCL MSYS2_ENV_CONV_EXCL

# ------------------------------------------------------------
# 路径
# ------------------------------------------------------------
_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_DIR="$(cd "$_COMMON_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/splayer-frontend"
API_WORKER_DIR="$ROOT_DIR/workers/api"
PROXY_WORKER_DIR="$ROOT_DIR/workers/music-proxy"
CONFIG_FILE="$ROOT_DIR/deploy.config.json"

# ------------------------------------------------------------
# 颜色
# ------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_CYAN=$'\033[36m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
  C_GRAY=$'\033[90m'
  C_RESET=$'\033[0m'
else
  C_CYAN='' C_GREEN='' C_YELLOW='' C_RED='' C_GRAY='' C_RESET=''
fi

# ------------------------------------------------------------
# 输出
# ------------------------------------------------------------
log_step() { printf '%s\n' "${C_CYAN}==> $*${C_RESET}"; }
log_ok()   { printf '%s\n' "${C_GREEN}  [OK] $*${C_RESET}"; }
log_warn() { printf '%s\n' "${C_YELLOW}  [!]  $*${C_RESET}"; }
log_err()  { printf '%s\n' "${C_RED}  [x]  $*${C_RESET}" >&2; }
log_dim()  { printf '%s\n' "${C_GRAY}       $*${C_RESET}"; }
log_rule() { printf '%s\n' "${C_GRAY}------------------------------------------------------------${C_RESET}"; }

die() {
  log_err "$1"
  if [ "$#" -gt 1 ]; then
    log_dim "$2"
  fi
  exit 1
}

# ------------------------------------------------------------
# 前置检查
# ------------------------------------------------------------

# 要求某个命令存在，否则给出可操作的提示
need_cmd() {
  local cmd="$1"
  local hint="${2:-}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    die "未找到命令：$cmd" "$hint"
  fi
}

check_node() {
  need_cmd node "安装 Node.js 18+（仓库根目录有 .nvmrc，可用 nvm use 对齐版本）"
  local ver
  ver="$(node --version)"
  log_ok "Node.js $ver"
}

# 从 deploy.config.json 读一个键（避免 bash 里手写 JSON 解析）
cfg() {
  node "$SCRIPT_DIR/get-config.mjs" "$1"
}

# ------------------------------------------------------------
# 发布闸门：依赖 pin + 补丁 + 单测
# ------------------------------------------------------------
verify_deps() {
  log_step "校验依赖与单测状态（发布闸门）"
  if ! node "$SCRIPT_DIR/deps.mjs" verify-deploy; then
    die "依赖状态校验未通过，已中止部署" "请先执行: npm run deps:update"
  fi
}

# 依赖目录是否已就位（submodule 未 init 时给明确提示）
require_dir() {
  local dir="$1"
  local label="$2"
  if [ ! -d "$dir" ]; then
    die "缺少上游依赖 $label（git submodule）" "请先执行: npm run deps:setup"
  fi
}

check_wrangler() {
  need_cmd npx "wrangler 通过 npx 调用，请确认 Node.js 与 npm 已安装"
  # 刻意不用 `npx --no-install`：它要求 wrangler 已经装在本仓库的 node_modules 里，
  # 新克隆的仓库会直接失败。用 `npx wrangler` 则由 npx 自行「本地优先、缺则取用缓存」
  # —— 这也是 PowerShell 版本一直在用的写法，两边行为保持一致。
  if ! npx wrangler --version >/dev/null 2>&1; then
    die "wrangler CLI 不可用" "请检查网络，或先执行: npm install"
  fi
  log_ok "wrangler 已就绪"
}

# 登录状态。allow_login=1 时未登录会触发 wrangler login（交互式）
check_login() {
  local allow_login="${1:-0}"
  if npx wrangler whoami >/dev/null 2>&1; then
    log_ok "Cloudflare 已登录"
    return 0
  fi
  if [ "$allow_login" = "1" ] && is_interactive; then
    log_warn "未登录，启动 wrangler login..."
    npx wrangler login || die "登录失败"
    return 0
  fi
  die "Cloudflare 未登录" "请先执行: npm run login"
}

# ------------------------------------------------------------
# 交互
# ------------------------------------------------------------

# 非交互模式：显式指定 --non-interactive，或设置了 NONINTERACTIVE=1，或 stdin 不是 TTY
is_interactive() {
  if [ "${NON_INTERACTIVE:-0}" = "1" ]; then
    return 1
  fi
  [ -t 0 ]
}

# 是否跳过交互（与 is_interactive 相反，便于直接写 if）
is_non_interactive() {
  ! is_interactive
}

# ask <提示> <默认值>
ask() {
  local prompt="$1"
  local default="${2:-}"
  local answer=''
  printf '%s' "${C_YELLOW}$prompt${C_RESET} " >&2
  read -r answer || answer=''
  if [ -z "$answer" ]; then
    printf '%s' "$default"
  else
    printf '%s' "$answer"
  fi
}

# confirm <提示> 默认值(y/n)  -> 返回 0 表示确认
confirm() {
  local prompt="$1"
  local default="${2:-n}"
  if is_non_interactive; then
    [ "$default" = "y" ]
    return
  fi
  local answer
  answer="$(ask "$prompt" "$default")"
  case "$answer" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

# ------------------------------------------------------------
# 解析通用参数
#
#   --non-interactive   等价于 NON_INTERACTIVE=1
#   -h | --help         打印用法后退出（用法由调用方通过 usage 变量提供）
# ------------------------------------------------------------
parse_common_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --non-interactive | -y | --yes)
        NON_INTERACTIVE=1
        shift
        ;;
      -h | --help)
        printf '%s\n' "${USAGE:-用法: $0 [--non-interactive]}"
        exit 0
        ;;
      *)
        die "未知参数：$1" "使用 --help 查看用法"
        ;;
    esac
  done
}

banner() {
  local title="$1"
  printf '\n%s\n' "${C_CYAN}========================================${C_RESET}"
  printf '%s\n' "${C_CYAN}  $title${C_RESET}"
  printf '%s\n\n' "${C_CYAN}========================================${C_RESET}"
}
