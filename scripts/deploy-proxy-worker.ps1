# ============================================================
#  音乐代理 Worker 部署脚本
# ============================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$WorkerDir = Join-Path $ProjectRoot "workers\music-proxy"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🎵 部署音乐代理 Worker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 部署必须使用 package-lock.json 锁定的 wrangler。若允许 npx 自行下载，
# 同一个提交在不同时间、不同机器上可能用不同版本的 wrangler 部署，
# 「固定版本可复现」就只覆盖了源码、没覆盖工具链。
if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Write-Host "❌ 根目录依赖未安装，无法保证 wrangler 版本与锁文件一致" -ForegroundColor Red
    Write-Host "   请先执行: npm ci" -ForegroundColor Yellow
    exit 1
}

# 检查 wrangler
Write-Host "📦 检查 wrangler CLI..." -ForegroundColor Yellow
try {
    $wranglerVersion = & npx --no-install wrangler --version 2>&1
    Write-Host "   ✅ wrangler: $wranglerVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ wrangler 未找到，将自动安装" -ForegroundColor Red
}

Write-Host ""

# 检查登录状态
Write-Host "🔐 检查 Cloudflare 登录状态..." -ForegroundColor Yellow
$loginResult = & npx --no-install wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ⚠️  未登录，正在启动登录流程..." -ForegroundColor Yellow
    Write-Host ""
    & npx --no-install wrangler login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 登录失败" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ✅ 已登录" -ForegroundColor Green
}
Write-Host ""

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
Write-Host "  ✅ 音乐代理 Worker 部署完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "💡 提示: 访问 *.workers.dev 查看部署结果" -ForegroundColor Cyan
Write-Host ""
