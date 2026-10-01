# ============================================================
#  API Worker 部署脚本
# ============================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$WorkerDir = Join-Path $ProjectRoot "workers\api"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🎵 部署 api-enhanced Worker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 setup 是否已运行
$moduleDir = Join-Path $WorkerDir "src\ncm-modules"
if (-not (Test-Path $moduleDir)) {
    Write-Host "⚠️  API 模块尚未导入" -ForegroundColor Yellow
    Write-Host "   正在运行 setup 脚本..." -ForegroundColor Yellow
    Write-Host ""
    
    Push-Location $WorkerDir
    try {
        & node scripts/setup-api-enhanced.js
        if ($LASTEXITCODE -ne 0) {
            throw "Setup 失败"
        }
    } finally {
        Pop-Location
    }
    Write-Host ""
}

# 检查 wrangler
Write-Host "📦 检查 wrangler CLI..." -ForegroundColor Yellow
try {
    $null = & npx wrangler --version 2>&1
    Write-Host "   ✅ wrangler 已就绪" -ForegroundColor Green
} catch {
    Write-Host "   ❌ wrangler 未找到" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 检查登录状态
Write-Host "🔐 检查 Cloudflare 登录状态..." -ForegroundColor Yellow
$loginResult = & npx wrangler whoami 2>&1
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
Write-Host "🧪 是否先本地测试？(y/N)" -ForegroundColor Yellow -NoNewline
$testLocal = Read-Host
if ($testLocal -eq "y" -or $testLocal -eq "Y") {
    Write-Host ""
    Write-Host "   启动本地开发服务器..." -ForegroundColor Yellow
    Write-Host "   按 Ctrl+C 停止" -ForegroundColor Gray
    Write-Host ""
    Push-Location $WorkerDir
    try {
        & npx wrangler dev
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
    & npx wrangler deploy
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
