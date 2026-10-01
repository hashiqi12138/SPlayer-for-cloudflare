/**
 * 网易云音乐加密模块 - Cloudflare Workers 适配版
 * 
 * 基于 api-enhanced/util/crypto.js 移植
 * 
 * 支持的加密方式：
 * - ✅ eapi: AES-ECB + MD5（Electron 端，最常用）
 * - ✅ weapi: AES-CBC + RSA（Web 端，登录用）
 * - ✅ linuxapi: AES-ECB（Linux 端）
 * - ⏳ xeapi: 复杂，暂不支持
 * - ⏳ neapi: 复杂，暂不支持
 * 
 * 依赖：
 * - crypto-js: AES, MD5
 * - BigInt: RSA 加密（纯 JS 实现，无第三方依赖）
 */

import CryptoJS from 'crypto-js';

// ============================================================
// 常量
// ============================================================
const iv = '0102030405060708';
const presetKey = '0CoJUm6Qyw8W8jud';
const linuxapiKey = 'rFgB&h#%2?^eDg:Q';
const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;
const eapiKey = 'e82ckenh8dichen8';

// ============================================================
// 基础 AES 加密/解密
// ============================================================

function aesEncrypt(text, mode, key, ivStr, format = 'base64') {
  const encrypted = CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(text),
    CryptoJS.enc.Utf8.parse(key),
    {
      iv: CryptoJS.enc.Utf8.parse(ivStr),
      mode: CryptoJS.mode[mode.toUpperCase()],
      padding: CryptoJS.pad.Pkcs7,
    }
  );
  
  if (format === 'base64') {
    return encrypted.toString();
  }
  return encrypted.ciphertext.toString().toUpperCase();
}

function aesDecrypt(ciphertext, mode, key, ivStr, format = 'base64') {
  let bytes;
  if (format === 'base64') {
    bytes = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Utf8.parse(key), {
      iv: CryptoJS.enc.Utf8.parse(ivStr),
      mode: CryptoJS.mode[mode.toUpperCase()],
      padding: CryptoJS.pad.Pkcs7,
    });
  } else {
    bytes = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Hex.parse(ciphertext) },
      CryptoJS.enc.Utf8.parse(key),
      {
        iv: CryptoJS.enc.Utf8.parse(ivStr),
        mode: CryptoJS.mode[mode.toUpperCase()],
        padding: CryptoJS.pad.Pkcs7,
      }
    );
  }
  return bytes;
}

// ============================================================
// RSA 加密（无填充 / Raw RSA）
// 用纯 BigInt 实现，替代 node-forge
// ============================================================

let _cachedPublicKey = null;

function rsaEncrypt(str, pemKey) {
  // 解析公钥（带缓存）
  if (!_cachedPublicKey || _cachedPublicKey.pem !== pemKey) {
    _cachedPublicKey = {
      pem: pemKey,
      ...parseRsaPublicKey(pemKey),
    };
  }
  
  const { n, e, keyLength } = _cachedPublicKey;
  
  // 字符串转 bytes
  const strBytes = new TextEncoder().encode(str);
  
  if (strBytes.length > keyLength) {
    throw new Error(`RSA input too long: ${strBytes.length} > ${keyLength}`);
  }
  
  // 无填充：右对齐，前面补 0
  const padded = new Uint8Array(keyLength);
  padded.set(strBytes, keyLength - strBytes.length);
  
  // Bytes → BigInt
  let m = 0n;
  for (let i = 0; i < padded.length; i++) {
    m = (m << 8n) | BigInt(padded[i]);
  }
  
  // 模幂: c = m^e mod n
  const c = bigIntModPow(m, e, n);
  
  // BigInt → hex
  let hex = c.toString(16);
  const expectedLen = keyLength * 2;
  if (hex.length < expectedLen) {
    hex = '0'.repeat(expectedLen - hex.length) + hex;
  }
  
  return hex.toUpperCase();
}

