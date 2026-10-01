#!/usr/bin/env bash
#
# SPlayer 前端 Pages 部署脚本（bash 版）
#
# 用法:
#   ./scripts/deploy-pages.sh                    交互式（会询问 API 地址），发正式环境
#   ./scripts/deploy-pages.sh --preview          发到预览分支别名（pagesPreviewBranch）
#   ./scripts/deploy-pages.sh --non-interactive   全部取配置默认值，便于自动化
#   API_URL=/api/netease ./scripts/deploy-pages.sh --non-interactive
#
# 与 deploy-pages.ps1 完全等价：同样的依赖闸门、同样的准备步骤、同样的部署目标。
# 区别只在于易错的准备逻辑走 scripts/prepare-pages.mjs 共享实现，而非两套代码。
#
# 注意：脚本自身的可执行位依赖签名，Windows 上请用 `bash scripts/deploy-pages.sh`
# 调用（或 Git Bash / MSYS2 / WSL 直接执行）。

set -euo pipefail

USAGE='用法: deploy-pages.sh [--non-interactive] [--preview]

参数:
  --non-interactive      跳过所有询问，取配置默认值
  --preview              发到预览环境（分支别名 pagesPreviewBranch）
                         不带该参数时发正式环境 (production)

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
# 发布目标（项目名 + 分支名）提前解析并校验
#
# 刻意放在构建之前：分支名没配属于配置问题，而后面是几分钟的前端构建 ——
# 等构建跑完才发现「pagesProdBranch 没填」，纯属浪费。
# ------------------------------------------------------------
PROJECT_NAME="$(cfg pagesProject)"
BRANCH="$(pages_deploy_branch)"
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
# 产物收尾
#
# 把 frontend-config/_redirects、_headers 放进 out/renderer，并写入 version.json。
# 必须在上传之前做：只有出现在产物里的东西才会真的生效
# （_redirects 曾经被复制到前端项目根目录，而上传的只有 out/renderer，等于没配）。
# ------------------------------------------------------------
log_step "产物收尾（Pages 配置 + 版本戳）"
node "$SCRIPT_DIR/finalize-dist.mjs"
echo

# ------------------------------------------------------------
# 部署到 Pages
#
# 目标环境是**显式选择**，不是隐含默认：
#   默认（不带参数） -> 正式环境，分支名为 pagesProdBranch（须与 Pages 项目设置里的
#                       Production branch 一致），落到项目主域名（pagesProdUrl）
#   --preview        -> 预览环境，分支名为 pagesPreviewBranch
#                       （<branch>.<project>.pages.dev）
#
# 两侧都必须显式传 --branch —— 不能靠「不传」来发正式：wrangler 不传时会从当前
# git 仓库自动探测分支，而这里是在子模块目录里部署，探测结果是 `HEAD`，
# 于是本该发正式的部署会变成一个叫 HEAD 的预览部署（踩过：脚本打印「正式环境」，
# Pages 控制台里却是 Preview）。判断依据见 lib/common.sh 的 pages_deploy_branch。
#
# 以前配置里写死了 pagesBranch=dev，于是每次部署都发预览、正式环境一直是空的。
# ------------------------------------------------------------
if deploy_target_is_preview; then
  TARGET_DESC="预览环境（分支别名 $BRANCH）"
  ACCESS_URL="$(cfg pagesPreviewUrl 2>/dev/null || true)"
else
  TARGET_DESC="正式环境 (production，分支 $BRANCH)"
  ACCESS_URL="$(cfg pagesProdUrl 2>/dev/null || true)"
fi
[ -n "$ACCESS_URL" ] || ACCESS_URL="https://$PROJECT_NAME.pages.dev"

# 提交信息也要显式传：wrangler 默认从**执行目录**（子模块 splayer-frontend）取 git
# 信息，Pages 控制台上显示的会是上游 SPlayer 的提交，与 /version.json 里的本仓库
# 提交号对不上，核对线上版本时会白跑一趟。
# --commit-message 同样要传：wrangler 拿到 --commit-hash 后会用子模块的 git 库去
# 反查标题，而本仓库的提交在子模块里不存在，于是每次多打印一行
# `fatal: bad object <sha>`（部署不受影响，但看着像出错了）。
COMMIT_HASH="$(git_meta hash || true)"
COMMIT_SUBJECT="$(git_meta subject || true)"
COMMIT_DIRTY="$(git_meta dirty || true)"

log_step "部署到 Cloudflare Pages"
log_dim "项目: $PROJECT_NAME"
log_dim "目标: $TARGET_DESC"
if [ -n "$COMMIT_HASH" ]; then
  log_dim "提交: $(printf '%s' "$COMMIT_HASH" | cut -c1-7)"
else
  log_warn "取不到 git 提交号，Pages 控制台上的提交信息会不准确"
fi
echo

DEPLOY_ARGS=(--project-name="$PROJECT_NAME" --branch="$BRANCH")
if [ -n "$COMMIT_HASH" ]; then
  DEPLOY_ARGS+=(--commit-hash="$COMMIT_HASH")
fi
if [ -n "$COMMIT_SUBJECT" ]; then
  DEPLOY_ARGS+=(--commit-message="$COMMIT_SUBJECT")
fi
if [ -n "$COMMIT_DIRTY" ]; then
  DEPLOY_ARGS+=(--commit-dirty="$COMMIT_DIRTY")
fi

npx --no-install wrangler pages deploy out/renderer "${DEPLOY_ARGS[@]}"

echo
banner "前端部署完成"
printf '%s\n' "${C_CYAN}访问地址: $ACCESS_URL${C_RESET}"
echo
