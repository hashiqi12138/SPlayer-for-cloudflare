# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
版本号同时写在 `package.json` 与 git tag 上，构建产物里的 `/version.json` 会带上它。

发布流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## [1.0.3] - 2026-10-01

### 修复

- **Linux 上自检因缺少可执行位而失败**：`verify` 用 `bash -lc <脚本路径>` 调用自检，
  而 `bash -c` 会把路径当**命令**执行、要求文件有可执行位；git 里这些 `.sh` 记录的是
  `100644`，于是 runner 上直接 `Permission denied`。Windows 不校验可执行位
  （MSYS2 下看着像 755），所以本地一直绿、CI 一直红。
- 两处一起修：`verify` 改为 `bash -lc 'bash <路径>'` 显式解释执行（不再依赖文件模式），
  同时把全部 `.sh` 在 git 中标记为 `100755`。
- 新增自检项「`.sh` 在 git 中记录为可执行」，防止这类只在 CI 暴露的问题再次出现。

### 变更

- 部署脚本自检去掉 `set -u`，并补上 `EXIT` trap：中途异常退出时打印一条 `[FAIL]`。
- `verify` 在自检失败时输出日志末尾 20 行。此前只收集含 `[FAIL]` 的行，
  而「中途退出」的情况一条都不会打印，导致失败完全没有线索。

## [1.0.2] - 2026-10-01

### 修复

- **`/personal_fm` 等三个接口 404**：上游 `server.js` 里有一张 `specificRoute` 例外表，
  其中 `daily_signin`、`fm_trash`、`personal_fm` 三条是「下划线原样保留」的路径。
  转译器忽略了这张表，一律把下划线换成斜杠，于是这三个接口被注册到了
  `/daily/signin`、`/fm/trash`、`/personal/fm`，真实路径直接 404
  （用户上报：私人漫游返回 `{code:404,"msg":"Not Found"}`）。
- 顺带修正 `__moduleRef` 的路由推导：模块间互调必须与路由注册使用同一套路径规则，
  否则 `require('./xxx.js')` 会被改写成指向一个不存在的路由名，运行时取到 `undefined`。

### 新增

- **路由规则一致性回归测试**（`test/generated-routes.test.mjs`）：不写死预期路径，
  而是从上游 `server.js` 里解析出 `specificRoute` 例外表，再与生成结果逐条比对。
  上游以后往表里加条目、或我们的映射逻辑写错，都会在测试里直接失败，
  而不是等用户报 404。这类「转译规则与上游不一致」的问题只有靠这种比对才守得住。

## [1.0.1] - 2026-10-01

修掉首次在 GitHub Actions 上暴露的问题（Windows 任务通过、Linux 任务失败）。

### 修复

- **部署脚本自检在 Linux 上必然失败**：那条「缺少 node 时应给出可操作提示」的用例用
  `PATH="$空目录:/usr/bin"` 去屏蔽 node，但 GitHub 的 Ubuntu runner 通过 NodeSource
  装了系统级 Node，`/usr/bin/node` 是存在的，场景根本复现不出来（Windows 的 MSYS2
  `/usr/bin` 恰好没有 node，所以本地是绿的）。改为构造一个只含基础工具、明确不含
  `node`/`npx` 的最小 PATH，且构造后自检确实可用，不可用则跳过而不是误报失败。
- 构造最小 PATH 时不能用 `ln -s`：MSYS2 下它是复制，复制出的二进制找不到
  `msys-2.0.dll`，执行静默失败连 `dirname` 都返回空串；改用绝对路径 shebang 的转发脚本。
- 假 `node` 的 shebang 由 `#!/usr/bin/env bash` 改为绝对路径，否则它在最小 PATH 下无法启动。

### 新增

- **CI 失败可定位**：`verify` 会把检查结果与失败详情写进 job summary。
  以前排查 CI 失败要翻几千行且需要认证才能获取的日志；现在在 Checks 页面
  （乃至公开的 check-runs API）就能直接看到是哪几项、具体错在哪。

## [1.0.0] - 2026-10-01

首个正式版本：把 SPlayer 前端与 api-enhanced 后端完整部署在 Cloudflare 上
（Pages + API Worker + 音频代理 Worker），并补齐发布链路与工程化基础设施。