function parseRsaPublicKey(pemKey) {
  const pemContent = pemKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
  
  const der = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  let pos = 0;
  
  // Outer SEQUENCE
  pos++; // 0x30
  const outerLen = _readDerLen(der, pos);
  pos += outerLen.lenBytes;
  
  // AlgorithmIdentifier SEQUENCE
  pos++; // 0x30
  const algLen = _readDerLen(der, pos);
  pos += algLen.lenBytes + algLen.value;
  
  // BIT STRING
  pos++; // 0x03
  const bitLen = _readDerLen(der, pos);
  pos += bitLen.lenBytes;
  pos++; // unused bits
  
  // RSAPublicKey SEQUENCE
  pos++; // 0x30
  const rsaLen = _readDerLen(der, pos);
  pos += rsaLen.lenBytes;
  
  // INTEGER n
  pos++; // 0x02
  const nLen = _readDerLen(der, pos);
  pos += nLen.lenBytes;
  const nBytes = der.slice(pos, pos + nLen.value);
  pos += nLen.value;
  
  // INTEGER e
  pos++; // 0x02
  const eLen = _readDerLen(der, pos);
  pos += eLen.lenBytes;
  const eBytes = der.slice(pos, pos + eLen.value);
  
  const n = _bytesToBigInt(nBytes);
  const e = _bytesToBigInt(eBytes);
  const keyLength = Math.ceil(n.toString(16).length / 2);
  
  return { n, e, keyLength };
}

function _readDerLen(bytes, offset) {
  const first = bytes[offset];
  if (first < 0x80) {
    return { value: first, lenBytes: 1 };
  }
  const num = first & 0x7f;
  let value = 0;
  for (let i = 0; i < num; i++) {
    value = (value << 8) | bytes[offset + 1 + i];
  }
  return { value, lenBytes: 1 + num };
}

function _bytesToBigInt(bytes) {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function bigIntModPow(base, exponent, modulus) {
  let result = 1n;
  base = base % modulus;
  while (exponent > 0n) {
    if (exponent & 1n) {
      result = (result * base) % modulus;
    }
    exponent = exponent >> 1n;
    base = (base * base) % modulus;
  }
  return result;
}

// ============================================================
// weapi (Web 端加密)
// ============================================================

function weapi(object) {
  const text = JSON.stringify(object);
  let secretKey = '';
  for (let i = 0; i < 16; i++) {
    secretKey += base62.charAt(Math.floor(Math.random() * 61));
  }
  
  return {
    params: aesEncrypt(
      aesEncrypt(text, 'cbc', presetKey, iv),
      'cbc',
      secretKey,
      iv,
    ),
    encSecKey: rsaEncrypt(secretKey.split('').reverse().join(''), publicKey),
  };
}

// ============================================================
// linuxapi
// ============================================================

function linuxapi(object) {
  const text = JSON.stringify(object);
  return {
    eparams: aesEncrypt(text, 'ecb', linuxapiKey, '', 'hex'),
  };
}

// ============================================================
// eapi (Electron 端加密) —— 最常用
// ============================================================

function eapi(url, object) {
  const text = typeof object === 'object' ? JSON.stringify(object) : object;
  const message = `nobody${url}use${text}md5forencrypt`;
  const digest = CryptoJS.MD5(message).toString();
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return {
    params: aesEncrypt(data, 'ecb', eapiKey, '', 'hex'),
  };
}

function eapiResDecrypt(encryptedParams) {
  try {
    const decrypted = aesDecrypt(encryptedParams, 'ecb', eapiKey, '', 'hex');
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  } catch (error) {
    console.error('[eapiResDecrypt] error:', error.message);
    return null;
  }
}

// ============================================================
// 导出
// ============================================================

export default {
  weapi,
  linuxapi,
  eapi,
  eapiResDecrypt,
  aesEncrypt,
  aesDecrypt,
};

export {
  weapi,
  linuxapi,
  eapi,
  eapiResDecrypt,
  aesEncrypt,
  aesDecrypt,
};
