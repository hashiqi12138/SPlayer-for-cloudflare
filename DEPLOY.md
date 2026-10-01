# SPlayer + api-enhanced 全 Cloudflare 部署方案

## 架构总览

```
┌────────────────────── Cloudflare ──────────────────────┐
│                                                         │
│  ┌──────────────────── Pages ──────────────────────┐    │
│  │                                                  │    │
│  │   SPlayer 静态前端 (out/renderer)                │    │
│  │   域名: music.yourdomain.com                     │    │
│  │                                                  │    │
│  │   Routes:                                        │    │
│  │   ├── /*                    → 静态文件 (SPA)     │    │
│  │   ├── /api/netease/*       → API Worker          │    │
│  │   └── /music/unblock/*     → Music Proxy Worker  │    │
│  │                                                  │    │
│  └──────────────────────────────────────────────────┘    │
│                          │                              │
│                          ▼                              │
│  ┌──────────────────── Workers ─────────────────────┐   │
│  │                                                   │   │
│  │  🎵 ncm-api-worker       (api-enhanced 适配)      │   │
│  │  🎶 music-proxy-worker   (网易云音乐 CDN 代理)    │   │
│  │                                                   │   │
│  └───────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 当前部署状态

已完成并验证：

| 组件 | 地址 | 状态 |
|------|------|------|
| API Worker | `https://ncm-api.liujieahu.workers.dev` | ✅ 运行中 |
| 前端 Pages | `splayer` 项目 | ✅ 运行中 |

API Worker 已实现 eapi / weapi / api / linuxapi 加密，413 个接口中 385 个自动转译上线，其余 28 个依赖 `qrcode`、`unblockmusic-utils`、文件上传等 Workers 不兼容模块，已单独处理或降级。

## 接口测试

批量测试脚本会逐个请求接口并校验业务码，输出 JSON / Markdown 报告到 `workers/api/test-results/`：

```powershell
cd workers/api
node scripts/test-api.cjs
# 或指定地址
node scripts/test-api.cjs https://your-worker.workers.dev
```

带登录态测试（可选，用于「需登录」类接口）：

```powershell
$env:NCM_COOKIE = "MUSIC_U=xxxxx; __csrf=xxxxx"
node scripts/test-api.cjs
```

当前结果：**48 通过 / 1 跳过 / 0 失败**（共 49 个用例）。

> 跳过项为 `/recommend/resource`（每日推荐歌单），该接口无 cookie 时网易云返回业务码 `301 需要登录`，属于接口本身行为，非部署问题。

## 前置准备

### 1. Cloudflare 账号
- 注册地址: https://dash.cloudflare.com/sign-up
- 免费版即可满足个人使用需求

### 2. 域名（可选，也可用 pages.dev 子域名）
- 免费域名注册: https://www.dnshe.com/ (ccwu.cc / us.ci)
- 或者使用 Cloudflare 分配的 `*.pages.dev` 域名

### 3. 本地工具
- Node.js >= 20
- Git
- wrangler CLI (Cloudflare 官方 CLI，脚本会自动安装)

## 部署步骤

### 第一步：登录 Cloudflare

```powershell
# 方式一：使用 wrangler 登录（推荐）
npx wrangler login

# 方式二：使用 API Token
# 在 Cloudflare 后台生成 Token，然后设置环境变量
# $env:CLOUDFLARE_API_TOKEN = "your-token"
```

### 第二步：部署音乐代理 Worker（最简单，先验证）

```powershell
cd workers/music-proxy
npx wrangler deploy
```

部署成功后会得到一个 `*.workers.dev` 地址，记下来。

### 第三步：部署 API Worker（核心，需要验证）

> ⚠️ 这是最复杂的部分，可能需要根据实际错误进行调整

```powershell
cd workers/api
# 安装依赖
npm install
# 先本地测试
npx wrangler dev
# 确认能正常工作后再部署
npx wrangler deploy
```

部署成功后会得到一个 `*.workers.dev` 地址，记下来。

### 第四步：部署 SPlayer 前端到 Pages

#### 4.1 克隆 SPlayer 项目

```powershell
cd ../..
git clone https://github.com/SPlayer-Dev/SPlayer.git splayer-frontend
cd splayer-frontend
```

#### 4.2 配置环境变量

复制 `.env.example` 为 `.env`，修改：

```env
VITE_API_URL=/api/netease
```

#### 4.3 复制 Pages 配置文件

```powershell
# 复制 _redirects 到项目根目录
copy ..\frontend-config\_redirects .\_redirects
```

#### 4.4 构建并部署

```powershell
# 安装依赖
$env:SKIP_NATIVE_BUILD = "true"
pnpm install

# 构建
pnpm build

# 部署到 Cloudflare Pages
npx wrangler pages deploy out/renderer --project-name=splayer
```

