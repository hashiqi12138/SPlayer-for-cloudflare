# api-enhanced Workers 适配清单

## 已完成
- [x] 项目结构搭建
- [x] Express ↔ Workers 适配层
- [x] 模块自动扫描和路由注册
- [x] 基础 polyfills (os, fs, child_process)

## 需要手动适配的核心功能

### 高优先级
- [ ] **request.js** - 核心 HTTP 请求函数（网易云 API 请求 + 加密）
  - 文件: util/request.js
  - 说明: 这是最核心的文件，负责加密、签名、发请求
  - 依赖: crypto-js, node-forge, axios
  - 方案: 保留加密逻辑，将 axios 替换为 fetch

- [ ] **加密模块** (util/crypto 等)
  - 说明: eapi/weapi/xeapi 加密算法
  - 方案: 验证 crypto-js 和 node-forge 在 Workers 中是否正常

- [ ] **歌曲解灰** (unblockmusic-utils)
  - 说明: 跨平台歌曲匹配
  - 方案: 测试该库的 Workers 兼容性

### 中优先级
- [ ] **缓存** (util/apicache.js)
  - 方案: 可以用 Workers KV 替代

- [ ] **二维码登录**
  - 依赖: qrcode 包
  - 方案: 验证 qrcode 兼容性

- [ ] **登录状态保持**
  - 方案: Cookie 机制应该可以正常工作

### 低优先级
- [ ] **云盘上传**
  - 依赖: express-fileupload, music-metadata
  - 方案: Workers 免费版 100MB 限制，可能需要特殊处理

- [ ] **音乐元数据解析**
  - 依赖: music-metadata
  - 方案: 验证兼容性

## 已知风险

1. **CPU 时间限制**: 免费版 10ms，加密计算可能超时
   → 解决方案: 升级到付费版（$5/月），或优化加密算法

2. **内存限制**: 免费版 128MB
   → 解决方案: 懒加载模块，只加载需要的

3. **冷启动**: 首次调用可能较慢
   → 解决方案: 影响不大，音乐播放器场景可以接受

## 验证步骤

1. 先部署基础版本，确认 Express 能跑
2. 逐个移植核心模块（先 banner, search 等简单接口）
3. 移植加密模块，测试登录
4. 测试歌曲播放接口
5. 测试解灰功能
