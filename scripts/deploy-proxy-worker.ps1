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

# 检查 wrangler
Write-Host "📦 检查 wrangler CLI..." -ForegroundColor Yellow
try {
    $wranglerVersion = & npx wrangler --version 2>&1
    Write-Host "   ✅ wrangler: $wranglerVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ wrangler 未找到，将自动安装" -ForegroundColor Red
}

Write-Host ""

# 检查登录状态
Write-Host "🔐 检查 Cloudflare 登录状态..." -ForegroundColor Yellow
$loginResult = & npx wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ⚠️  未登录，正在启动登录流程..." -ForegroundColor Yellow
    Write-Host ""
    & npx wrangler login
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
    & npx wrangler deploy
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
