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

## 解锁（解灰）接口

对接前端 `src/api/song.ts`（`baseURL: "/api/unblock"`）与 `docs/api.md` 的 UnblockAPI 契约。
实现位于 `src/unblock/`，响应统一为 `{ code, url }`，HTTP 恒为 200。

| 音源 | 路由 | Cloudflare 出口 | 说明 |
|---|---|---|---|
| 酷我 | `GET /api/unblock/kuwo?keyword=` | ✅ 可用 | 搜索匹配 + DES 加密取直链，主力音源 |
| 波点 | `GET /api/unblock/bodian?keyword=` | ❌ 地区限制 | 上游返回 407「仅限中国大陆地区使用」 |
| 网易云 | `GET /api/unblock/netease?id=` | ❌ 源站封禁 | GD 音乐台对 Cloudflare 出口返回 403 |

- DES 加密（`src/unblock/kwdes.js`）由前端 `electron/server/unblock/kwDES.js` 原样移植，纯 JS BigInt，无需 Node 原生加密。
- 返回直链统一升级为 https（实测酷我 CDN 支持），否则 https 页面会因混合内容被拦截。
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
2. **解锁音源出口限制**：酷我可用；波点（407 地区限制）与网易云聚合接口
   （403 封禁）拒绝 Cloudflare 出口。同为环境问题，已归入「受限」分类。
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

# 7. 解锁端到端：拿到直链并实际拉流校验可播放性
node scripts/probe-unblock-playable.cjs https://dev.splayer-dvj.pages.dev
```
