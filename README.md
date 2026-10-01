# splayer-cloudflare

把 **SPlayer 前端** 与 **api-enhanced（网易云 API）** 整体部署到 Cloudflare 的方案，
由「Pages 前端 + API Worker + 音频代理 Worker」三部分组成。

## 架构

| 组件 | 位置 | 说明 |
|---|---|---|
| 前端 | `splayer-frontend/` → Cloudflare Pages | SPlayer Web 版；`functions/` 为 Pages Functions 转发层 |
| API Worker | `workers/api/` | api-enhanced 的 Workers 适配版，429 个接口 |
| 音频代理 Worker | `workers/music-proxy/` | 音频 CDN 代理，解决 CORS / Range 请求 |
| Pages 配置源 | `frontend-config/` | `functions/` 与 `_redirects` 的事实来源，由部署脚本同步 |

线上地址：

| 组件 | 正式环境 (production) | 预览环境 |
|---|---|---|
| 前端 Pages | `https://splayer-dvj.pages.dev` | `https://dev.splayer-dvj.pages.dev` |
| API Worker | `https://ncm-api.liujieahu.workers.dev` | 无（Worker 只有正式环境） |
| 音频代理 Worker | `https://music-proxy.liujieahu.workers.dev` | 无（Worker 只有正式环境） |

地址的唯一事实来源是 `deploy.config.json`，上面的值由它派生。

## 依赖管理

两个上游仓库以 **git submodule 固定版本** 引入：

| 依赖 | 上游 |
|---|---|
| `splayer-frontend` | `SPlayer-Dev/SPlayer` |
| `workers/api/ncm-source` | `NeteaseCloudMusicApiEnhanced/api-enhanced` |

我们对上游做的少量适配以 **patch 文件** 存放在 `patches/`，升级时自动重新应用。

> submodule 记录的是**固定 commit**，不会自动变新。升级必须显式执行下面的
> `deps:update`，它是一条完整的流水线，任一步失败即中止。

```
更新上游  →  重新打补丁  →  重建产物  →  跑接口单测  →  记录状态
                                            └─ 不通过则中止，不产生新的版本记录
```

### 常用命令

```bash
npm run deps:status    # 查看各依赖的版本、补丁状态、上次单测结果
npm run deps:setup     # 按固定版本检出依赖并打补丁（不拉上游）
npm run deps:apply     # 仅应用补丁（幂等）
npm run deps:update    # 升级上游 + 打补丁 + 重建 + 单测（发布闸门）
```

`deps:update` 成功后会把新的依赖版本暂存（`git add`），提交即完成「固定版本」。

### 发布闸门

部署脚本会先执行 `deps.mjs verify-deploy`，只有满足下列条件才允许发布：

- 两个依赖目录都存在，且当前 commit 与 `.deps-state.json` 中「单测通过」的记录一致
- 补丁均已应用
- 上次单测没有失败用例

任一不满足即中止，并提示先跑 `npm run deps:update`。

### 升级上游时的注意点

- **补丁可能过期**：上游若改动了补丁涉及的文件，`deps:update` 会报「冲突」并中止。
  此时需人工基于新版本重做补丁（`patches/*.patch`），而不是强行覆盖。
- **补丁应用带 `--ignore-whitespace`**：Windows 上 `core.autocrlf` 会把子模块检出为
  CRLF，而补丁上下文是 LF，不忽略空白差异会误判为冲突。
- 依赖目录里的**手改不会保留**：`deps:setup` / `deps:update` 会丢弃子模块工作区改动，
  有长期价值的改动请沉淀进 `patches/`。

### 为什么 `git status` 总显示子模块被修改

补丁是**叠加在固定版本之上**的工作区改动，所以 `git status` 会一直显示：

```
 m splayer-frontend
 m workers/api/ncm-source
```

这是预期行为，不是错误——小写 `m` 表示「子模块内容是脏的」，而 gitlink（父仓库记录的
commit）并未改动。用 `npm run deps:status` 可以准确判断补丁与版本状态。

之所以不把补丁提交进子模块：那样 gitlink 会指向上游不存在的 commit，
其他人 `git submodule update` 会直接失败。

## 开发与测试

