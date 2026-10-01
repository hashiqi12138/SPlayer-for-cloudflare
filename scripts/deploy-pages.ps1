# ============================================================
#  SPlayer 前端 Pages 部署脚本
#
#  用法:
#    .\deploy-pages.ps1                  交互式（会询问 API 地址），发正式环境
#    .\deploy-pages.ps1 -Preview         发到预览分支别名（pagesPreviewBranch）
#    .\deploy-pages.ps1 -NonInteractive  全部取配置默认值，便于自动化
# ============================================================

param(
    [switch]$NonInteractive,
    [switch]$Preview
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$FrontendDir = Join-Path $ProjectRoot "splayer-frontend"

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
# 部署必须使用 package-lock.json 锁定的 wrangler。若允许 npx 自行下载，
# 同一个提交在不同时间、不同机器上可能用不同版本的 wrangler 部署，
# 「固定版本可复现」就只覆盖了源码、没覆盖工具链。
if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Write-Host "❌ 根目录依赖未安装，无法保证 wrangler 版本与锁文件一致" -ForegroundColor Red
    Write-Host "   请先执行: npm ci" -ForegroundColor Yellow
    exit 1
}

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

# pagesProdBranch 提前到这里校验：放到最后一段的话，要等前端整轮构建跑完
# （几分钟）才发现「分支名没配」，纯属浪费时间。
if (-not $Preview -and [string]::IsNullOrWhiteSpace($deployConfig.pagesProdBranch)) {
    Write-Host "❌ deploy.config.json 缺少 pagesProdBranch" -ForegroundColor Red
    Write-Host "   该值要与 Cloudflare Pages 项目设置里的 Production branch 完全一致" -ForegroundColor Yellow
    exit 1
}
if ($Preview -and [string]::IsNullOrWhiteSpace($deployConfig.pagesPreviewBranch)) {
    Write-Host "❌ deploy.config.json 缺少 pagesPreviewBranch" -ForegroundColor Red
    Write-Host "   预览发布需要一个分支别名（例如 dev）" -ForegroundColor Yellow
    exit 1
}

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

# ------------------------------------------------------------------
# 准备部署资源：_redirects、Pages Functions（注入真实地址）、.env
#
# 这段逻辑与 bash 版共用同一个 Node 实现（scripts/prepare-pages.mjs）。
# 之所以不在这里重写一遍：目录复制方式、占位符注入这类细节两边各写一份
# 极易逐渐跑偏（历史上就出过 Copy-Item 复制目录嵌套、生成垃圾路由的问题）。
#
# 走环境变量而不是命令行参数传 API 地址：bash 侧 MSYS2/Git Bash 会对形似
# 路径的参数做路径转换，/api/netease 可能被改写成 C:\...\api\netease；
# 统一用环境变量，两侧行为一致。
# ------------------------------------------------------------------
Write-Host "⚙️  准备部署资源..." -ForegroundColor Yellow
$env:API_URL = $apiUrl
& node (Join-Path $ScriptDir "prepare-pages.mjs")
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 部署资源准备失败" -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------------
# 关于前端源码补丁
#
# 上游适配（如关闭「音乐解锁」默认开关 useSongUnlock）已抽成 patch 文件，
# 由 scripts/deps.mjs 统一应用，此处不再做内联替换。
# 补丁状态已在脚本开头通过 `deps.mjs verify-deploy` 校验，未应用则中止部署。
# 补丁文件：patches/splayer-frontend.patch
# ------------------------------------------------------------------
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

# ------------------------------------------------------------------
# 产物收尾
#
# 把 frontend-config\_redirects、_headers 放进 out\renderer，并写入 version.json。
# 必须在上传之前做：只有出现在产物里的东西才会真的生效
# （_redirects 曾经被复制到前端项目根目录，而上传的只有 out\renderer，等于没配）。
# ------------------------------------------------------------------
Write-Host "🏷️  产物收尾（Pages 配置 + 版本戳）..." -ForegroundColor Yellow
& node (Join-Path $ScriptDir "finalize-dist.mjs")
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 产物收尾失败" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 部署到 Pages
#
# 目标环境是**显式选择**，不是隐含默认：
#   默认（不带 -Preview）-> 正式环境，分支名为 pagesProdBranch（须与 Pages 项目设置里的
#                          Production branch 一致），落到项目主域名（pagesProdUrl）
#   -Preview            -> 预览环境，分支名为 pagesPreviewBranch
#
# 两侧都必须显式传 --branch —— 不能靠「不传」来发正式：wrangler 不传时会从当前
# git 仓库自动探测分支，而这里是在子模块目录里部署，探测结果是 `HEAD`，
# 于是本该发正式的部署会变成一个叫 HEAD 的预览部署（踩过：脚本打印「正式环境」，
# Pages 控制台里却是 Preview）。
#
# 以前配置里写死了 pagesBranch=dev，于是每次部署都发预览、正式环境一直是空的。
$projectName = $deployConfig.pagesProject

