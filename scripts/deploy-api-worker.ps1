# ============================================================
#  API Worker 部署脚本
#
#  用法:
#    .\deploy-api-worker.ps1                  交互式（会询问是否先本地测试）
#    .\deploy-api-worker.ps1 -NonInteractive  跳过所有询问，便于自动化
# ============================================================

param(
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$WorkerDir = Join-Path $ProjectRoot "workers\api"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🎵 部署 api-enhanced Worker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 前置检查：上游依赖与补丁/单测状态
#
# 上游依赖（ncm-source、splayer-frontend）以 git submodule 固定版本引入，
# 本地适配以 patch 形式叠加，统一由 scripts/deps.mjs 管理。
# 部署前必须确认：子模块已就位、补丁已应用、且单测在当前版本上通过。
# ============================================================
# 部署必须使用 package-lock.json 锁定的 wrangler。若允许 npx 自行下载，
# 同一个提交在不同时间、不同机器上可能用不同版本的 wrangler 部署，
# 「固定版本可复现」就只覆盖了源码、没覆盖工具链。
if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Write-Host "❌ 根目录依赖未安装，无法保证 wrangler 版本与锁文件一致" -ForegroundColor Red
    Write-Host "   请先执行: npm ci" -ForegroundColor Yellow
    exit 1
}

$ncmSource = Join-Path $WorkerDir "ncm-source"
if (-not (Test-Path $ncmSource)) {
    Write-Host "❌ 缺少上游依赖 workers/api/ncm-source（git submodule）" -ForegroundColor Red
    Write-Host "   请先执行: npm run deps:setup" -ForegroundColor Yellow
    exit 1
}

& node (Join-Path $ScriptDir "deps.mjs") verify-deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 依赖状态校验未通过，已中止部署" -ForegroundColor Red
    Write-Host "   请先执行: npm run deps:update" -ForegroundColor Yellow
    exit 1
}

# 检查 wrangler
Write-Host "📦 检查 wrangler CLI..." -ForegroundColor Yellow
try {
    $null = & npx --no-install wrangler --version 2>&1
    Write-Host "   ✅ wrangler 已就绪" -ForegroundColor Green
} catch {
    Write-Host "   ❌ wrangler 未找到" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 检查登录状态
Write-Host "🔐 检查 Cloudflare 登录状态..." -ForegroundColor Yellow
$loginResult = & npx --no-install wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ⚠️  未登录，请先运行: npm run login" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "   ✅ 已登录" -ForegroundColor Green
}
Write-Host ""

# 安装依赖
Write-Host "📦 安装依赖..." -ForegroundColor Yellow
Push-Location $WorkerDir
try {
    & npm install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install 失败"
    }
    Write-Host "   ✅ 依赖安装完成" -ForegroundColor Green
} finally {
    Pop-Location
}
Write-Host ""

# 先本地测试一下（可选）
if ($NonInteractive) {
    $testLocal = "n"
    Write-Host "🧪 本地测试: 跳过（-NonInteractive）" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "🧪 是否先本地测试？(y/N)" -ForegroundColor Yellow -NoNewline
    $testLocal = Read-Host
}
if ($testLocal -eq "y" -or $testLocal -eq "Y") {
    Write-Host ""
    Write-Host "   启动本地开发服务器..." -ForegroundColor Yellow
    Write-Host "   按 Ctrl+C 停止" -ForegroundColor Gray
    Write-Host ""
    Push-Location $WorkerDir
    try {
        & npx --no-install wrangler dev
    } finally {
        Pop-Location
    }
    Write-Host ""
}

# 部署
Write-Host "🚀 开始部署..." -ForegroundColor Yellow
Write-Host ""

Push-Location $WorkerDir
try {
    & npx --no-install wrangler deploy
    if ($LASTEXITCODE -ne 0) {
        throw "部署失败"
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ API Worker 部署完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  注意: API Worker 是实验性功能" -ForegroundColor Yellow
Write-Host "   如遇到问题，请参考 ADAPTATION_TODO.md" -ForegroundColor Gray
Write-Host ""