```bash
npm run setup:worker-deps   # 安装 workers/api 自己的依赖（首次或依赖变更后）
npm run dev:api             # 本地起 API Worker（默认 8788）
npm run build:api           # 由 ncm-source 重建 src/generated-routes.js
npm run verify              # 仓库自检门禁（CI 跑的就是这条命令）
npm run verify:full         # 上面 + 重建产物并与入库版本比对（发布前跑）
npm test                    # 离线单元测试
npm run test:api            # 联网接口测试（默认打本地 8788）
npm run test:scripts        # 部署脚本自检
```

### 三层测试

| 命令 | 覆盖内容 | 需要网络 | 用途 |
|---|---|---|---|
| `npm test` | cookie 解析与优先级、eapi 请求体、状态码映射、解锁开关与主机白名单 | 否 | 每次改动都跑，几百毫秒 |
| `npm run test:scripts` | 部署脚本的语法、参数解析、发布闸门、前置检查报错 | 否 | 改部署流程时跑 |
| `npm run test:api` | 69 个接口用例（搜索/歌曲/歌单/登录/播放链路/加解密/解锁） | 是 | 发版前或排查线上问题时跑 |

前两层都被 `npm run verify` 收进门禁，所以常规改动只需要记住一条命令。
第三层依赖外网与真实登录态、结果不稳定，因此不进常规门禁，只在
`workflow_dispatch` 时于 CI 中执行。

单元测试刻意只覆盖「纯逻辑」——不 mock 网络往返，而是把 `globalThis.fetch` 换成探针，
让请求构造与响应映射真实跑一遍。这样既保留了对真实代码路径的覆盖，又不依赖外网。
它优先盯的是**已经真实坏过的地方**，例如：

- cookie 串按 `"; "` 切分会把 `MUSIC_U=xxx;os=pc;` 解析成空，登录态整体丢失
- `req.cookies` 无条件覆盖 URL 上的 cookie 参数，导致 `song/url` 返回 `code 404`
- eapi 请求缺少 `data.header`，`song/enhance/player/url` 系列直接 404
- 多个 `Set-Cookie` 用 `headers.get()` 读会被逗号拼成一串，而 `Expires` 自带逗号
- 音频代理的主机白名单被后缀绕过（`kw.kuwo.cn.evil.com`）

接口测试带登录态运行：

```bash
$env:NCM_COOKIE="MUSIC_U=xxx;os=pc;"   # PowerShell
npm run test:api http://127.0.0.1:8788
```

测试结果分四类：**通过 / 跳过（需登录）/ 受限（出口 IP 环境限制）/ 失败**。
「受限」指网易云 -462 风控、解锁音源地区限制等环境问题，不计入失败但会单独列出。

`workers/api/.dev.vars`（已 gitignore）用于本地环境变量覆盖，例如 `ENABLE_UNBLOCK=true`。

## 部署

```bash
npm run deploy:api     # 部署 API Worker（含依赖闸门）
npm run deploy:pages   # 构建并部署前端 Pages（含依赖闸门）
npm run deploy:proxy   # 部署音频代理 Worker
npm run deploy:all     # 交互式选择
```

`npm run deploy:*` 会按平台自动分派：Windows 走 `scripts/deploy-*.ps1`，
macOS / Linux / CI 走 `scripts/deploy-*.sh`。两套脚本流程完全一致，共享易错环节的实现
（见下文「脚本分层」）。

### 发布到哪里（正式 / 预览）

**前端 Pages 的目标是显式选择的，而且要显式传分支名**：

| 目标 | 命令 | 分支（`--branch`） | 线上位置 |
|---|---|---|---|
| 正式环境 (production) | `npm run deploy:pages`<br>或 `.\scripts\deploy-pages.ps1` | `pagesProdBranch`，须与 Pages 项目的 Production branch 一致 | `pagesProdUrl` |
| 预览环境 | `bash scripts/deploy-pages.sh --preview`<br>或 `.\scripts\deploy-pages.ps1 -Preview` | `pagesPreviewBranch` | `pagesPreviewUrl` |

Cloudflare 判断正式/预览的依据是**分支名是否等于项目设置的 Production branch**，
所以两侧都得传 `--branch`。这里踩过两个坑，都写进了注释与自检：

