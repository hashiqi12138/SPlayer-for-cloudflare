# ============================================================
#  一键部署脚本 - 部署全部组件到 Cloudflare
# ============================================================

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
    $wranglerVer = & npx wrangler --version 2>&1
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

$loginResult = & npx wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   未登录，即将打开浏览器登录..." -ForegroundColor Yellow
    Write-Host ""
    & npx wrangler login
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
$mode = Read-Host "请选择 (1-4，默认 1)"

if ([string]::IsNullOrWhiteSpace($mode)) {
    $mode = "1"
}

Write-Host ""

# ============================================================
# 执行部署
# ============================================================

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
        & "$ScriptDir\deploy-pages.ps1"
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
        & "$ScriptDir\deploy-pages.ps1"
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
