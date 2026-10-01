/**
 * 探针 / 测试脚本共用的地址配置
 *
 * 从仓库根目录的 deploy.config.json 读取，避免每个脚本各写一份默认地址
 * （此前 ncm-api / music-proxy / pages 三处地址散落在十几个脚本里）。
 *
 * 各脚本仍支持用命令行参数覆盖，例如：
 *   node scripts/test-api.cjs http://127.0.0.1:8788
 */

const fs = require('fs')
const path = require('path')

const CONFIG_PATH = path.resolve(__dirname, '..', '..', '..', 'deploy.config.json')

function load() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (e) {
    console.error(`无法读取部署配置: ${CONFIG_PATH}`)
    console.error('deploy.config.json 是地址的唯一事实来源，请确认它存在且为合法 JSON。')
    process.exit(2)
  }
}

const cfg = load()

module.exports = {
  configPath: CONFIG_PATH,
  apiWorkerUrl: cfg.apiWorkerUrl,
  proxyWorkerUrl: cfg.proxyWorkerUrl,
  // Pages 分正式/预览两个环境；探针默认打正式环境，需要时用命令行参数覆盖
  pagesProdUrl: cfg.pagesProdUrl,
  pagesPreviewUrl: cfg.pagesPreviewUrl,
}