> **坑一：靠「不传 `--branch`」发正式。** 不传时 wrangler 会从当前 git 仓库自动探测
> 分支，而部署是在子模块目录 `splayer-frontend` 里执行的，子模块处于 detached HEAD，
> 探测结果是 `HEAD` —— 于是脚本打印「目标: 正式环境 (production)」，Pages 控制台里
> 却是 `Preview / Branch: HEAD`，正式域名一直没有内容。
>
> **坑二：配置里写死一个分支。** 早先只有一组 `pagesBranch: "dev"`，脚本无条件带上
> `--branch=dev`，于是每次部署都进预览环境，正式环境从未有过部署。现在拆成
> `pagesProdBranch`（**必需项**）+ `pagesPreviewBranch`，缺了直接报错而不是猜默认值。

发布时会一并显式传 `--commit-hash` / `--commit-message` / `--commit-dirty`：
wrangler 默认从**执行目录**（子模块）取 git 信息，控制台上会显示上游 SPlayer 的提交，
与 `/version.json` 里的本仓库提交号对不上。判断口径由 `scripts/lib/git-meta.mjs`
与 `finalize-dist.mjs` 共用，保证两处说法一致。

两个 Worker **没有预览环境**（Worker 不存在分支别名），因此
`--preview` / `-Preview` 会被 worker 脚本明确拒绝，而不是静默忽略 ——
免得出现「以为发的是预览，其实动了线上」。`deploy-all` 同理：只选 Worker 时给
`--preview` 会直接报错。

### 跳过交互（自动化）

PowerShell 用 `-NonInteractive`，bash 用 `--non-interactive`，效果相同：全部取
`deploy.config.json` 的配置值，不再询问任何问题。

```powershell
.\scripts\deploy-pages.ps1 -NonInteractive
```

```bash
./scripts/deploy-pages.sh --non-interactive
bash scripts/deploy-all.sh --mode=4 --non-interactive   # 非交互必须显式指定范围
NON_INTERACTIVE=1 ./scripts/deploy-pages.sh             # 也可用环境变量
```

> 注意：`npm run deploy:pages -- --non-interactive` 里的参数**不会**被转发
> （npm 10 的行为），自动化场景请改用 `NON_INTERACTIVE=1` 环境变量。

也可直接用 bash 入口（Windows 上需要 Git Bash / MSYS2 / WSL）：

```bash
npm run deploy:pages:bash
DEPLOY_SHELL=bash node scripts/deploy.mjs pages   # 在 Windows 上强制走 bash 实现
```

### 脚本分层

| 文件 | 职责 |
|---|---|
| `scripts/deploy-*.ps1` / `scripts/deploy-*.sh` | 各平台的部署流程（前置检查 → 闸门 → 构建 → 部署） |
| `scripts/lib/common.sh` | bash 侧公共库：日志、前置检查、交互、路径转换防护 |
| `scripts/prepare-pages.mjs` | **两套脚本共用**：读配置、同步 `functions/` 并注入地址、同步 `_redirects`、写 `.env` |
| `scripts/deps.mjs` | 依赖 pin + 补丁 + 单测的发布闸门 |
| `scripts/get-config.mjs` | 供 bash 读取 `deploy.config.json` 的单个键 |
| `scripts/lib/git-meta.mjs` + `scripts/git-meta.mjs` | **两套脚本与 `finalize-dist.mjs` 共用**：提交号 / 工作区是否真的脏 |
| `scripts/deploy.mjs` | `npm run deploy:*` 的平台分派入口 |
| `scripts/tests/deploy-scripts.test.sh` | 部署脚本自检（`npm run test:scripts`） |

之所以把「准备部署资源」抽成 Node 共享模块而不是两边各写一份：目录复制方式、
占位符注入这类细节最容易被写出差异（历史上就出过 `Copy-Item` 复制目录嵌套、
生成垃圾路由的问题），一份实现才谈得上行为一致。

### bash 脚本的两个硬约束

- **必须 LF 换行**：`.gitattributes` 已把 `*.sh`、`*.patch` 固定为 `text eol=lf`。
  Windows 上 `core.autocrlf=true` 会把文本文件检出成 CRLF，行尾的 `\r` 会被 bash
  当成命令的一部分，报 `$'\r': command not found`。CI 中有校验防止回退。