### 功能

- **接口适配**：api-enhanced 适配为 Workers 版本，覆盖 429 个接口；
  补 `axios` / `crypto` / `config` / `logger` / `pkg` / `util` 等 shim，
  支持模块间 `require`（`__moduleRef`）
- **会话链路**：修正 cookie 解析（兼容分号后无空格、末尾带分号的形态）、
  查询参数 cookie 优先级、eapi 请求的 `data.header`，
  修复会员歌曲 `song/url/v1` 返回 `code 404` 无法播放的问题
- **解锁（解灰）**：实现 `/api/unblock/*`（网易云 / 酷我 / 波点）、
  音频同源代理（解决前端 `crossOrigin="anonymous"` 的 CORS 阻塞）、
  占位片段拦截（酷我对非中国大陆出口返回固定 15.6KB 占位音频）
- **解锁默认关闭**：经双向实验确认三大音源均按真实出口 IP 限制、伪造请求头无效，
  Cloudflare 出口无法生效，因此前后端默认关闭；境内出口改环境变量即可恢复

### 工程化

- **依赖固定版本**：两个上游仓库改为 git submodule 固定 commit，
  本地适配以 `patches/*.patch` 叠加；`npm run deps:update` 一条流水线完成
  「拉上游 → 重打补丁 → 重建产物 → 跑单测」，任一步失败即中止
- **发布闸门**：`deps.mjs verify-deploy` 在依赖未验证时阻止部署
- **自检门禁**：`npm run verify` 收拢 12 项检查（BOM / 换行符 / 语法 / 配置完整性 /
  占位符一致性 / 凭据未入库 / 锁文件一致 / 格式 / 单元测试 / 部署脚本自检 /
  生成物可复现），CI 与本地跑的是同一条命令
- **离线单元测试**：66 个断言，0.4 秒，专门盯已经真实坏过的逻辑
  （cookie 解析与优先级、eapi 请求体、状态码映射、代理主机白名单）
- **工具链可复现**：提交 `package-lock.json`；部署只使用锁文件装出的 wrangler
- **跨平台部署**：PowerShell 与 bash 两套实现流程一致，共用 `prepare-pages.mjs` /
  `finalize-dist.mjs`；`npm run deploy:*` 按平台自动分派
- **发布可观测**：构建产物写入 `version.json`（版本 / 提交 / 依赖 pin / 构建时间 /
  工作区是否干净），部署后访问 `/version.json` 即可核对线上版本
- **CI**：Linux 与 Windows 双平台；并发取消、超时、npm 缓存、dependabot
- **文档**：README（架构 / 依赖 / 测试 / 部署）、DEPLOY.md（含回滚步骤）、
  CONTRIBUTING.md（协作与发布流程）、AGPL-3.0 LICENSE
- **排查脚本归类**：一次性排查脚本移入 `workers/api/scripts/probes/` 并加索引，
  与构建/测试链路脚本区分开

### 修复

- `_redirects` 此前被复制到前端项目根目录，而上传的只有 `out/renderer`，
  等于从未生效（线上能用只是平台恰好会回退到 `index.html`）；
  现改由 `finalize-dist.mjs` 放入产物，并新增 `_headers`
- PowerShell 脚本缺 UTF-8 BOM，在 Windows PowerShell 5.1 下直接无法解析
- `Copy-Item` 复制目录导致 `functions/functions/...` 嵌套，线上多出垃圾路由
- 全仓库文本统一 LF，消除 `core.autocrlf` 造成的「假改动」
- 24 个生成的测试报告从版本控制中移除（`.gitignore` 已忽略但仍被跟踪）
- 删除已被 `build-modules.cjs` 取代的 `generate-routes.cjs`：
  它会覆盖 `generated-routes.js`，误跑一次就会破坏「生成物可复现」校验
- `deps.mjs` 在接口单测结束后按端口清理残留的 `wrangler dev` / `workerd`，
  避免它占住 `workers/api/node_modules` 导致后续 `npm ci` 报 EBUSY

> 仓库当前未配置远程地址，因此版本比较链接暂不提供；
> 打上第一个 tag 后，可在 CI 或本地用 `git log <旧 tag>..<新 tag>` 生成对比。
