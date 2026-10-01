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
- [x] 批量接口测试脚本（63 个用例，含播放链路回归与解密往返校验）

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
2. **CPU 时间限制**：免费版单请求 10ms CPU。加密与多步请求接口可能超时。
3. **`xeapi` / `neapi` 加密**：依赖 Node 版 X25519 ECDH 与随机变换链，
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
```
