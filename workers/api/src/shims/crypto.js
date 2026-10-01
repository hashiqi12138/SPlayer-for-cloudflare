/**
 * `../util/crypto` 兼容层
 *
 * 对应 ncm-source/util/crypto.js 中在 Workers 环境下可实现的部分：
 *   - eapi / weapi / linuxapi 加密
 *   - eapiResDecrypt / eapiReqDecrypt / aesEncrypt / aesDecrypt
 *   - xeapiSign（HMAC-SHA256，crypto-js 可直接实现）
 *   - xeapiDecryptPublicKey（AES-256-ECB，密钥为 32 字节 hex）
 *
 * 未实现的（依赖 Node 版 X25519 ECDH / 随机变换链，Workers 下不可行）：
 *   - xeapi / neapi 请求加密、xeapiResDecrypt、neapiResDecrypt
 * 这些以「抛出明确错误」的形式占位，避免调用方拿到 undefined 报出难懂的错。
 */

import CryptoJS from 'crypto-js'
import {
  weapi,
  linuxapi,
  eapi,
  eapiResDecrypt,
  eapiReqDecrypt,
  aesEncrypt,
  aesDecrypt,
} from '../ncm-crypto.js'

const eapiKey = 'e82ckenh8dichen8'

// 与 ncm-source/util/crypto.js 保持一致
const xeapiStaticKeyHex = 'ab1d5a430f6bb04a3f01e81ddd72bd916d5ce591248ac128714806d7f8fb1b84'
const xeapiSignKey =
  'mUHCwVNWJbunMqAHf5MImuirT6plvs6VSFW62MGHstFQxhBGdEoIhLItH3djc4+FB/OKty3+lL2rGeoFBpVe5g=='

const unsupported = (name) => () => {
  throw new Error(`${name} 在 Cloudflare Workers 环境下不可用（依赖 Node 版 X25519/随机变换链）`)
}

/** bytes/字符串 → CryptoJS WordArray */
function toWordArray(input) {
  if (typeof input === 'string') {
    // 先按 base64 处理；失败则当 utf8
    try {
      return CryptoJS.enc.Base64.parse(input)
    } catch (e) {
      return CryptoJS.enc.Utf8.parse(input)
    }
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const words = []
  for (let i = 0; i < bytes.length; i++) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8)
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length)
}

/** CryptoJS WordArray → Uint8Array */
function toBytes(wordArray) {
  const { words, sigBytes } = wordArray
  const out = new Uint8Array(sigBytes)
  for (let i = 0; i < sigBytes; i++) {
    out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  }
  return out
}

/** AES-ECB 解密，返回 Uint8Array（对应 Node 的 aesEcbDecrypt） */
function aesEcbDecryptBytes(keyHex, ciphertextBytes) {
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: toWordArray(ciphertextBytes) },
    CryptoJS.enc.Hex.parse(keyHex),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
  )
  return toBytes(decrypted)
}

/** 对应 ncm-source 的 decrypt(cipher)：AES-ECB + eapiKey，输入为 hex 串 */
function decrypt(cipher) {
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: CryptoJS.enc.Hex.parse(cipher) },
    CryptoJS.enc.Utf8.parse(eapiKey),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
  )
  return CryptoJS.enc.Utf8.stringify(decrypted)
}

/** 对应 xeapiSign：HMAC-SHA256(timestamp + nonce)，密钥按 utf8 处理 */
function xeapiSign(timestamp, nonce) {
  const digest = CryptoJS.HmacSHA256(
    String(timestamp) + nonce,
    CryptoJS.enc.Utf8.parse(xeapiSignKey),
  )
  return CryptoJS.enc.Base64.stringify(digest)
}

/** 对应 xeapiDecryptPublicKey：AES-256-ECB 解密后再 JSON 解析 */
function xeapiDecryptPublicKey(encryptedData) {
  const bytes = aesEcbDecryptBytes(
    xeapiStaticKeyHex,
    typeof encryptedData === 'string'
      ? CryptoJS.enc.Base64.parse(encryptedData)
      : toWordArray(encryptedData),
  )
  return JSON.parse(new TextDecoder().decode(bytes))
}

export default {
  weapi,
  linuxapi,
  eapi,
  eapiResDecrypt,
  eapiReqDecrypt,
  aesEncrypt,
  aesDecrypt,
  decrypt,
  xeapiSign,
  xeapiDecryptPublicKey,
  xeapi: unsupported('xeapi'),
  neapi: unsupported('neapi'),
  xeapiResDecrypt: unsupported('xeapiResDecrypt'),
  neapiResDecrypt: unsupported('neapiResDecrypt'),
}

export {
  weapi,
  linuxapi,
  eapi,
  eapiResDecrypt,
  eapiReqDecrypt,
  aesEncrypt,
  aesDecrypt,
  decrypt,
  xeapiSign,
  xeapiDecryptPublicKey,
}
