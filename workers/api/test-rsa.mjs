// 本地测试 RSA 加密是否和 node-forge 结果一致
import CryptoJS from 'crypto-js';
import forge from 'node-forge';

// 复制我们的 BigInt RSA 实现
const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;

function rsaEncryptForge(str) {
  const forgePublicKey = forge.pki.publicKeyFromPem(publicKey);
  const encrypted = forgePublicKey.encrypt(str, 'NONE');
  return forge.util.bytesToHex(encrypted).toUpperCase();
}

// === BigInt 版本 ===
function _readDerLen(bytes, offset) {
  const first = bytes[offset];
  if (first < 0x80) return { value: first, lenBytes: 1 };
  const num = first & 0x7f;
  let value = 0;
  for (let i = 0; i < num; i++) value = (value << 8) | bytes[offset + 1 + i];
  return { value, lenBytes: 1 + num };
}

function _bytesToBigInt(bytes) {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) result = (result << 8n) | BigInt(bytes[i]);
  return result;
}

function bigIntModPow(base, exponent, modulus) {
  let result = 1n;
  base = base % modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    exponent = exponent >> 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function parseRsaPublicKey(pemKey) {
  const pemContent = pemKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  let pos = 0;
  pos++; const outerLen = _readDerLen(der, pos); pos += outerLen.lenBytes;
  pos++; const algLen = _readDerLen(der, pos); pos += algLen.lenBytes + algLen.value;
  pos++; const bitLen = _readDerLen(der, pos); pos += bitLen.lenBytes; pos++;
  pos++; const rsaLen = _readDerLen(der, pos); pos += rsaLen.lenBytes;
  pos++; const nLen = _readDerLen(der, pos); pos += nLen.lenBytes;
  const nBytes = der.slice(pos, pos + nLen.value); pos += nLen.value;
  pos++; const eLen = _readDerLen(der, pos); pos += eLen.lenBytes;
  const eBytes = der.slice(pos, pos + eLen.value);
  return { n: _bytesToBigInt(nBytes), e: _bytesToBigInt(eBytes) };
}

let _cachedKey = null;
function rsaEncryptBigInt(str) {
  if (!_cachedKey) _cachedKey = parseRsaPublicKey(publicKey);
  const { n, e } = _cachedKey;
  const keyLength = Math.ceil(n.toString(16).length / 2);
  
  const strBytes = new TextEncoder().encode(str);
  const padded = new Uint8Array(keyLength);
  padded.set(strBytes, keyLength - strBytes.length);
  
  let m = 0n;
  for (let i = 0; i < padded.length; i++) m = (m << 8n) | BigInt(padded[i]);
  
  const c = bigIntModPow(m, e, n);
  let hex = c.toString(16);
  if (hex.length < keyLength * 2) hex = '0'.repeat(keyLength * 2 - hex.length) + hex;
  return hex.toUpperCase();
}

// 测试
const testStr = 'abcdefghijklmnop'; // 16 字节，和 secretKey 一样长
const forgeResult = rsaEncryptForge(testStr);
const bigIntResult = rsaEncryptBigInt(testStr);

console.log('测试字符串:', testStr);
console.log('forge 结果:', forgeResult.substring(0, 40) + '...');
console.log('BigInt 结果:', bigIntResult.substring(0, 40) + '...');
console.log('长度:', forgeResult.length, 'vs', bigIntResult.length);
console.log('一致:', forgeResult === bigIntResult ? '✅' : '❌');
