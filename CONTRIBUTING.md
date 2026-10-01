# 贡献指南

这份文档假设你第一次接触本仓库。目标是让你能在十分钟内跑起来，
并且知道「想改上游的代码」和「想发布」分别该怎么做。

## 环境准备

```bash
# Node 版本以 .nvmrc 为准（22）
nvm use

npm ci                      # 根目录工具链（wrangler / prettier，版本由锁文件固定）
npm run setup:worker-deps   # workers/api 自己的依赖（两套依赖互相独立）
npm run deps:setup          # 按固定版本检出上游 submodule 并应用补丁
npm run verify              # 确认环境正常，12 项检查应全绿

# 可选：提交前自动跑自检（可随时用 git config --unset core.hooksPath 关闭）
npm run hooks:install
```

`npm run deps:status` 可以随时查看依赖版本、补丁状态、上次单测结果。

## 日常改动

```bash
npm run verify     # 改完先过门禁：CI 跑的就是这条命令
git commit
```

`verify` 里包含格式检查。忘了排版不用手改，直接：

```bash
npm run format
```

## 改上游代码的正确姿势

`workers/api/ncm-source` 与 `splayer-frontend` 都是 **git submodule**，父仓库记录固定
commit。**不要在子模块里只手改代码**——`deps:setup` / `deps:update` 会丢弃子模块工作区的
改动，你的修改会静默消失。

正确流程：

```bash
# 1. 在子模块里改
cd workers/api/ncm-source
# ...编辑...
git diff > ../../../../patches/ncm-source.patch   # 生成补丁

# 2. 回到根目录把补丁应用状态跑一遍
cd - && npm run deps:apply
npm run verify
```

几点约定：

- 补丁文件必须保持 LF：里面有 `\r` 会让 `git apply` 的上下文匹配失败。
  `deps.mjs` 已经带上 `--ignore-whitespace` 来容忍 Windows 的 CRLF 差异。
- 补丁应该尽量小、尽量聚焦。上游一旦改动了补丁涉及的文件，`deps:update` 会报「冲突」并
  中止，需要人工基于新版本重做补丁——补丁越大，这件事越频繁。
- 有长期价值的改动都应该沉淀进 `patches/`，而不是留在子模块的临时工作区。

## 测试

三层，详见 README。日常只需要记住：

| 场景 | 命令 |
|---|---|
| 任何改动 | `npm test`（0.4 秒） |
| 动到部署流程 | `npm run test:scripts` |
| 发版前 / 排查线上 | `npm run test:api`（需要外网与登录态） |

新增测试的取向：**优先覆盖已经真实坏过的地方**，而不是追求覆盖率数字。
`workers/api/test/` 里的每个用例基本都对应一次线上事故或一次回归。

## 提交信息

沿用 Conventional Commits 的 `type(scope): 描述` 前缀：
`feat` / `fix` / `test` / `chore` / `docs` / `refactor`。

正文用中文写**为什么**，而不是复述改了什么——diff 已经能说明改了什么。
涉及取舍时把被否决的方案与原因一并写下，这对半年后的自己最有用。

## 发布流程

```bash
# 1. 升级上游依赖（会重打补丁、重建产物、跑单测，任一步失败即中止）
npm run deps:update

# 2. 全量自检（比 npm run verify 多一项：重建产物并与入库版本比对）
npm run verify:full

# 3. 按需调整版本号与 CHANGELOG
#    - package.json 的 version
#    - CHANGELOG.md 增加新版本小节

# 4. 部署（部署脚本自带依赖闸门，未验证会直接拒绝）
#    不带参数 = 发正式环境 (production)；想先看效果就加 --preview 发预览
npm run deploy:pages
npm run deploy:api

# 5. 核对线上版本，与本地一致才打 tag
#    正式：https://splayer-dvj.pages.dev/version.json
#    预览：https://dev.splayer-dvj.pages.dev/version.json
git tag -a v1.1.0 -m "v1.1.0"
git push --follow-tags   # 配置了远程仓库之后
```

> 前端有两个环境：**正式**（`npm run deploy:pages`）与**预览**
> （`bash scripts/deploy-pages.sh --preview`）。发布正式版本时务必确认跑的是
> 不带 `--preview` 的那条 —— 预览环境发得再对，正式环境也不会更新。
>
> 两条路径都会显式传 `--branch`：正式用 `deploy.config.json` 里的 `pagesProdBranch`
> （必须与 Pages 项目的 Production branch 一致），预览用 `pagesPreviewBranch`。
> 注意正式**不能**靠「不传 `--branch`」实现 —— wrangler 会从当前 git 仓库自动探测
> 分支，而部署是在子模块目录里跑的（detached HEAD），探测结果是 `HEAD`，
> 那样发出来的是一个叫 HEAD 的预览部署。

`version.json` 里会带上 `dirty` 字段：如果打包时工作区有未提交改动，
它会显示 `true`——这时「线上对应哪个提交」就不精确了，**不要**据此打 tag。

### 自动化部署（可选）

`.github/workflows/deploy.yml` 支持手动触发部署。需要在仓库 Secrets 里配置：

