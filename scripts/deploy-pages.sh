#!/usr/bin/env bash
#
# SPlayer 前端 Pages 部署脚本（bash 版）
#
# 用法:
#   ./scripts/deploy-pages.sh                    交互式（会询问 API 地址）
#   ./scripts/deploy-pages.sh --non-interactive   全部取配置默认值，便于自动化
#   API_URL=/api/netease ./scripts/deploy-pages.sh --non-interactive
#
# 与 deploy-pages.ps1 完全等价：同样的依赖闸门、同样的准备步骤、同样的部署目标。
# 区别只在于易错的准备逻辑走 scripts/prepare-pages.mjs 共享实现，而非两套代码。
#
# 注意：脚本自身的可执行位依赖签名，Windows 上请用 `bash scripts/deploy-pages.sh`
# 调用（或 Git Bash / MSYS2 / WSL 直接执行）。

set -euo pipefail

USAGE='用法: deploy-pages.sh [--non-interactive]

环境变量:
  API_URL=/api/netease   前端请求的 API 地址（默认 /api/netease，由 Pages Functions 转发）
  NON_INTERACTIVE=1      等同 --non-interactive'

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

DEFAULT_API_URL='/api/netease'

parse_common_args "$@"

banner "部署 SPlayer 前端到 Cloudflare Pages"

# ------------------------------------------------------------
# 前置检查：依赖目录 / 补丁与单测闸门 / wrangler / 登录
#
# 先确认 node 可执行：后面所有检查都依赖它，缺了的话报错会指向
# 「依赖校验失败」这种误导性的结论。
# ------------------------------------------------------------
check_node
ensure_local_deps
require_dir "$FRONTEND_DIR" 'splayer-frontend'
verify_deps
check_wrangler
check_login 0
echo

# ------------------------------------------------------------
# API 地址：默认走相对路径，由 Pages Functions 转发
# ------------------------------------------------------------
if is_interactive && [ -z "${API_URL:-}" ]; then
  log_step "请输入 API 地址 (VITE_API_URL)"
  log_dim "留空使用默认值: $DEFAULT_API_URL (相对路径，配合 Pages Functions)"
  echo
  API_URL="$(ask 'API 地址' "$DEFAULT_API_URL")"
else
  API_URL="${API_URL:-$DEFAULT_API_URL}"
fi

# 只有相对路径需要转换成绝对 URL 的情形才需要 API_WORKER_URL；此处只写 .env，
# 其余注入由 prepare-pages.mjs 依据 deploy.config.json 完成。
log_ok "API 地址 (VITE_API_URL): $API_URL"
echo

# ------------------------------------------------------------
# 准备部署资源（_redirects / Functions 注入 / .env）
#
# 与 PowerShell 版本共用同一份 Node 实现，避免两套代码在占位符、
# 目录复制方式上逐渐跑偏。
#
# 关于 MSYS2 / Git Bash 的路径转换：这类运行时会把形似 POSIX 路径的
# 环境变量改写成 Windows 路径（/api/netease -> E:/build-tool/msys2/api/netease）。
# scripts/lib/common.sh 已通过 MSYS2_ENV_CONV_EXCL 排除 API_URL；这里再加一道
# 结构性保险：取默认值时干脆不传该变量，由 Node 侧使用同样的默认值。
# 两者叠加后，无论运行时是否遵循排除开关，默认路径都不会被写错。
# ------------------------------------------------------------
log_step "准备部署资源"
if [ "$API_URL" = "$DEFAULT_API_URL" ]; then
  unset API_URL
fi
API_URL="${API_URL:-}" node "$SCRIPT_DIR/prepare-pages.mjs"
echo

# ------------------------------------------------------------
# 安装依赖 + 构建
#
# SKIP_NATIVE_BUILD=true：Electron 原生模块在 Cloudflare Pages 上无用，
# 关掉可以省掉一次编译并绕开本地编译工具链缺失的问题。
# ------------------------------------------------------------
export SKIP_NATIVE_BUILD=true

log_step "安装前端依赖"
cd "$FRONTEND_DIR"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install || die "pnpm install 失败" "可检查网络或删除 node_modules 后重试"
else
  log_warn "未找到 pnpm，改用 npm"
  npm install || die "npm install 失败" "可检查网络或删除 node_modules 后重试"
fi
log_ok "依赖安装完成"
echo

log_step "构建前端"
if command -v pnpm >/dev/null 2>&1; then
  pnpm build || die "前端构建失败" "可先单独执行 cd splayer-frontend && pnpm build 查看完整报错"
else
  npm run build || die "前端构建失败" "可先单独执行 cd splayer-frontend && npm run build 查看完整报错"
fi
log_ok "构建完成"
echo

# 确认构建产物存在：产物缺失时 wrangler 可能仍然“成功”，
# 结果是把空目录推上去覆盖线上，所以这里必须硬校验。
OUTPUT_DIR="$FRONTEND_DIR/out/renderer"
[ -d "$OUTPUT_DIR" ] || die "构建产物不存在: $OUTPUT_DIR" "请确认构建日志里没有 warnings 变 errors"
[ -f "$OUTPUT_DIR/index.html" ] || die "构建产物缺少 index.html: $OUTPUT_DIR"
log_ok "构建产物: out/renderer"
echo

# ------------------------------------------------------------
# 部署到 Pages
#
# 项目名与分支取自 deploy.config.json：
#   分支留空 -> 发布到 production；填分支名 -> 发布到该分支的 preview 别名。
# 本项目实际使用 dev 分支别名（https://dev.<project>.pages.dev），
# 不指定分支会发到 production，访问地址与预期不一致。
# ------------------------------------------------------------
PROJECT_NAME="$(cfg pagesProject)"
BRANCH="$(cfg pagesBranch || true)"

TARGET_DESC='production'
BRANCH_ARGS=()
if [ -n "$BRANCH" ]; then
  TARGET_DESC="$BRANCH"
  BRANCH_ARGS=("--branch=$BRANCH")
fi

log_step "部署到 Cloudflare Pages"
log_dim "项目: $PROJECT_NAME"
log_dim "分支: $TARGET_DESC"
echo

npx --no-install wrangler pages deploy out/renderer \
  --project-name="$PROJECT_NAME" "${BRANCH_ARGS[@]+"${BRANCH_ARGS[@]}"}"

echo
banner "前端部署完成"
ACCESS_URL="$(cfg pagesUrl 2>/dev/null || true)"
[ -n "$ACCESS_URL" ] || ACCESS_URL="https://$PROJECT_NAME.pages.dev"
printf '%s\n' "${C_CYAN}访问地址: $ACCESS_URL${C_RESET}"
echo
