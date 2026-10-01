#!/usr/bin/env bash
#
# 部署脚本自检（bash 版）
#
# 为什么需要它
# ------------
# 部署脚本平时没人天天跑，一旦坏了通常是在真正要发布的那一刻才发现。
# 这里用「假 node / 收窄的 PATH」把各条失败路径都走一遍，因此：
#   - 不需要 Cloudflare 凭据
#   - 不需要网络
#   - **不会触发任何真实部署**
#
# 用法
# ----
#   bash scripts/tests/deploy-scripts.test.sh
#
#   # MSYS2 / Git Bash 下 node 不在 PATH 时：
#   NODE_DIR="/c/Users/me/.../node" bash scripts/tests/deploy-scripts.test.sh
#
# 覆盖范围
# --------
#   1  语法检查         bash -n 全部脚本
#   2  换行符           *.sh 必须 LF（CRLF 会让 bash 报 $'\r': command not found）
#   3  参数解析         --help / 未知参数 / 非交互必填项 / 非法取值
#   4  配置读取         get-config.mjs 与 bash 命令替换配合
#   5  资源准备         prepare-pages.mjs 产物正确、无目录嵌套、无残留占位符
#   6  发布闸门         依赖校验失败时必须中止在构建/部署之前
#   7  前置检查         缺 node / 缺 npx 时给出可操作提示，而不是误导性报错
#   8  平台分派         deploy.mjs 的参数与用法

# 只用 pipefail，刻意不加 -u / -e。
#
# -u 遇到未定义变量会**整体中止**，表现出来就是「一条 [FAIL] 都没打印，但退出码非 0」，
# 排查时没有任何线索（CI 上就这么栽过一次：Linux 上只看到自检失败，看不到失败在哪）。
# -e 同理：一条断言失败就吞掉后面的检查。
# 自检要的是「逐条报告、一次看完」，所以把控制权留给 chk 系列函数。
set -o pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS="$REPO/scripts"
FRONTEND="$REPO/splayer-frontend"

# MSYS2 / Git Bash 里 node 常常不在登录 shell 的 PATH 上，允许外部指定。
# 兼容 Windows 形态（C:\...\node）与 POSIX 形态（/c/.../node）两种写法：
# 在 Windows 上用 `bash -c "NODE_DIR=/c/..."` 传参会踩到 MSYS2 的参数重解析，
# 直接以环境变量传 Windows 路径反而最稳。
if [ -n "${NODE_DIR:-}" ]; then
  case "$NODE_DIR" in
    [A-Za-z]:[\\/]*)
      NODE_DIR="/$(printf '%s' "$NODE_DIR" | cut -c1 | tr 'A-Z' 'a-z')$(printf '%s' "$NODE_DIR" | cut -c3-)"
      ;;
  esac
  NODE_DIR="$(printf '%s' "$NODE_DIR" | tr '\\' '/')"
  if [ -x "$NODE_DIR/node.exe" ]; then
    PATH="$NODE_DIR:$PATH"
    export PATH
  elif [ -x "$NODE_DIR/node" ]; then
    PATH="$NODE_DIR:$PATH"
    export PATH
  else
    echo "警告：NODE_DIR=$NODE_DIR 下找不到 node，将沿用当前 PATH" >&2
  fi
fi

TMPDIR_RUN="$(mktemp -d "${TMPDIR:-/tmp}/splayer-deploy-test.XXXXXX")"
FAKEBIN="$TMPDIR_RUN/fakebin"
mkdir -p "$FAKEBIN"

# 中途退出（环境异常、脚本被改坏、意外的非零退出）必须留下痕迹。
# 否则调用方只看到「退出码非 0 且没有 [FAIL]」，等于没有信息。
REACHED_SUMMARY=0
cleanup() {
  local rc=$?
  if [ "$REACHED_SUMMARY" != "1" ]; then
    printf '  [FAIL] 自检异常中断（未跑到汇总），退出码 %s\n' "$rc"
  fi
  rm -rf "$TMPDIR_RUN"
}
trap cleanup EXIT

pass=0
fail=0
skip=0