if ($Preview) {
    $branch = $deployConfig.pagesPreviewBranch
    if ([string]::IsNullOrWhiteSpace($branch)) {
        Write-Host "❌ 未配置 pagesPreviewBranch：预览发布需要指定分支别名（例如 dev）" -ForegroundColor Red
        exit 1
    }
    $targetDesc = "预览环境（分支别名 $branch）"
    $accessUrl = if ($deployConfig.pagesPreviewUrl) { $deployConfig.pagesPreviewUrl } else { "https://$branch.$projectName.pages.dev" }
} else {
    $branch = $deployConfig.pagesProdBranch
    if ([string]::IsNullOrWhiteSpace($branch)) {
        Write-Host "❌ 未配置 pagesProdBranch：正式发布必须显式指定分支名" -ForegroundColor Red
        Write-Host "   该值要与 Cloudflare Pages 项目设置里的 Production branch 完全一致" -ForegroundColor Yellow
        exit 1
    }
    $targetDesc = "正式环境 (production，分支 $branch)"
    $accessUrl = if ($deployConfig.pagesProdUrl) { $deployConfig.pagesProdUrl } else { "https://$projectName.pages.dev" }
}

# 提交信息也要显式传：wrangler 默认从**执行目录**（子模块 splayer-frontend）取 git
# 信息，Pages 控制台上显示的会是上游 SPlayer 的提交，与 /version.json 里的本仓库
# 提交号对不上，核对线上版本时会白跑一趟。
# --commit-message 同样要传：wrangler 拿到 --commit-hash 后会用子模块的 git 库去
# 反查标题，而本仓库的提交在子模块里不存在，于是每次多打印一行
# `fatal: bad object <sha>`（部署不受影响，但看着像出错了）。
# 判断口径走 scripts/git-meta.mjs，与 finalize-dist.mjs 写进 version.json 的完全一致。
$commitHash = (& node (Join-Path $ScriptDir "git-meta.mjs") hash 2>$null | Out-String).Trim()
$commitSubject = (& node (Join-Path $ScriptDir "git-meta.mjs") subject 2>$null | Out-String).Trim()
$commitDirty = (& node (Join-Path $ScriptDir "git-meta.mjs") dirty 2>$null | Out-String).Trim()

Write-Host "🚀 部署到 Cloudflare Pages..." -ForegroundColor Yellow
Write-Host "   项目: $projectName" -ForegroundColor Gray
Write-Host "   目标: $targetDesc" -ForegroundColor Gray
if ([string]::IsNullOrWhiteSpace($commitHash)) {
    Write-Host "   ⚠️  取不到 git 提交号，Pages 控制台上的提交信息会不准确" -ForegroundColor Yellow
} else {
    Write-Host "   提交: $($commitHash.Substring(0, [Math]::Min(7, $commitHash.Length)))" -ForegroundColor Gray
}
Write-Host ""

$deployArgs = @(
    "pages", "deploy", "out/renderer",
    "--project-name=$projectName",
    "--branch=$branch"
)
if (-not [string]::IsNullOrWhiteSpace($commitHash)) {
    $deployArgs += "--commit-hash=$commitHash"
}
if (-not [string]::IsNullOrWhiteSpace($commitSubject)) {
    $deployArgs += "--commit-message=$commitSubject"
}
if (-not [string]::IsNullOrWhiteSpace($commitDirty)) {
    $deployArgs += "--commit-dirty=$commitDirty"
}

Push-Location $FrontendDir
try {
    & npx --no-install wrangler @deployArgs
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
Write-Host "🌐 访问地址: $accessUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 后续步骤:" -ForegroundColor Yellow
Write-Host "   1. 在 Pages 后台配置 Functions (如果需要转发 API)" -ForegroundColor Gray
Write-Host "   2. 绑定自定义域名（可选）" -ForegroundColor Gray
Write-Host ""