| Secret | 用途 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 部署 Worker / Pages 的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID |
| `NCM_COOKIE` | 仅接口冒烟测试需要（未配置则跳过需登录的用例） |

未配置这些 Secret 时该 workflow 会直接失败，不会误操作线上。

## 回滚

部署是幂等的、可重复的：**回滚 = 用旧代码重新部署一次**，不需要改任何线上配置。

| 组件 | 回滚方式 |
|---|---|
| 前端 Pages（正式） | Cloudflare 控制台 → Pages → 项目 → Deployments，找到 **Production** 的目标版本点 **Rollback**；<br>或本地 `git checkout <旧 tag>` 后重新 `npm run deploy:pages` |
| 前端 Pages（预览） | 同上，选中带分支别名的那条部署；<br>或重新 `bash scripts/deploy-pages.sh --preview` |
| Worker | `npx wrangler rollback --name <worker 名>` 回退到上一个版本；<br>或 `git checkout <旧 tag>` 后重新 `npm run deploy:api` |

Pages 的 Rollback 按部署生效：正式与预览各占一条部署记录，互不影响。用命令行重发时
目标也要对上 —— 回滚正式**不要**加 `--preview`，否则只是又发了一次预览。

判断「该回滚到哪一版」靠 `/version.json`：它记录了每个部署对应的提交与依赖版本，
和 git 历史一一对应。

注意：回滚前端只能回退**静态资源**；如果那次发布同时动过 `deploy.config.json`
（例如换了 API Worker 地址），回滚前端产物不会还原配置，需要一并回退配置再部署。

## 常见坑

这些坑在本仓库都真实发生过，遇到相似症状可以直接对号入座：

| 症状 | 原因 |
|---|---|
| `$'\r': command not found` | `.sh` 被检出成 CRLF。`.gitattributes` 已固定 LF，若复现请检查是不是被覆盖 |
| PowerShell 报 `Missing closing '}'` | `.ps1` 丢了 UTF-8 BOM，PS 5.1 按 ANSI 解码后中文变乱码 |
| `git status` 显示文件被改但 `git diff` 是空的 | 换行符表示与检出策略不符。仓库已统一 `eol=lf`，用 `git add --renormalize .` 清掉缓存状态。这类「假脏」还曾经让 `version.json` 的 `dirty` 永远为真（已修） |
| 前端所有接口 404，但请求看起来正常 | MSYS2 / Git Bash 把 `API_URL=/api/netease` 改写成 `E:/.../api/netease`。见 `scripts/lib/common.sh` 的转换防护 |
| 部署时报 wrangler 版本和预期不符 | 部署只使用 `package-lock.json` 锁定的版本；缺依赖会提示 `npm ci`，不要用 `npx wrangler` 手动装 |
| `npm ci` 报 EBUSY / 目录被占用 | 有残留的 `wrangler dev`（`workerd`）进程占着 `node_modules`，先结束它 |
| `npm run x -- --flag` 里参数没生效 | npm 10 不会把 `--` 之后的参数转发给脚本，会静默按默认值跑。需要传参就给脚本单独起一个名字（如 `verify:full`），或用环境变量 |
| Pages 显示部署成功，但正式域名还是旧内容 | 这次部署的分支名不等于项目的 Production branch，进的是**预览环境**。正式与预览是两条独立的部署记录。检查 `deploy.config.json` 的 `pagesProdBranch` 是否与 Pages 项目设置里的 Production branch 一致；注意「不传 `--branch`」也不行（wrangler 会探测成 `HEAD`） |
| 部署前端时打印 `Warning: Your working directory is a git repo and has uncommitted changes` | 这是 wrangler 对着**部署目录**（子模块 `splayer-frontend`）说的 —— 该目录确实带着本仓库打的补丁，因此永远「有未提交改动」。与本次发布是否干净无关：发布是否对应一个确定提交，以 `/version.json` 的 `dirty` 和 Pages 控制台的提交号为准（两者都取本仓库） |
| 功能都正常，但 Workers 用量翻倍 | 转发函数回到了公网 `fetch()`，或 `frontend-config/pages.wrangler.toml` 丢了 `pages_build_output_dir`（缺了它 wrangler 只把配置当本地开发用，绑定不作用于线上）。Pages Functions 与 Workers 共用同一个日请求额度池，这两种情况都会把一次调用计成两次。`npm run verify` 会拦住这两种改动 |
| 改配置后本地 `wrangler pages dev` 里绑定不可用 | Service Binding 指向的是**线上 Worker**，本地开发时需要目标 Worker 也在本地跑起来，或先直接打公网地址调试。这不影响线上部署 |

## 代码风格

- 格式由 Prettier 裁定（`.prettierrc`），忽略范围见 `.prettierignore`
  （上游 submodule、生成物、补丁、Markdown、许可证全文）。
- 换行符由 `.gitattributes` 统一为 LF；编辑器基础设置见 `.editorconfig`。
- 注释写「为什么」，尤其是那些看起来可以简化、实际不能动的地方——
  例如 `node_modules` 前置检查、`--ignore-whitespace`、路径转换防护，
  它们都是为了拦住具体事故才存在的。