### 第五步：配置 Pages 路由（将 API 请求转发到 Worker）

部署完 Pages 后，需要配置 Pages Functions 或者 Workers Routes 来实现路径转发：

#### 方案 A：使用 Pages Functions（推荐，统一管理）

在 Pages 项目中创建 `functions/api/netease/[[path]].js`：

```javascript
export async function onRequest(context) {
  const url = new URL(context.request.url)
  const path = url.pathname.replace(/^\/api\/netease/, '')
  const targetUrl = `https://your-api-worker.workers.dev${path}${url.search}`
  
  return fetch(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  })
}
```

#### 方案 B：使用 Workers Routes（在自定义域名下）

如果你有自己的域名，可以在 Cloudflare DNS 中配置：
- `music.yourdomain.com` → Pages 项目
- 添加 Worker Route: `music.yourdomain.com/api/netease/*` → API Worker
- 添加 Worker Route: `music.yourdomain.com/music/unblock/*` → Music Proxy Worker

### 第六步：绑定自定义域名（可选）

1. 在 Cloudflare Pages 后台 → Custom domains → 添加自定义域名
2. 按照提示配置 DNS 记录
3. 等待 SSL 证书生效

## 项目目录结构

```
splayer-cloudflare/
├── DEPLOY.md                    # 本文档
├── package.json                 # 根项目配置
├── scripts/
│   ├── deploy-all.ps1           # 一键部署脚本
│   ├── deploy-pages.ps1         # 前端 Pages 部署脚本
│   ├── deploy-api-worker.ps1    # API Worker 部署脚本
│   └── deploy-proxy-worker.ps1  # 音乐代理部署脚本
├── frontend-config/
│   └── _redirects               # SPA 路由重定向配置
├── workers/
│   ├── api/                     # api-enhanced Worker 适配
│   │   ├── src/
│   │   │   └── index.js         # Worker 入口
│   │   ├── wrangler.toml        # wrangler 配置
│   │   └── package.json
│   └── music-proxy/             # 网易云音乐 CDN 代理
│       ├── src/
│       │   └── index.js         # Worker 入口
│       └── wrangler.toml
└── splayer-frontend/            # SPlayer 前端代码（clone 后）
    ├── out/renderer/            # 构建产物
    └── _redirects               # SPA 路由配置
```

## Cloudflare 免费额度说明

| 资源 | 免费额度 | 付费版（$5/月起） |
|------|---------|------------------|
| Workers 请求 | 10万/天 | 1000万/月 + $0.50/百万 |
| Workers CPU 时间 | 10ms/请求 | 30s/请求 |
| Workers 内存 | 128MB | 128MB（标准）/ 256MB+ |
| Pages 构建 | 500次/月 | 不限 |
| Pages 带宽 | 不限 | 不限 |
| Pages Functions | 10万/天 | 同 Workers |
| KV 存储 | 1GB | 1GB + $0.50/GB/月 |

> ⚠️ **重要提示**：免费版 Workers 只有 10ms CPU 时间，网易云 API 的加密计算可能会超时。如果遇到 CPU 超时错误，需要升级到 Paid 版（$5/月），或者使用 Vercel 替代 API 部分。

## 常见问题

### Q: API Worker 部署后报错怎么办？

A: 先看错误类型：
- **CPU 超时**: 升级到付费版，或者减少加密计算
- **模块找不到**: 某些依赖不兼容 Workers，需要替换或 polyfill
- **fs 相关错误**: 动态加载模块可能有问题，需要改为静态导入

### Q: 歌曲解灰功能能用吗？

A: api-enhanced 内置的解灰功能（ENABLE_GENERAL_UNBLOCK）理论上可以工作，但需要额外的网络请求。外部解灰服务（unblockneteasemusic）无法在 Workers 中运行。

### Q: 云盘上传能用吗？

A: 可能受限。Workers 免费版请求体限制 100MB，且 express-fileupload 的临时文件机制可能不兼容。

### Q: 为什么不用 Pages Functions 直接运行 API？

A: Pages Functions 底层就是 Workers，技术上是一样的。分开部署的好处是：
- API 和前端可以独立部署、独立扩容
- Worker 可以单独配置 CPU 时间、内存等
- 更灵活的路由和自定义域名配置

## 备选方案

如果 API Worker 方案遇到无法解决的问题，可以考虑：

### 备选 1：混合方案（推荐，最稳妥）
- 前端: Cloudflare Pages
- API: Vercel（api-enhanced 原生支持，零修改）
- 音乐代理: Cloudflare Workers

### 备选 2：全 Vercel
- 前端: Vercel
- API: Vercel
- 缺点: Vercel 免费版有请求限制，且国内访问速度不如 Cloudflare

## 相关链接

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [SPlayer 仓库](https://github.com/SPlayer-Dev/SPlayer)
- [api-enhanced 仓库](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)
