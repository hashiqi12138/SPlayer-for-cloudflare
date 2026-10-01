# ============================================================
#  SPlayer 前端 Pages 部署脚本
# ============================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$FrontendDir = Join-Path $ProjectRoot "splayer-frontend"
$ConfigDir = Join-Path $ProjectRoot "frontend-config"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🎨 部署 SPlayer 前端到 Cloudflare Pages" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 SPlayer 项目是否存在
if (-not (Test-Path $FrontendDir)) {
    Write-Host "📥 SPlayer 项目不存在，开始克隆..." -ForegroundColor Yellow
    Write-Host ""
    
    git clone https://github.com/SPlayer-Dev/SPlayer.git $FrontendDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 克隆失败" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ 克隆完成" -ForegroundColor Green
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

# 配置环境变量
$envFile = Join-Path $FrontendDir ".env"
$envExample = Join-Path $FrontendDir ".env.example"

if (-not (Test-Path $envFile)) {
    Write-Host "⚙️  配置环境变量..." -ForegroundColor Yellow
    
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
    } else {
        Set-Content $envFile @"
VITE_WEB_PORT=14558
VITE_SERVER_PORT=25884
VITE_API_URL=/api/netease
"@
    }
    
    Write-Host "   ✅ .env 文件已创建" -ForegroundColor Green
    Write-Host ""
}

# 复制 _redirects
$redirectsSrc = Join-Path $ConfigDir "_redirects"
$redirectsDest = Join-Path $FrontendDir "_redirects"
Copy-Item $redirectsSrc $redirectsDest -Force

# 复制 Pages Functions（/api/netease、/api/unblock、/music/unblock 等转发函数）
# frontend-config\functions 为唯一事实来源，避免重新 clone 前端后函数丢失
$functionsSrc = Join-Path $ConfigDir "functions"
$functionsDest = Join-Path $FrontendDir "functions"
if (Test-Path $functionsSrc) {
    Copy-Item $functionsSrc $functionsDest -Recurse -Force
    Write-Host "   ✅ Pages Functions 已同步" -ForegroundColor Green
}
Write-Host "📄 _redirects 配置已复制" -ForegroundColor Green
Write-Host ""

# 询问 API 地址
Write-Host "🌐 请输入 API 地址 (VITE_API_URL):" -ForegroundColor Yellow
Write-Host "   留空使用默认值: /api/netease (相对路径，配合 Pages Functions)" -ForegroundColor Gray
Write-Host "   例如: https://ncm-api.xxx.workers.dev" -ForegroundColor Gray
Write-Host ""
$apiUrl = Read-Host "API 地址"

if ([string]::IsNullOrWhiteSpace($apiUrl)) {
    $apiUrl = "/api/netease"
}

# 更新 .env 中的 API 地址
$envContent = Get-Content $envFile -Raw
if ($envContent -match "VITE_API_URL\s*=\s*.*") {
    $envContent = $envContent -replace "VITE_API_URL\s*=\s*.*", "VITE_API_URL=$apiUrl"
} else {
    $envContent += "`nVITE_API_URL=$apiUrl`n"
}
Set-Content $envFile $envContent -NoNewline

# ------------------------------------------------------------------
# 关闭「音乐解锁」默认开关
#
# 解锁三大音源（酷我/波点/网易云）均按出口 IP 限制，在 Cloudflare 出口
# 无法真正生效（详见证 workers/api/ADAPTATION_TODO.md），上游默认又是开启的。
# 若不禁用，每首不可用歌曲都会并发打 3 个必然失败的请求，白等数秒。
# 因此把 useSongUnlock 默认改为 false。
#
# 注意：Web 端「音乐解锁」设置项是 Electron 专属（config/play.ts 里
# show: isElectron），浏览器中无法手动开关，只能改默认值。
# 替换目标字符串唯一，脚本幂等，可重复执行。
# ------------------------------------------------------------------
$unlockSettingFile = Join-Path $FrontendDir "src\stores\setting.ts"
$unlockPatched = 0
if (Test-Path $unlockSettingFile) {
    $content = Get-Content $unlockSettingFile -Raw
    $updated = $content -replace 'useSongUnlock: true', 'useSongUnlock: false'
    if ($updated -ne $content) {
        Set-Content $unlockSettingFile $updated -NoNewline -Encoding UTF8
        $unlockPatched++
    }
}
Write-Host "   ✅ 音乐解锁默认已关闭（$unlockPatched 处）" -ForegroundColor Green
Write-Host "   ✅ API 地址已设置为: $apiUrl" -ForegroundColor Green
Write-Host ""

# 安装依赖
Write-Host "📦 安装依赖 (跳过原生模块构建)..." -ForegroundColor Yellow
$env:SKIP_NATIVE_BUILD = "true"

Push-Location $FrontendDir
try {
    & pnpm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ⚠️  pnpm 失败，尝试 npm..." -ForegroundColor Yellow
        & npm install
        if ($LASTEXITCODE -ne 0) {
            throw "依赖安装失败"
        }
    }
    Write-Host "   ✅ 依赖安装完成" -ForegroundColor Green
} finally {
    Pop-Location
}
Write-Host ""

# 构建
Write-Host "🔨 构建前端..." -ForegroundColor Yellow
$env:SKIP_NATIVE_BUILD = "true"

Push-Location $FrontendDir
try {
    & pnpm build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ⚠️  pnpm build 失败，尝试 npm run build..." -ForegroundColor Yellow
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "构建失败"
        }
    }
    Write-Host "   ✅ 构建完成" -ForegroundColor Green
} finally {
    Pop-Location
}
Write-Host ""

# 确认构建产物
$outputDir = Join-Path $FrontendDir "out\renderer"
if (-not (Test-Path $outputDir)) {
    Write-Host "❌ 构建产物不存在: $outputDir" -ForegroundColor Red
    exit 1
}

$indexHtml = Join-Path $outputDir "index.html"
if (-not (Test-Path $indexHtml)) {
    Write-Host "❌ index.html 不存在" -ForegroundColor Red
    exit 1
}

Write-Host "   📁 构建产物: $outputDir" -ForegroundColor Green
Write-Host ""

# 询问项目名称
Write-Host "📝 请输入 Pages 项目名称 (默认: splayer):" -ForegroundColor Yellow
$projectName = Read-Host "项目名称"
if ([string]::IsNullOrWhiteSpace($projectName)) {
    $projectName = "splayer"
}
Write-Host ""

# 部署到 Pages
Write-Host "🚀 部署到 Cloudflare Pages..." -ForegroundColor Yellow
Write-Host ""

Push-Location $FrontendDir
try {
    & npx wrangler pages deploy out/renderer --project-name=$projectName
    if ($LASTEXITCODE -ne 0) {
        throw "部署失败"
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ 前端部署完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 访问地址: https://$projectName.pages.dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 后续步骤:" -ForegroundColor Yellow
Write-Host "   1. 在 Pages 后台配置 Functions (如果需要转发 API)" -ForegroundColor Gray
Write-Host "   2. 绑定自定义域名（可选）" -ForegroundColor Gray
Write-Host ""
