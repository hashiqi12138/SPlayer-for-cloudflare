# api-enhanced Workers 适配清单

## 已完成

- [x] 项目结构搭建
- [x] Express ↔ Workers 适配层（`http.Server` + 手动 emit request）
- [x] 请求体解析（手动读入再 push 进 `IncomingMessage`）
- [x] Cookie 解析与透传（按 `;` 切分，兼容 `MUSIC_U=xxx;os=pc;` 无空格分隔）
- [x] `request.js` 核心请求移植（axios → fetch，eapi/weapi/linuxapi 加密）
- [x] eapi 请求头构造（`data.header` + Cookie 头，缺失会导致 `song/url` 系列返回 404）
- [x] 模块自动转译：**429 / 441** 个接口模块
- [x] shim 机制：`logger` / `util` / `pkg` / `axios` / `config` / `crypto`
- [x] 同目录模块互调（`require('./ad_get.js')` → `__moduleRef('/ad/get')`）
- [x] 批量接口测试脚本（68 个用例，含播放链路回归与解密往返校验）
- [x] 解锁（解灰）接口 `/api/unblock/*`，见下节

## 解锁（解灰）接口 —— 已关闭

对接前端 `src/api/song.ts`（`baseURL: "/api/unblock"`）与 `docs/api.md` 的 UnblockAPI 契约。
实现位于 `src/unblock/`，响应统一为 `{ code, url }`，HTTP 恒为 200。

**当前状态：已关闭。** 三大音源均按出口 IP 限制，在 Cloudflare 出口无法真正生效，
且会拖慢不可用歌曲的播放（每首并发打 3 个必然失败的请求），因此前后端都已停用：

- 后端：`ENABLE_UNBLOCK` 未设置时取代码默认 `false`，所有解锁路由返回
  `code:404, reason:"disabled"`，音频代理返回 503，不会发起任何上游请求。
- 前端：`useSongUnlock` 默认改为 `false`（上游默认开启）。
- 恢复方式：在 `wrangler.toml` 取消 `# ENABLE_UNBLOCK = "true"` 的注释并重新部署；
  前端默认值由 `scripts/deploy-pages.ps1` 的补丁控制。
  本地调试用 `workers/api/.dev.vars`（已被 gitignore）开启。

| 音源 | 路由 | Cloudflare 出口 | 境内出口 | 说明 |
|---|---|---|---|---|
| 酷我 | `GET /api/unblock/kuwo?keyword=` | ❌ 占位片段 | ✅ 完整歌曲 | 搜索匹配 + DES 加密取直链 |
| 波点 | `GET /api/unblock/bodian?keyword=` | ❌ 地区限制 | ✅ 可用 | 上游返回 407「仅限中国大陆地区使用」 |
| 网易云 | `GET /api/unblock/netease?id=` | ❌ 源站封禁 | ✅ 可用 | GD 音乐台对 Cloudflare 出口返回 403 |

> **重要结论：解锁功能在 Cloudflare 出口无法真正工作。** 三大音源均按出口 IP
> 做地域/反盗链限制。其中酷我最具迷惑性：搜索与加密均正常，接口也返回 200，
> 但下发的直链在 Cloudflare 出口实测是**固定的 15.6KB 占位音频**
> （所有歌曲同一资源），它是合法 MP3、能通过 Range 校验，实际只有约 0.4 秒。
> 同一 rid 境内直连为 2.0MB 完整歌曲，可确认是出口 IP 导致的降级。
>
> **酷我实际有两道独立闸门**（已用双向实验确认，见
> `scripts/probe-kuwo-region-gate.cjs` 与 `probe-kuwo-ua.cjs`）：
>
> 1. **UA 闸门**：浏览器 UA 一律下发占位片段 —— 境内直连用 Chrome UA 也是
>    15.6KB，换成 `okhttp/3.10.0`、`Dart/2.19`、客户端 UA 甚至空 UA 都是完整歌曲。
>    因此出站请求必须使用客户端 UA，**不能图省事用浏览器 UA**。
> 2. **IP 闸门**：非中国大陆出口一律下发占位片段，与请求头完全无关。
>    境内连接伪造境外 IP 头（8.8.8.8 / 104.16.0.1）仍是完整歌曲；
>    从 Cloudflare 伪造境内 IP 头仍是占位片段 —— 说明只认真实 TCP 出口 IP。
>
> 即：**加请求头无法绕过 IP 闸门**，Cloudflare 出口命中的是这一道。
>
> 为此接口增加了**占位片段拦截**（`getAudioTotalBytes` + `MIN_VALID_AUDIO_BYTES`），
> 命中时返回 `code:404, reason:"stub-audio"`，避免前端「假成功」后播放中断。
>
> 若要让解锁真正可用，需把该接口部署到**中国大陆出口**的运行时
> （如境内 VPS / 自建服务），Cloudflare 免费版无法指定中国出口。

- DES 加密（`src/unblock/kwdes.js`）由前端 `electron/server/unblock/kwDES.js` 原样移植，纯 JS BigInt，无需 Node 原生加密。
- **必须经过音频代理**（`src/unblock/audio-proxy.js`）：前端 `AudioElementPlayer`
  固定 `crossOrigin = "anonymous"`，而酷我 CDN 实测不返回任何 CORS 头，
  直接返回原站直链浏览器会拒绝加载 —— 这正是上游默认关闭酷我音源的原因。
  代理返回**同源相对路径**（`/api/unblock/audio/<host>/<path>`），保留 `.mp3`
  扩展名（前端据此推断格式），只放行白名单音源主机，避免成为开放代理。
  需要原始直链时传 `raw=1`。
