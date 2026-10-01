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

# 仓库状态：提交号 / 工作区是否真的脏
#
# 刻意不在这里手写 git 命令：`dirty` 的判断口径（忽略子模块、忽略换行符噪音）
# 必须与 finalize-dist.mjs 写进 version.json 的结论完全一致，否则
# 「Pages 控制台显示的提交」和「线上 /version.json 显示的提交」会互相打架。
git_meta() {
  node "$SCRIPT_DIR/git-meta.mjs" "$1"
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

# 根目录依赖是否已安装
#
# 部署必须使用 package-lock.json 锁定的 wrangler：如果允许 npx 自行下载，
# 同一个提交在不同时间、不同机器上可能用不同版本的 wrangler 部署，
# 「固定版本可复现」就只覆盖了源码、没覆盖工具链。
ensure_local_deps() {
  if [ ! -d "$ROOT_DIR/node_modules" ]; then
    die "根目录依赖未安装，无法保证 wrangler 版本与锁文件一致" "请先执行: npm ci"
  fi
}

check_wrangler() {
  need_cmd npx "wrangler 通过 npx 调用，请确认 Node.js 与 npm 已安装"
  # `--no-install` 是刻意的：只用 node_modules 里锁文件装出来的版本，
  # 缺了就报错让使用者去 npm ci，而不是悄悄下载一个「最新的」。
  if ! npx --no-install wrangler --version >/dev/null 2>&1; then
    die "wrangler CLI 不可用" "请执行: npm ci（需要锁定版本的 wrangler）"
  fi
  log_ok "wrangler 已就绪（本地锁定版本）"
}

# 登录状态。allow_login=1 时未登录会触发 wrangler login（交互式）
check_login() {
  local allow_login="${1:-0}"
  if npx --no-install wrangler whoami >/dev/null 2>&1; then
    log_ok "Cloudflare 已登录"
    return 0
  fi
  if [ "$allow_login" = "1" ] && is_interactive; then
    log_warn "未登录，启动 wrangler login..."
    npx --no-install wrangler login || die "登录失败"
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
# 部署目标：prod（默认，发正式环境）或 preview（发预览环境）
#
# Pages 用分支别名区分正式/预览；Worker 只有一个正式环境，因此 worker 脚本
# 会明确拒绝 preview —— 免得出现「以为发的是预览，其实动了线上」。
DEPLOY_TARGET="${DEPLOY_TARGET:-prod}"

deploy_target_is_preview() {
  [ "$DEPLOY_TARGET" = 'preview' ]
}

# Worker 只有一个正式环境（没有分支别名这回事）。
# 明确拒绝 --preview，而不是静默忽略：静默忽略会让人以为「我发的是预览」，
# 实际却改了线上 worker —— 这类误解比直接报错危险得多。
reject_preview_target() {
  if deploy_target_is_preview; then
    die "该脚本不支持 --preview：Worker 只有一个正式环境" \
      "Pages 才有正式/预览之分；Worker 请去掉 --preview 后重试"
  fi
}

# 本次 Pages 发布要传给 `wrangler pages deploy --branch=` 的分支名
#
# 正式环境**也必须显式传 --branch**，不能靠「不传」来发正式：
# Cloudflare 判断正式/预览的依据是「分支名是否等于项目设置的 Production branch」，
# 而 wrangler 在不传 --branch 时会从当前 git 仓库自动探测分支 —— 部署是在
# 子模块目录 splayer-frontend 里执行的，子模块处于 detached HEAD，探测结果为
# `HEAD`，于是本该发正式的部署变成了一个叫 HEAD 的预览部署。
# 实测踩到过：脚本打印「目标: 正式环境 (production)」，Pages 控制台里却是 Preview。
#
# pagesProdBranch 是**必需配置项**，缺了直接报错而不是猜一个默认值：
# 猜错时部署同样会静静落到预览环境，一样看不出来。
pages_deploy_branch() {
  local branch=''
  local key='pagesProdBranch'
  # 刻意写成 if 而不是 `deploy_target_is_preview && key=...`：
  # 后者在非预览时整条语句返回 1，虽然在 set -e 下通常不会中止，
  # 但「依赖 set -e 的例外规则」不值得 —— 挨着它的下一行就是分支名解析。
  if deploy_target_is_preview; then
    key='pagesPreviewBranch'
  fi

  branch="$(cfg "$key" 2>/dev/null || true)"
  if [ -z "$branch" ]; then
    die "未配置 $key" \
      "该值必须与 Cloudflare Pages 项目设置里的分支名一致（正式看 Production branch，预览填任意分支别名）"
  fi
  printf '%s' "$branch"
}

parse_common_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --non-interactive | -y | --yes)
        NON_INTERACTIVE=1
        shift
        ;;
      --preview)
        DEPLOY_TARGET='preview'
        shift
        ;;
      --prod)
        DEPLOY_TARGET='prod'
        shift
        ;;
      -h | --help)
        printf '%s\n' "${USAGE:-用法: $0 [--non-interactive] [--preview]}"
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
