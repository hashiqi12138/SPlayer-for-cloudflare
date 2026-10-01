# 排查用脚本（probes）

这里放**一次性排查脚本**，不是测试。它们的共同点：

- 会打真实网络（本地 dev、已部署的 Worker、或音源站点），因此**不能进 CI**
- 多数需要参数（歌曲 ID、目标地址、采样次数），跑之前先看文件头注释
- 结论与推理过程记录在 `../ADAPTATION_TODO.md`，改这里之前建议先读那份

之所以单独放一个目录：这些脚本的寿命各不相同，有的已经被离线单元测试取代，
有的仍是排查线上问题最趁手的第一工具。混在主 `scripts/` 目录里会让人分不清
「哪些是构建/测试链路的一部分、哪些只是我当时用来定位问题的」。

## 登录态与播放链路

| 脚本 | 用途 |
|---|---|
| `diagnose-login.cjs` | 登录态诊断总入口：定位「登录态丢失 / 歌曲不可播放」发生在哪一环 |
| `diag-login.cjs` | 用参考实现（`ncm-source/util/crypto.js`）验证 `MUSIC_U` 是否被网易云认可 |
| `probe-cookie-paths.cjs` | Cookie 传递路径矩阵：逐个确认前端 → Function → Worker → 网易云每一跳 |
| `probe-play.cjs` | 播放链路对照探针。用法：`node probes/probe-play.cjs 2702937653` |
| `verify-cookie-forward.cjs` | 回归校验：Worker 是否把调用方传入的 cookie 透传到网易云。用法：`node probes/verify-cookie-forward.cjs http://127.0.0.1:8788` |
| `diag-local.mjs` | 在 Node 里直接跑移植后的 request handler，用来区分「移植代码问题」与「Workers 运行时问题」 |

## 解锁与音源

| 脚本 | 用途 |
|---|---|
| `probe-unblock-api.cjs` | 解锁接口手动验证（本地 / 线上通用）。用法：`node probes/probe-unblock-api.cjs <baseUrl>` |
| `probe-unblock-samples.cjs` | 用前端真实传参格式验证三个音源，找出可用于回归的稳定样例 |
| `probe-unblock-playable.cjs` | 端到端校验：经 Pages 拿到解锁直链后实际拉流，并检查浏览器播放所需条件 |
| `probe-unblock-latency.cjs` | 解锁接口在目标环境的真实耗时（多次采样）。用法：`node probes/probe-unblock-latency.cjs <baseUrl> 3` |
| `probe-unlock-default.cjs` | 校验线上产物中「音乐解锁」默认开关确实关闭 |
| `probe-unlock-fullsize.cjs` | 核实酷我解锁直链是完整歌曲而不是试听片段 |

## 地区限制判定

| 脚本 | 用途 |
|---|---|
| `probe-kuwo-region-gate.cjs` | 判定酷我地域限制的依据是**真实 TCP 出口 IP** 还是请求头（结论：真实 IP，伪造请求头无效） |
| `probe-kuwo-ua.cjs` | User-Agent 对酷我下发结果的影响。用法：`node probes/probe-kuwo-ua.cjs local` |
| `probe-kuwo-stub-rate.cjs` | 采样统计 Cloudflare 出口下酷我下发占位片段的概率。用法：`node probes/probe-kuwo-stub-rate.cjs 12` |

## 密码学对照

用于确认我们自己实现的加密与上游参考实现一致。

| 脚本 | 用途 |
|---|---|
| `ref-crypto-test.cjs` | 参考加密实现对照：用 `ncm-source/util/crypto.js` 的 weapi 直连 NCM |
| `ref-eapi-url.cjs` | 对照实验：用未经改动的 `ncm-source/util/crypto.js` 直连 eapi |
| `ref-rsa-compare.mjs` | 本地比对我们的 BigInt RSA 实现与 `node-forge` 的结果 |

## 什么时候该把它们变成测试

判断标准很简单：**一个问题如果会复发，就应该有回归测试**，而不是留一个需要人工跑的探针。
已经有三个从探针转正的例子（见 `../test/`）：

- cookie 解析形态 → `test/cookie.test.mjs`
- Worker 是否透传 cookie → `test/module-router.test.mjs`
- 音频代理主机白名单 → `test/unblock.test.mjs`

新增回归测试时，优先考虑把对应探针里的判定逻辑直接搬进单测 ——
探针容易随着环境变化而失效，单测不会。