- 前端默认值补丁：Web 端「音乐解锁」设置项是 Electron 专属
  （`config/play.ts` 中 `show: isElectron`），浏览器中无法开启音源。
  而本部署出口只有酷我可用，故把 `songUnlockServer` 默认值改为三个音源全开
  （`setting.ts` 与 `migrations/settingMigrations.ts`）。
  补丁由 `scripts/deploy-pages.ps1` 自动应用，重新 clone 前端后依然生效。
- 失败响应附带 `reason`（`no-match` / `region-locked` / `source-blocked` / `timeout` 等），
  前端契约只认 `code`/`url`，多余字段仅用于运维排查与测试分类。
- 后两个音源在国内出口 IP 下实测均可用，属**部署出口位置**问题而非实现缺陷。

## 尚未适配（12 个）

| 模块 | 阻塞依赖 | 说明 |
|---|---|---|
| `/register/checktoken/v2` | `jsdom` | 易盾 Watchman SDK 需浏览器环境，Workers 无 DOM |
| `/register/anonimous` | `path` `fs` | 依赖本地文件读写生成设备指纹 |
| `/register/neapikey` | `util/neapiKey` `util/neapiConfig` | 需持久化密钥到本地缓存 |
| `/scrobble/v1` | `util/ncbl` | NCBL 上报依赖 `node:crypto` 的 ChaCha20-Poly1305 与压缩链 |
| `/song/url/match` | `unblockmusic-utils` | 跨平台歌曲匹配库，未验证 Workers 兼容性 |
| `/song/url/v1` | `unblockmusic-utils` `dotenv` | 已在 `module-router.js` 手动退化为普通 eapi 请求（不含解灰） |
| `/cloud` `/voice/upload` `/avatar/upload` `/playlist/cover/update` | `plugins/upload` `music-metadata` `fs` `xml2js` | 文件上传，Workers 无临时文件系统（`ENABLE_FILE_UPLOAD=false`） |
| `/login/qr/create` `/verify/getQr` | `qrcode` | 已在 `module-router.js` 退化为只回传二维码内容，由前端渲染 |

## 已知风险

1. **网易云风控（-462）**：Cloudflare 出口 IP 触发人机验证。属环境问题，
   换住宅/自建出口 IP 可恢复；测试脚本已单独归类，不计入失败率。
2. **解锁音源出口限制（功能已关闭）**：酷我下发占位片段（`stub-audio`）、
   波点 407 地区限制、网易云聚合接口 403。三者均按出口 IP 限制，
   在 Cloudflare 出口下无法真正生效；境内出口实测均可返回完整歌曲。
   已把前后端的解锁默认关闭（见上文），测试中归入「受限」分类。
3. **解锁接口耗时**：酷我解密为纯 JS 大数运算，叠加跨境网络，实测 2～25s，
   明显慢于本地。前端并发请求三音源并取首个成功，可缓解感知延迟。
4. **CPU 时间限制**：免费版单请求 10ms CPU。加密与多步请求接口可能超时。
5. **`xeapi` / `neapi` 加密**：依赖 Node 版 X25519 ECDH 与随机变换链，
   Workers 下未实现，请求会降级到 eapi（见 `ncm-request-handler.js`）。

## 验证方式

```powershell
# 1. 本地起服务
cd workers/api
npx wrangler dev --port 8788

# 2. 全量接口测试（带登录态）
$env:NCM_COOKIE = "MUSIC_U=xxx;os=pc;"
node scripts/test-api.cjs http://127.0.0.1:8788

# 3. 播放链路对照（参考实现 / 本地 / 已部署 / Pages 代理）
node scripts/probe-play.cjs 2702937653

# 4. cookie 透传矩阵校验
node scripts/verify-cookie-forward.cjs http://127.0.0.1:8788

# 5. 解锁接口（服务信息 / 各音源 / 空参数）
node scripts/probe-unblock-api.cjs http://127.0.0.1:8788

# 6. 解锁多音源 × 多样例矩阵对比
node scripts/probe-unblock-samples.cjs http://127.0.0.1:8788

# 7. 解锁端到端：经 Pages 拿到直链，实际拉流并校验 CORS / 音频类型
node scripts/probe-unblock-playable.cjs https://dev.splayer-dvj.pages.dev

# 8. 解锁接口耗时采样（跨境链路抖动排查）
node scripts/probe-unblock-latency.cjs https://ncm-api.liujieahu.workers.dev 3

# 9. 校验线上产物中酷我音源默认已启用
node scripts/probe-unlock-default.cjs https://dev.splayer-dvj.pages.dev

# 10. 判定地域限制依据（真实出口 IP vs 请求头），双向实验
node scripts/probe-kuwo-region-gate.cjs

# 11. UA 闸门验证（浏览器 UA 会触发占位片段）
node scripts/probe-kuwo-ua.cjs local

# 12. 占位片段出现概率采样
node scripts/probe-kuwo-stub-rate.cjs 12
```
