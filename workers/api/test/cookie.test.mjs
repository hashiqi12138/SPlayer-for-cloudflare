/**
 * cookie 解析与拼装的离线单测
 *
 * 为什么这几个「字符串工具函数」值得单测：
 * 线上出现过「歌曲无法播放」——根因之一就是 cookie 串按 "; " 切分，
 * 而前端实际发送的是 "MUSIC_U=xxx;os=pc;"（分号后没有空格），结果一个字段都解析不出来，
 * 登录态整体丢失，接口返回 code 404。这类问题跑联网集成测试很难定位，
 * 但用纯函数单测几毫秒就能钉死。
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  cookieObjToString,
  cookieToJson,
  createHeaderCookie,
  processCookieObject,
  setAnonymousToken,
} from '../src/ncm-request-handler.js'

describe('cookieToJson', () => {
  it('能解析前端真实发送的形态：分号后不带空格、末尾带分号', () => {
    assert.deepEqual(cookieToJson('MUSIC_U=abc;os=pc;'), { MUSIC_U: 'abc', os: 'pc' })
  })

  it('同时兼容分号后带空格的标准形态', () => {
    assert.deepEqual(cookieToJson('MUSIC_U=abc; os=pc'), { MUSIC_U: 'abc', os: 'pc' })
  })

  it('尾部分号不会产生空字段', () => {
    assert.deepEqual(Object.keys(cookieToJson('a=1;')), ['a'])
  })

  it('空值返回空对象', () => {
    assert.deepEqual(cookieToJson(''), {})
    assert.deepEqual(cookieToJson(undefined), {})
    assert.deepEqual(cookieToJson(null), {})
  })

  it('忽略没有键、或没有等号的分片', () => {
    // 'nokey' 无等号；'=1' 键为空；两者都应被丢弃，而不是解析出空键
    assert.deepEqual(cookieToJson('nokey;=1;ok=2'), { ok: '2' })
  })

  it('值里含等号时按第一个等号切分', () => {
    assert.deepEqual(cookieToJson('token=a=b=c'), { token: 'a=b=c' })
  })

  it('对 URL 编码的键值做解码', () => {
    assert.deepEqual(cookieToJson('k=a%3Db%3Bc'), { k: 'a=b;c' })
  })
})

describe('cookieObjToString / createHeaderCookie', () => {
  it('用「分号 + 空格」拼接并对值编码', () => {
    assert.equal(cookieObjToString({ a: '1', b: 'x y' }), 'a=1; b=x%20y')
  })

  it('createHeaderCookie 与 cookieObjToString 保持一致', () => {
    const header = { os: 'pc', deviceId: 'd1' }
    assert.equal(createHeaderCookie(header), cookieObjToString(header))
  })

  it('空对象拼接为空串', () => {
    assert.equal(cookieObjToString({}), '')
  })
})

describe('processCookieObject', () => {
  afterEach(() => setAnonymousToken(''))

  it('补齐 os 相关默认值，但不覆盖调用方显式传入的字段', () => {
    const out = processCookieObject({ os: 'android', appver: 'custom' }, 'eapi')
    assert.equal(out.os, 'android')
    assert.equal(out.appver, 'custom')
    assert.equal(out.channel, 'xiaomi')
  })

  it('未知 os 时按 pc 配置补齐其他字段', () => {
    const out = processCookieObject({ os: 'symbian' }, 'eapi')
    assert.equal(out.appver, '3.1.17.204416')
  })

  it('无 os 时默认 pc', () => {
    const out = processCookieObject({}, 'eapi')
    assert.equal(out.os, 'pc')
    assert.equal(out.channel, 'netease')
  })

  it('始终补上 deviceId 与 __remember_me', () => {
    const out = processCookieObject({}, 'eapi')
    assert.match(out.deviceId, /^[0-9a-f]{32}$/)
    assert.equal(out.__remember_me, 'true')
  })

  it('未登录时用匿名 token 兜底 MUSIC_A', () => {
    setAnonymousToken('anon-token')
    assert.equal(processCookieObject({}, 'eapi').MUSIC_A, 'anon-token')
  })

  it('已登录（存在 MUSIC_U）时不注入 MUSIC_A', () => {
    setAnonymousToken('anon-token')
    const out = processCookieObject({ MUSIC_U: 'u' }, 'eapi')
    assert.equal(out.MUSIC_A, undefined)
    assert.equal(out.MUSIC_U, 'u')
  })
})
