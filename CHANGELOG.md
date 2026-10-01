# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
版本号同时写在 `package.json` 与 git tag 上，构建产物里的 `/version.json` 会带上它。

发布流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

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

### 修复

- `_redirects` 此前被复制到前端项目根目录，而上传的只有 `out/renderer`，
  等于从未生效（线上能用只是平台恰好会回退到 `index.html`）；
  现改由 `finalize-dist.mjs` 放入产物，并新增 `_headers`
- PowerShell 脚本缺 UTF-8 BOM，在 Windows PowerShell 5.1 下直接无法解析
- `Copy-Item` 复制目录导致 `functions/functions/...` 嵌套，线上多出垃圾路由
- 全仓库文本统一 LF，消除 `core.autocrlf` 造成的「假改动」
- 24 个生成的测试报告从版本控制中移除（`.gitignore` 已忽略但仍被跟踪）

> 仓库当前未配置远程地址，因此版本比较链接暂不提供；
> 打上第一个 tag 后，可在 CI 或本地用 `git log <旧 tag>..<新 tag>` 生成对比。
