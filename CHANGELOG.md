# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
版本号同时写在 `package.json` 与 git tag 上，构建产物里的 `/version.json` 会带上它。

发布流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## [1.0.4] - 2026-10-01

### 修复

- **「发正式」实际发进了预览环境**：Cloudflare Pages 判断正式/预览的依据是
  「分支名是否等于项目设置的 Production branch」，而不是「有没有传 `--branch`」。
  原先正式路径靠**不传** `--branch` 实现，但 wrangler 在不传时会从当前 git 仓库
  自动探测分支 —— 部署是在子模块目录 `splayer-frontend` 里执行的，子模块处于
  detached HEAD，探测结果是 `HEAD`。于是脚本打印「目标: 正式环境 (production)」，
  Pages 控制台里却是 `Preview / Branch: HEAD`，正式域名一直没有内容。
  现在两侧都显式解析并传 `--branch`：正式取 `pagesProdBranch`，预览取
  `pagesPreviewBranch`；`pagesProdBranch` 是**必需配置项**，缺了直接报错，
  不给「看起来合理」的默认值（猜错时同样会静静落到预览环境，一样看不出来）。
  分支名在构建之前就校验，避免等几分钟构建跑完才发现配置没填。
- **Pages 控制台上的提交信息指的是上游 SPlayer 的提交**：wrangler 默认从
  **执行目录**（子模块 `splayer-frontend`）取 git 信息，与 `/version.json` 里的
  本仓库提交号对不上，核对线上版本时会白跑一趟。现在显式传
  `--commit-hash` / `--commit-message` / `--commit-dirty`，控制台与产物说法一致。
  同时消掉每次多打印的一行 `fatal: bad object <sha>` —— 那是 wrangler 拿本仓库的
  提交号去子模块的 git 库里反查标题所致（部署本身不受影响，但看着像出错了）。
- **`/version.json` 的 `dirty` 字段实际上永远是 `true`**，这让它失去意义，
  而它正是「线上跑的是哪个提交」的核对依据。它原先用 `git status --porcelain`
  是否为空来判断，而这个判断被两类长期噪音占据：一是**子模块**
  （补丁本来就写在子模块工作区里，`deps:setup` / `deps:update` 之后必然是脏的，
  而这两步是发布前的必经流程）；二是**换行符**（`core.autocrlf=true` 的机器上
  产物以 CRLF 落盘，git 比较时归一化回 LF，于是 `git diff` 为空、`git status`
  却报「已修改」）。改用 `git diff HEAD --ignore-submodules=all`（比内容）
  加未跟踪文件来判断。
- **`generated-routes.js` 在 Windows 上被构建成 CRLF**：产物由上游模块源码拼出，
  上游文件在 `autocrlf=true` 下是 CRLF，于是同一份源码在 Windows 与 Linux 上
  构建出两种字节序列 —— 而 `git diff` 会把换行归一化，这个不可复现**恰好被它掩盖**。
  现在构建时统一归一化成 LF，并新增自检项（生成物必须 LF）。
- `verify --with-build` 的可复现校验由 `git diff` 改为**与入库 blob 逐字节比较**
  （`git show HEAD:<path>`）：换行符差异也逃不掉，否则「Windows 产出 CRLF、
  入库是 LF」会一直被判为通过。

### 变更

- **配置拆分**：`pagesBranch` / `pagesUrl` → `pagesProdBranch`（必需）、
  `pagesProdUrl`、`pagesPreviewBranch`、`pagesPreviewUrl`，正式与预览的分支和地址
  各自独立，不再共用一个「碰巧写了什么就发到哪」的值。`verify` 的取值校验同步更新，
  并新增一条「正式与预览的分支名不能相同」——相同则「发正式」等于又发了一次预览。
- **worker 脚本明确拒绝 `--preview`**（bash 与 PowerShell 两侧）：Worker 不存在
  分支别名、只有一个正式环境。静默忽略会让使用者以为「我发的是预览」，
  实际却改了线上 worker；直接报错把误解挡在部署之前。
- `deploy-all` 同理：只选 Worker（`--mode=1|2` / 菜单 1、2）时给 `--preview` 直接报错；
  选前端时把目标透传给 Pages 脚本，不再让 `--preview` 被下游默默吞掉。
- `scripts/deploy.mjs` 补上参数映射：`--preview` → `-Preview`，
  `--prod` 在 PowerShell 侧等价于「不带 `-Preview`」。

### 新增

- **`scripts/lib/git-meta.mjs` + `scripts/git-meta.mjs`**：提交号与「工作区是否真的脏」
  的统一判断口径，由 `/version.json` 的写入方（`finalize-dist.mjs`）与部署时传给
  wrangler 的 `--commit-*` 共用。两边各写一份的话，只要口径不同，
  Pages 控制台与 `/version.json` 就会互相矛盾 —— 而这两处正是核对线上版本的依据。
- 部署脚本自检增加「部署目标」与「发布分支」两节：`--help` 是否列出 `--preview`、
  默认目标是正式、`--preview` 能切到预览、`--prod` 能切回正式、两个 worker 脚本拒绝
  `--preview`、`--preview` 配前端时不被误拦，以及正式/预览解析出的分支名不同。
- **`verify` 增加 PowerShell 语法检查**：`.ps1` 是 Windows 上真正被执行的那一半，
  此前却没有任何语法门禁（bash 侧一直有 `bash -n`），改坏了要等真的部署那一刻才暴露。
  用 PowerShell 自带解析器做纯语法分析，不执行脚本；环境里没有 PowerShell 时跳过。
- 文档补齐「正式 / 预览」两条路径：地址对照表、命令、以及**回滚是分环境的**
  （Pages 的 Rollback 按部署生效，正式与预览互不影响）。

### 首次正式发布

`https://splayer-dvj.pages.dev` 此前从未有过部署（此前全部落进预览环境）。
1.0.4 完成第一次正式发布并通过线上核对：

| 检查 | 结果 |
|---|---|
| `/version.json` | `1.0.4 @ d62a946`，`dirty: false` |
| Pages 控制台 | Environment `production`，Branch `main`，提交号与本仓库一致 |
| `/api/netease/search`（经 Pages Functions 转发到 API Worker） | HTTP 200，业务码 200 |

## [1.0.3] - 2026-10-01

> **原因更正（1.0.1）**：1.0.1 里把 Linux 任务的失败归因为「Ubuntu runner 的
> `/usr/bin/node` 存在，导致『缺少 node』的场景复现不出来」。那是基于推断写的，
> 拿到 runner 日志后确认并不成立 —— 真正原因是**自检脚本缺少可执行位**
> （见下），而且它从 CI 第一次运行起就存在。1.0.1 里对最小 PATH 的改造仍有价值
> （让场景与平台无关），但当时的归因是错的，特此更正。

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

- **部署脚本自检在 Linux 上必然失败**：见 1.0.3 的原因更正。
  当时这条「缺少 node 时应给出可操作提示」的用例用 `PATH="$空目录:/usr/bin"` 去屏蔽
  node，这个写法依赖「`/usr/bin` 里恰好没有 node」，在不同发行版上并不成立。
  改为构造一个只含基础工具、明确不含 `node`/`npx` 的最小 PATH，
  且构造后自检确实可用，不可用则跳过而不是误报失败。
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
