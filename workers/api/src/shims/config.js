/**
 * api-enhanced 配置常量（对应 ncm-source/util/config.json）
 *
 * 原仓库通过 `require('../util/config.json')` 读取，Workers 打包时
 * 内联 JSON 的 require 会被剥掉，导致模块里 APP_CONF 为 undefined。
 * 这里以 ESM 具名导出的形式提供同一份内容，两种写法都能用：
 *   const { APP_CONF } = require('../util/config.json')
 *   const { resourceTypeMap } = require('../util/config.json')
 */

export const resourceTypeMap = {
  0: 'R_SO_4_',
  1: 'R_MV_5_',
  2: 'A_PL_0_',
  3: 'R_AL_3_',
  4: 'A_DJ_1_',
  5: 'R_VI_62_',
  6: 'A_EV_2_',
  7: 'A_DR_14_',
}

export const APP_CONF = {
  apiDomain: 'https://interface.music.163.com',
  eapiDomain: 'https://interfacepc.music.163.com',
  xeapiDomain: 'https://interface3.music.163.com',
  neapiDomain: 'https://interface3.music.163.com',
  domain: 'https://music.163.com',
  clDomian: 'https://clientlog.music.163.com',
  clDomian3: 'https://clientlog3.music.163.com',
  dunDomainV3: 'https://ac.dun.163yun.com',
  dunStaticDomain: 'https://acstatic-dun.126.net',
  encrypt: true,
  encryptResponse: false,
  clientSign:
    '18:C0:4D:B9:8F:FE@@@453832335F384641365F424635335F303030315F303031425F343434415F343643365F333638332@@@@@@6ff673ef74955b38bce2fa8562d95c976ed4758b1227c4e9ee345987cee17bc9',
  checkToken:
    '9ca17ae2e6ffcda170e2e6ee8af14fbabdb988f225b3868eb2c15a879b9a83d274a790ac8ff54a97b889d5d42af0feaec3b92af58cff99c470a7eafd88f75e839a9ea7c14e909da883e83fb692a3abdb6b92adee9e',
}

export default { resourceTypeMap, APP_CONF }
