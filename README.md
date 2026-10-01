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

线上地址：前端 `https://dev.splayer-dvj.pages.dev`，API `https://ncm-api.liujieahu.workers.dev`

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
npm run dev:api        # 本地起 API Worker（默认 8788）
npm run build:api      # 由 ncm-source 重建 src/generated-routes.js
npm run test:api       # 接口测试（默认打本地 8788）
```

接口测试共 69 个用例，覆盖搜索/歌曲/歌单/登录/播放链路/加解密/解锁等。
带登录态运行：

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

## 已知限制

| 限制 | 说明 |
|---|---|
| 解锁（解灰）功能 | **默认关闭**。三大音源均按出口 IP 限制，Cloudflare 出口无法真正生效；境内出口可用。开启方式见 `workers/api/ADAPTATION_TODO.md` |
| 网易云 -462 风控 | Cloudflare 出口 IP 可能触发人机验证，属环境问题 |
| 文件上传类接口 | Workers 无临时文件系统，`ENABLE_FILE_UPLOAD=false` |
| `xeapi` / `neapi` 加密 | 依赖 Node 版 X25519 ECDH，未实现，请求降级为 eapi |

更细的适配现状与排查手段见 `workers/api/ADAPTATION_TODO.md`，部署细节见 `DEPLOY.md`。