chk() {
  local rc="$1" desc="$2"
  if [ "$rc" = "0" ]; then
    printf '  [PASS] %s\n' "$desc"
    pass=$((pass + 1))
  else
    printf '  [FAIL] %s\n' "$desc"
    fail=$((fail + 1))
  fi
}

chk_contains() {
  local hay="$1" needle="$2" desc="$3"
  if printf '%s' "$hay" | grep -qF -- "$needle"; then
    printf '  [PASS] %s\n' "$desc"
    pass=$((pass + 1))
  else
    printf '  [FAIL] %s（未找到: %s）\n' "$desc" "$needle"
    printf '%s\n' "$hay" | head -20
    fail=$((fail + 1))
  fi
}

chk_absent() {
  local hay="$1" needle="$2" desc="$3"
  if printf '%s' "$hay" | grep -qF -- "$needle"; then
    printf '  [FAIL] %s（不应出现: %s）\n' "$desc" "$needle"
    fail=$((fail + 1))
  else
    printf '  [PASS] %s\n' "$desc"
    pass=$((pass + 1))
  fi
}

skip_msg() {
  printf '  [SKIP] %s\n' "$1"
  skip=$((skip + 1))
}

is_msys() {
  case "$(uname -o 2>/dev/null || echo unknown)" in
    Msys | Cygwin | MSYS* | CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

# 构造一个「只有基础工具、没有 node/npx」的最小 PATH
#
# 为什么不能直接写 PATH="$TMPDIR_RUN/nullbin:/usr/bin" 来模拟「缺少 node」：
# GitHub 的 Ubuntu runner 用 NodeSource apt 装了系统级 Node，/usr/bin/node 是存在的，
# 于是这个「缺少 node」的场景在 Linux 上根本复现不出来，断言必然失败
# （Windows 的 MSYS2 /usr/bin 里恰好没有 node，所以本地是绿的）。
#
# 改成构造一个只含基础工具、明确不含 node/npx 的 PATH。
#
# 两个细节是踩出来的：
#   1) 不能靠 `PATH="$EMPTY:/usr/bin"`：GitHub 的 Ubuntu runner 用 NodeSource apt
#      装了系统级 Node，/usr/bin/node 存在，这个场景在 Linux 上复现不出来，
#      断言必然失败（Windows 的 MSYS2 /usr/bin 恰好没有 node，本地是绿的）。
#   2) 不能用 `ln -s` 把工具链进空目录：MSYS2 下 ln -s 实际是复制，复制出来的
#      二进制找不到 msys-2.0.dll，执行时静默失败 —— 连 dirname 都会返回空字符串，
#      进而让 `cd "$(dirname ...)"` 变成无参 cd（跳到 $HOME），报出莫名其妙的路径。
#      因此改为生成「转发脚本」，靠绝对路径 shebang 启动真实二进制，跨平台可靠。
make_min_path() {
  local dir="$1"
  mkdir -p "$dir"
  local u real
  for u in dirname basename cut tr awk grep sed sort uniq head tail cat \
    mkdir rm rmdir ln chmod mv cp date env uname which expr tee wc mktemp touch find sleep; do
    real="$(command -v "$u" 2>/dev/null)" || continue
    [ -n "$real" ] || continue
    printf '#!/bin/sh\nexec "%s" "$@"\n' "$real" >"$dir/$u"
    chmod +x "$dir/$u" 2>/dev/null || true
  done
  # 确保 node/npx 确实不可见，否则这个场景不成立，交由调用方跳过
  rm -f "$dir/node" "$dir/npx" "$dir/npm" 2>/dev/null || true
  if [ -e "$dir/node" ] || [ -e "$dir/npx" ]; then
    return 1
  fi
  # 自检：转发脚本真的能跑通（否则整个场景没有意义）
  if [ "$(PATH="$dir" dirname /a/b/c 2>/dev/null)" != "/a/b" ]; then
    return 1
  fi
  return 0
}

echo "=== 0. 环境 ==="
echo "  bash   : $BASH_VERSION"
echo "  平台   : $(uname -o 2>/dev/null || uname -s)"
if command -v node >/dev/null 2>&1; then
  echo "  node   : $(command -v node) $(node --version)"
else
  echo "  node   : (未找到，依赖 node 的检查会被跳过)"
fi
echo

HAVE_NODE=0
command -v node >/dev/null 2>&1 && HAVE_NODE=1

# 绝对路径的 bash：后面要在「不含 bash 的最小 PATH」里启动脚本与假 node，
# 靠 PATH 查找会失败，用绝对路径 shebang 才可靠
BASH_BIN="${BASH:-$(command -v bash || echo bash)}"

echo "=== 1. 语法检查 ==="
for f in "$SCRIPTS"/*.sh "$SCRIPTS"/lib/*.sh "$SCRIPTS"/tests/*.sh; do
  bash -n "$f"
  chk $? "bash -n $(basename "$f")"
done
echo

echo "=== 2. 换行符（必须是 LF）==="
for f in "$SCRIPTS"/*.sh "$SCRIPTS"/lib/*.sh "$SCRIPTS"/tests/*.sh; do
  if grep -q $'\r' "$f"; then
    chk 1 "$(basename "$f") 含 CRLF"
  else
    chk 0 "$(basename "$f") 为 LF"
  fi
done
echo

echo "=== 3. --help 与参数解析 ==="
out="$(bash "$SCRIPTS/deploy-pages.sh" --help 2>&1)"
chk $? "deploy-pages.sh --help 退出码 0"
chk_contains "$out" '--non-interactive' "--help 输出用法"

out="$(bash "$SCRIPTS/deploy-pages.sh" --bogus 2>&1)"
rc=$?
[ $rc -ne 0 ]
chk $? "未知参数应报错退出"
chk_contains "$out" '未知参数' "未知参数提示文案"

out="$(bash "$SCRIPTS/deploy-all.sh" --non-interactive 2>&1)"
rc=$?
[ $rc -ne 0 ]
chk $? "deploy-all 非交互未给 --mode 应中止"
chk_contains "$out" '必须显式指定部署范围' "提示需显式指定 --mode"

out="$(bash "$SCRIPTS/deploy-all.sh" --mode=9 --non-interactive 2>&1)"
rc=$?
[ $rc -ne 0 ]
chk $? "非法 --mode 应中止"
chk_contains "$out" '无效的部署范围' "非法 --mode 提示文案"
chk_absent "$out" '前置检查' "参数校验早于前置检查（不该先跑一堆检查）"
echo

if [ "$HAVE_NODE" = "0" ]; then
  skip_msg "缺少 node，跳过第 4~8 节"
else
  echo "=== 4. 配置读取（get-config.mjs）==="
  v="$(node "$SCRIPTS/get-config.mjs" pagesProject)"
  [ -n "$v" ]
  chk $? "pagesProject 可读取（实际: $v）"
  node "$SCRIPTS/get-config.mjs" noSuchKey >/dev/null 2>&1
  [ $? -ne 0 ]
  chk $? "缺失键应返回非 0"
  echo

  echo "=== 5. 准备部署资源（prepare-pages.mjs）==="
  out="$(cd "$REPO" && node "$SCRIPTS/prepare-pages.mjs" 2>&1)"
  chk $? "prepare-pages.mjs 退出码 0"
  chk_contains "$out" 'Pages Functions 已同步' "Functions 同步输出"
  chk_contains "$out" 'VITE_API_URL=' ".env 写入 API 地址"

  [ -d "$FRONTEND/functions" ]
  chk $? "functions 目录已生成"
  [ ! -d "$FRONTEND/functions/functions" ]
  chk $? "没有 functions/functions 目录嵌套"
  if grep -rq '__API_WORKER_URL__\|__PROXY_WORKER_URL__' "$FRONTEND/functions" 2>/dev/null; then
    chk 1 "无残留占位符"
  else
    chk 0 "无残留占位符"
  fi

  out="$(cd "$REPO" && API_URL='E:/bogus/api/netease' node "$SCRIPTS/prepare-pages.mjs" 2>&1)"
  rc=$?
  [ $rc -ne 0 ]
  chk $? "畸形的 API 地址应被校验拦下"
  chk_contains "$out" '取值不合法' "畸形地址提示文案"

  out="$(cd "$REPO" && API_URL='https://example.workers.dev' node "$SCRIPTS/prepare-pages.mjs" 2>&1)"
  chk $? "绝对 URL 形态的 API 地址应被接受"
  # 跑回默认值，避免把测试用的地址留在工作区
  (cd "$REPO" && node "$SCRIPTS/prepare-pages.mjs" >/dev/null 2>&1)
  echo

  echo "=== 5b. 产物收尾（finalize-dist.mjs）==="
  # _redirects / _headers 只有出现在构建产物里才会生效，这一步负责把它们放进去。
  # 测试时若产物目录不存在就临时造一个，跑完再删掉，避免污染真实的构建产物。
  OUT_DIR="$FRONTEND/out/renderer"
  made_out=0
  if [ ! -d "$OUT_DIR" ]; then
    mkdir -p "$OUT_DIR"
    made_out=1
  fi
  [ -f "$OUT_DIR/index.html" ] || echo '<!doctype html><title>placeholder</title>' >"$OUT_DIR/index.html"

  out="$(cd "$REPO" && node "$SCRIPTS/finalize-dist.mjs" 2>&1)"
  chk $? "finalize-dist.mjs 退出码 0"
  chk_contains "$out" 'Pages 配置已进入产物' "Pages 配置复制输出"
  chk_contains "$out" '产物自检通过' "产物自检输出"

  [ -f "$OUT_DIR/_redirects" ]
  chk $? "_redirects 进入产物"
  [ -f "$OUT_DIR/_headers" ]
  chk $? "_headers 进入产物"
  [ -f "$OUT_DIR/version.json" ]
  chk $? "version.json 已生成"
  if grep -q '"commit"' "$OUT_DIR/version.json" 2>/dev/null; then
    chk 0 "version.json 含提交号字段"
  else
    chk 1 "version.json 含提交号字段"
  fi
  if grep -q 'Cache-Control: no-cache' "$OUT_DIR/_headers" 2>/dev/null; then
    chk 0 "version.json 未被 CDN 长缓存"
  else
    chk 1 "version.json 未被 CDN 长缓存"
  fi

  if [ "$made_out" = "1" ]; then
    rm -rf "$FRONTEND/out"
  fi
  echo

  echo "=== 6. 发布闸门：依赖校验失败必须中止在构建/部署之前 ==="
  REAL_NODE="$(command -v node)"
  cat >"$FAKEBIN/node" <<EOF
#!$BASH_BIN
# 假的 node：只拦截 deps.mjs 的闸门命令，其余原样转发给真 node
# shebang 用绝对路径：这个假 node 会在「不含 bash 的最小 PATH」下执行
case "\$*" in
  *deps.mjs\ verify-deploy*)
    if [ "\${FAKE_DEPS_FAIL:-1}" = "1" ]; then
      echo "  模拟依赖校验失败" >&2
      exit 1
    fi
    echo "  模拟依赖校验通过"
    exit 0
    ;;
esac
exec "$REAL_NODE" "\$@"
EOF
  chmod +x "$FAKEBIN/node"

  out="$(PATH="$FAKEBIN:$PATH" FAKE_DEPS_FAIL=1 bash "$SCRIPTS/deploy-pages.sh" --non-interactive 2>&1)"
  rc=$?
  [ $rc -ne 0 ]
  chk $? "pages：闸门失败时退出码非 0"
  chk_contains "$out" '依赖状态校验未通过' "pages：给出闸门失败提示"
  chk_absent "$out" '安装前端依赖' "pages：闸门失败后未继续到安装依赖"
  chk_absent "$out" 'pages deploy' "pages：闸门失败后未继续到部署"

  out="$(PATH="$FAKEBIN:$PATH" FAKE_DEPS_FAIL=1 bash "$SCRIPTS/deploy-api-worker.sh" --non-interactive 2>&1)"
  rc=$?
  [ $rc -ne 0 ]
  chk $? "api-worker：闸门失败时退出码非 0"
  chk_contains "$out" '依赖状态校验未通过' "api-worker：给出闸门失败提示"
  chk_absent "$out" 'wrangler deploy' "api-worker：闸门失败后未继续到部署"
  echo

  echo "=== 7. 前置检查的报错是否可操作 ==="
  MINBIN="$TMPDIR_RUN/minbin"
  if make_min_path "$MINBIN"; then
    # 缺 node：PATH 里只有基础工具，node / npx / npm 都不存在
    out="$(PATH="$MINBIN" "$BASH_BIN" "$SCRIPTS/deploy-api-worker.sh" --non-interactive 2>&1)"
    rc=$?
    [ $rc -ne 0 ]
    chk $? "缺 node 时退出码非 0"
    chk_contains "$out" '未找到命令：node' "缺 node 时直说缺 node"
    chk_contains "$out" 'Node.js' "给出安装提示"

    # 有 node（假 node，闸门放行）但没有 npx：应停在 wrangler 检查
    out="$(PATH="$FAKEBIN:$MINBIN" FAKE_DEPS_FAIL=0 "$BASH_BIN" "$SCRIPTS/deploy-pages.sh" --non-interactive 2>&1)"
    rc=$?
    [ $rc -ne 0 ]
    chk $? "缺 npx 时退出码非 0"
    chk_contains "$out" '未找到命令：npx' "缺 npx 提示文案"
    chk_contains "$out" '模拟依赖校验通过' "闸门通过后才进入 wrangler 检查"

    out="$(PATH="$FAKEBIN:$MINBIN" FAKE_DEPS_FAIL=0 "$BASH_BIN" "$SCRIPTS/deploy-proxy-worker.sh" --non-interactive 2>&1)"
    rc=$?
    [ $rc -ne 0 ]
    chk $? "proxy-worker 缺 npx 时退出码非 0"
    chk_contains "$out" '未找到命令：npx' "proxy-worker 缺 npx 提示文案"
  else
    skip_msg "无法构造不含 node/npx 的 PATH，跳过「缺少工具」相关检查"
  fi
  echo

  echo "=== 8. 平台分派（deploy.mjs）==="
  out="$(cd "$REPO" && DEPLOY_SHELL=bash node "$SCRIPTS/deploy.mjs" 2>&1)"
  chk_contains "$out" '用法: node scripts/deploy.mjs' "无参数时输出用法"
  out="$(cd "$REPO" && DEPLOY_SHELL=bash node "$SCRIPTS/deploy.mjs" nosuch 2>&1)"
  chk_contains "$out" '用法: node scripts/deploy.mjs' "非法目标时输出用法"
  echo

  if is_msys; then
    echo "=== 9. MSYS2 / Git Bash 路径转换防护 ==="
    mangled="$(API_URL=/api/netease node -e 'process.stdout.write(String(process.env.API_URL))')"
    # 不硬编码盘符：MSYS2 装在哪盘、Git for Windows 装在 C:\Program Files\Git，
    # 改写后的前缀各不相同，唯一可靠的特征是「值被改掉了」。
    if [ "$mangled" != "/api/netease" ]; then
      chk 0 "对照组：裸调用确实被路径转换改写（$mangled）"
    else
      chk 1 "对照组：裸调用本应被改写，但取到的仍是 $mangled"
    fi

    out="$(cd "$REPO" && . "$SCRIPTS/lib/common.sh" >/dev/null 2>&1; API_URL=/api/netease node "$SCRIPTS/prepare-pages.mjs" 2>&1)"
    chk_contains "$out" 'VITE_API_URL=/api/netease' "载入 common.sh 后地址未被改写"
    (cd "$REPO" && node "$SCRIPTS/prepare-pages.mjs" >/dev/null 2>&1)
    echo
  else
    skip_msg "非 MSYS2 环境，跳过路径转换防护检查"
    echo
  fi
fi

echo "════════════════════════════════════"
printf '  通过 %d / 失败 %d / 跳过 %d\n' "$pass" "$fail" "$skip"
echo "════════════════════════════════════"
REACHED_SUMMARY=1
[ "$fail" -eq 0 ]
