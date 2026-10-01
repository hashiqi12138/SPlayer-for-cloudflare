# ============================================================
#  一键部署脚本 - 部署全部组件到 Cloudflare
#
#  用法:
#    .\deploy-all.ps1            菜单交互，前端发正式环境
#    .\deploy-all.ps1 -Preview   前端发到预览分支别名（Worker 不受影响）
# ============================================================

param(
    [switch]$Preview
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   SPlayer + api-enhanced 全 Cloudflare 部署  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 前置检查
# ============================================================
Write-Host "📋 前置检查" -ForegroundColor Yellow
Write-Host "──────────────────────" -ForegroundColor Gray

# 部署必须使用 package-lock.json 锁定的 wrangler。若允许 npx 自行下载，
# 同一个提交在不同时间、不同机器上可能用不同版本的 wrangler 部署，
# 「固定版本可复现」就只覆盖了源码、没覆盖工具链。
if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Write-Host "   ❌ 根目录依赖未安装，无法保证 wrangler 版本与锁文件一致" -ForegroundColor Red
    Write-Host "      请先执行: npm ci" -ForegroundColor Yellow
    exit 1
}

# Node.js
try {
    $nodeVer = & node --version
    Write-Host "   ✅ Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Node.js 未安装" -ForegroundColor Red
    exit 1
}

# Git
try {
    $gitVer = & git --version
    Write-Host "   ✅ Git: $gitVer" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Git 未安装" -ForegroundColor Red
    exit 1
}

# wrangler
try {
    $wranglerVer = & npx --no-install wrangler --version 2>&1
    Write-Host "   ✅ wrangler: $wranglerVer" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  wrangler 将自动安装" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================
# 登录
# ============================================================
Write-Host "🔐 Cloudflare 登录" -ForegroundColor Yellow
Write-Host "──────────────────────" -ForegroundColor Gray

$loginResult = & npx --no-install wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   未登录，即将打开浏览器登录..." -ForegroundColor Yellow
    Write-Host ""
    & npx --no-install wrangler login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ 登录失败" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ 登录成功" -ForegroundColor Green
} else {
    Write-Host "   ✅ 已登录" -ForegroundColor Green
}
Write-Host ""

# ============================================================
# 选择部署模式
# ============================================================
Write-Host "🎯 选择部署模式" -ForegroundColor Yellow
Write-Host "──────────────────────" -ForegroundColor Gray
Write-Host "   1. 音乐代理 Worker  (最简单，推荐先试这个)" -ForegroundColor White
Write-Host "   2. API Worker       (实验性，需要逐步适配)" -ForegroundColor White
Write-Host "   3. 前端 Pages       (SPlayer Web 前端)" -ForegroundColor White
Write-Host "   4. 全部部署         (代理 + API + 前端)" -ForegroundColor White
Write-Host ""
if ($Preview) {
    Write-Host "📌 前端目标: 预览环境（-Preview）" -ForegroundColor Magenta
} else {
    Write-Host "📌 前端目标: 正式环境 (production)" -ForegroundColor Magenta
}
Write-Host ""
$mode = Read-Host "请选择 (1-4，默认 1)"

if ([string]::IsNullOrWhiteSpace($mode)) {
    $mode = "1"
}

Write-Host ""

# ============================================================
# 执行部署
#
# -Preview 只对前端 Pages 有意义：两个 Worker 各自只有一个正式环境，
# 因此 worker 脚本会明确拒绝 -Preview。为避免「以为发的是预览、其实动了线上」，
# 这里在只跑 Worker 的分支上直接把矛盾点出来并中止。
# ============================================================
if ($Preview -and ($mode -eq "1" -or $mode -eq "2")) {
    Write-Host "❌ -Preview 只适用于前端 Pages（选项 3 / 4）" -ForegroundColor Red
    Write-Host "   Worker 只有一个正式环境，没有预览环境可发" -ForegroundColor Yellow
    exit 1
}

switch ($mode) {
    "1" {
        # 音乐代理
        & "$ScriptDir\deploy-proxy-worker.ps1"
    }
    "2" {
        # API Worker
        & "$ScriptDir\deploy-api-worker.ps1"
    }
    "3" {
        # 前端 Pages
        & "$ScriptDir\deploy-pages.ps1" -Preview:$Preview
    }
    "4" {
        # 全部部署
        Write-Host "🚀 开始全部部署..." -ForegroundColor Cyan
        Write-Host ""
        
        Write-Host "【1/3】部署音乐代理 Worker" -ForegroundColor Cyan
        & "$ScriptDir\deploy-proxy-worker.ps1"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ 音乐代理部署失败" -ForegroundColor Red
            exit 1
        }
        
        Write-Host ""
        Write-Host "【2/3】部署 API Worker" -ForegroundColor Cyan
        & "$ScriptDir\deploy-api-worker.ps1"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️  API Worker 部署失败，但前端和代理可用" -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "【3/3】部署前端 Pages" -ForegroundColor Cyan
        & "$ScriptDir\deploy-pages.ps1" -Preview:$Preview
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ 前端部署失败" -ForegroundColor Red
            exit 1
        }
        
        Write-Host ""
        Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║          ✅ 全部部署完成!                  ║" -ForegroundColor Green
        Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
        Write-Host ""
    }
    default {
        Write-Host "❌ 无效选项" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "💡 部署完成后，记得配置 Pages Functions 或 Workers Routes" -ForegroundColor Cyan
Write-Host "   参考文档: DEPLOY.md" -ForegroundColor Gray
Write-Host ""