- **MSYS2 / Git Bash 会改写「像路径」的值**：实测 `API_URL=/api/netease` 会被改写成
  `E:/build-tool/msys2/api/netease`，前端会因此所有接口 404 且**不报错**。
  `scripts/lib/common.sh` 通过 `MSYS2_ENV_CONV_EXCL` / `MSYS2_ARG_CONV_EXCL` 排除
  这些入口，`prepare-pages.mjs` 另有取值校验兜底。

### 发布后如何确认线上版本

每次部署前端时会把版本信息写进构建产物，部署完成后访问 `/version.json` 即可看到：

```json
{
  "version": "1.0.0",
  "commit": "…",
  "commitShort": "…",
  "branch": "dev",
  "dirty": false,
  "builtAt": "2026-10-01T…Z",
  "deps": { "splayer-frontend": "…", "ncm-source": "…" },
  "tests": { "passed": 66, "failed": 0 }
}
```

`dirty: true` 表示打包时工作区有未提交改动——此时「线上对应哪个提交」并不精确，
排查问题前要先留意这一点。回滚步骤见 [CONTRIBUTING.md](./CONTRIBUTING.md#回滚)。

### 地址等环境配置

`deploy.config.json` 是**地址的唯一事实来源**（API Worker、代理 Worker、Pages 项目/分支/访问地址）。
`frontend-config/functions/` 里用 `__API_WORKER_URL__` / `__PROXY_WORKER_URL__` 占位，
部署时由部署脚本按配置注入（共用 `scripts/prepare-pages.mjs`）；
探针与测试脚本则通过 `workers/api/scripts/config.cjs` 读取。
需要换环境（例如换账号、换域名）时只改这一个文件。

### PowerShell 脚本必须以 UTF-8 BOM 保存

`scripts/*.ps1` 含中文与 emoji。Windows PowerShell 5.1 会把**无 BOM 的 UTF-8**
按系统 ANSI 代码页解码，乱码后破坏引号/括号配对，脚本会直接报
`Missing closing '}'` 之类的解析错误。CI 中已有校验防止回退。
（PowerShell 7 默认按 UTF-8 读取，不受此影响。）

## 已知限制

| 限制 | 说明 |
|---|---|
| 解锁（解灰）功能 | **默认关闭**。三大音源均按出口 IP 限制，Cloudflare 出口无法真正生效；境内出口可用。开启方式见 `workers/api/ADAPTATION_TODO.md` |
| 网易云 -462 风控 | Cloudflare 出口 IP 可能触发人机验证，属环境问题 |
| 文件上传类接口 | Workers 无临时文件系统，`ENABLE_FILE_UPLOAD=false` |
| `xeapi` / `neapi` 加密 | 依赖 Node 版 X25519 ECDH，未实现，请求降级为 eapi |

## 文档索引

| 文档 | 内容 |
|---|---|
| 本文件 | 架构、依赖管理、测试分层、部署与配置 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 环境准备、上游补丁工作流、提交约定、发布与回滚、常见坑 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更记录 |
| [DEPLOY.md](./DEPLOY.md) | 从零开始的部署步骤 |
| `workers/api/ADAPTATION_TODO.md` | 接口适配现状与排查手段（更细的工程记录） |
| `workers/api/scripts/probes/README.md` | 一次性排查脚本索引（打真实网络，不进 CI） |

## 许可

本项目是 [SPlayer](https://github.com/SPlayer-Dev/SPlayer)（**AGPL-3.0**）的
Web / Cloudflare 移植工程，包含针对上游的补丁与部署适配代码，
因此以 **AGPL-3.0-or-later** 发布，全文见 [LICENSE](./LICENSE)。

后端依赖的 [api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)
为 **MIT**，以 submodule 形式引入，其许可证见 `workers/api/ncm-source/LICENSE`。

按 AGPL-3.0 的要求，通过网络使用本服务的人有权获得对应源码——本仓库的部署方式
（源码与构建脚本都在同一个仓库、产物可复现）正是为了满足这一点。
