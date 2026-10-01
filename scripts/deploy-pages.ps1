# ============================================================
#  SPlayer 前端 Pages 部署脚本
#
#  用法:
#    .\deploy-pages.ps1                  交互式（会询问 API 地址）
#    .\deploy-pages.ps1 -NonInteractive  全部取配置默认值，便于自动化
# ============================================================

param(
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$FrontendDir = Join-Path $ProjectRoot "splayer-frontend"
$ConfigDir = Join-Path $ProjectRoot "frontend-config"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🎨 部署 SPlayer 前端到 Cloudflare Pages" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 前置检查：上游依赖与补丁/单测状态
#
# splayer-frontend 以 git submodule 固定版本引入，本地适配以 patch 形式
# 存放在 patches/，统一由 scripts/deps.mjs 管理。部署前必须确认：
# 子模块已就位、补丁已应用、且单测在当前版本上通过。
# ============================================================
if (-not (Test-Path $FrontendDir)) {
    Write-Host "❌ 缺少上游依赖 splayer-frontend（git submodule）" -ForegroundColor Red
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

# ------------------------------------------------------------------
# 载入部署配置（deploy.config.json 为唯一事实来源）
# ------------------------------------------------------------------
$configFile = Join-Path $ProjectRoot "deploy.config.json"
if (-not (Test-Path $configFile)) {
    Write-Host "❌ 缺少 deploy.config.json" -ForegroundColor Red
    exit 1
}
# 必须显式 -Encoding UTF8：该文件无 BOM，PowerShell 5.1 默认按系统 ANSI 读取，
# 一旦内容含中文，解码后的尾字节可能恰好是反斜杠，把 JSON 的引号转义掉导致解析失败。
# 配置本身也刻意只用 ASCII，双重保险。
$deployConfig = Get-Content $configFile -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not $deployConfig.apiWorkerUrl -or -not $deployConfig.proxyWorkerUrl) {
    Write-Host "❌ deploy.config.json 缺少 apiWorkerUrl / proxyWorkerUrl" -ForegroundColor Red
    exit 1
}

# 复制 _redirects
$redirectsSrc = Join-Path $ConfigDir "_redirects"
$redirectsDest = Join-Path $FrontendDir "_redirects"
Copy-Item $redirectsSrc $redirectsDest -Force

# 复制 Pages Functions，并把占位符替换成配置里的实际地址。
# frontend-config\functions 是模板（唯一事实来源），地址只在 deploy.config.json 维护。
$functionsSrc = Join-Path $ConfigDir "functions"
$functionsDest = Join-Path $FrontendDir "functions"
if (Test-Path $functionsSrc) {
    # 必须先删掉目标目录再复制：Copy-Item 到「已存在的目录」会把源目录整个塞进去，
    # 生成 functions\functions\... 这样的嵌套副本，部署后多出一批无用路由。
    if (Test-Path $functionsDest) {
        Remove-Item $functionsDest -Recurse -Force
    }
    Copy-Item $functionsSrc $functionsDest -Recurse -Force

    $patched = 0
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    Get-ChildItem -Path $functionsDest -Recurse -File -Filter *.js | ForEach-Object {
        # 用 .NET 文件 API 读写：Get-Content -Raw 在 ForEach-Object 内会报
        # "parameter cannot be found: Raw"（本环境实测），Set-Content -Encoding UTF8
        # 又会写入 BOM。WriteAllText 配合无 BOM 的 UTF8 更可控。
        $text = [System.IO.File]::ReadAllText($_.FullName)
        $new = $text.Replace('__API_WORKER_URL__', $deployConfig.apiWorkerUrl).
                     Replace('__PROXY_WORKER_URL__', $deployConfig.proxyWorkerUrl)
        if ($new -ne $text) {
            [System.IO.File]::WriteAllText($_.FullName, $new, $utf8NoBom)
            $patched++
        }
    }
    Write-Host "   ✅ Pages Functions 已同步（注入地址 $patched 个文件）" -ForegroundColor Green
}
Write-Host "📄 _redirects 配置已复制" -ForegroundColor Green
Write-Host ""

# API 地址：默认走相对路径，由 Pages Functions 转发。
# -NonInteractive 时不再询问，直接取默认值。
if ($NonInteractive) {
    $apiUrl = "/api/netease"
    Write-Host "🌐 API 地址 (VITE_API_URL): $apiUrl（-NonInteractive）" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "🌐 请输入 API 地址 (VITE_API_URL):" -ForegroundColor Yellow
    Write-Host "   留空使用默认值: /api/netease (相对路径，配合 Pages Functions)" -ForegroundColor Gray
    Write-Host ""
    $apiUrl = Read-Host "API 地址"

    if ([string]::IsNullOrWhiteSpace($apiUrl)) {
        $apiUrl = "/api/netease"
    }
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
# 关于前端源码补丁
#
# 上游适配（如关闭「音乐解锁」默认开关 useSongUnlock）已抽成 patch 文件，
# 由 scripts/deps.mjs 统一应用，此处不再做内联替换。
# 补丁状态已在脚本开头通过 `deps.mjs verify-deploy` 校验，未应用则中止部署。
# 补丁文件：patches/splayer-frontend.patch
# ------------------------------------------------------------------
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

# 部署到 Pages
# 项目名与分支取自 deploy.config.json：
#   分支留空 -> 部署到 production；填写分支名 -> 部署到该分支的 preview 别名。
# 本项目实际使用 dev 分支别名（https://dev.<project>.pages.dev），
# 若不指定分支会发到 production，导致访问地址与预期不一致。
$projectName = $deployConfig.pagesProject
$branch = $deployConfig.pagesBranch

Write-Host "🚀 部署到 Cloudflare Pages..." -ForegroundColor Yellow
Write-Host "   项目: $projectName" -ForegroundColor Gray
Write-Host "   分支: $(if ([string]::IsNullOrWhiteSpace($branch)) { 'production' } else { $branch })" -ForegroundColor Gray
Write-Host ""

Push-Location $FrontendDir
try {
    if ([string]::IsNullOrWhiteSpace($branch)) {
        & npx wrangler pages deploy out/renderer --project-name=$projectName
    } else {
        & npx wrangler pages deploy out/renderer --project-name=$projectName --branch=$branch
    }
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
$accessUrl = if ($deployConfig.pagesUrl) { $deployConfig.pagesUrl } else { "https://$projectName.pages.dev" }
Write-Host "🌐 访问地址: $accessUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 后续步骤:" -ForegroundColor Yellow
Write-Host "   1. 在 Pages 后台配置 Functions (如果需要转发 API)" -ForegroundColor Gray
Write-Host "   2. 绑定自定义域名（可选）" -ForegroundColor Gray
Write-Host ""
