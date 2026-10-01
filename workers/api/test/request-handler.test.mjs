/**
 * 请求构造与响应映射的离线单测
 *
 * 做法：把 globalThis.fetch 换成探针，让 createRequest 正常跑完整流程，
 * 然后检查「发出去的请求」与「收回来的结果」。全程不联网。
 *
 * 这里盯的是三个真实踩过的坑：
 *   1. eapi 请求缺少 data.header —— 服务端对 song/enhance/player/url 系列直接返回 code 404
 *   2. Set-Cookie 用 response.headers.get() 取会被逗号拼成一串，
 *      而 cookie 的 Expires 属性自带逗号，拆不干净 → 必须用 getSetCookie() 取数组
 *   3. 业务码 → HTTP 状态码的映射（201/302/800 等要归一成 200，404 要抛出）
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { eapiReqDecrypt } from '../src/ncm-crypto.js'
import { createRequest } from '../src/ncm-request-handler.js'

const realFetch = globalThis.fetch
let calls = []

function stubFetch(responder) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return responder(String(url), init)
  }
}

function jsonResponse(body, setCookies = []) {
  const headers = new Headers({ 'content-type': 'application/json' })
  for (const c of setCookies) headers.append('set-cookie', c)
  return new Response(JSON.stringify(body), { status: 200, headers })
}

function decodeEapiBody(init) {
  const params = new URLSearchParams(String(init.body)).get('params')
  return eapiReqDecrypt(params)
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('createRequest / eapi', () => {
  it('请求体带 data.header（缺了会让 song/url 系列 404）', async () => {
    stubFetch(() => jsonResponse({ code: 200, data: [] }))

    await createRequest(
      '/api/song/enhance/player/url/v1',
      { ids: '[1]', level: 'exhigh' },
      { crypto: 'eapi', cookie: { MUSIC_U: 'token', os: 'pc' } },
    )

    const decoded = decodeEapiBody(calls[0].init)
    assert.ok(
      decoded.data.header,
      'eapi 请求必须带 data.header，否则 song/enhance/player/url 系列返回 code 404',
    )
    assert.equal(decoded.data.header.MUSIC_U, 'token')
    assert.equal(decoded.url, '/api/song/enhance/player/url/v1')
  })

  it('走 eapi 域名，并把 /api 前缀换成 /eapi', async () => {
    stubFetch(() => jsonResponse({ code: 200 }))

    await createRequest('/api/song/url/v1', { id: '1' }, { crypto: 'eapi', cookie: {} })

    assert.equal(calls[0].url, 'https://interfacepc.music.163.com/eapi/song/url/v1')
    assert.equal(calls[0].init.method, 'POST')
    assert.match(
      String(calls[0].init.headers['Content-Type']),
      /application\/x-www-form-urlencoded/,
    )
  })

  it('把 cookie 作为 Cookie 请求头发给上游', async () => {
    stubFetch(() => jsonResponse({ code: 200 }))

    await createRequest('/api/x', {}, { crypto: 'eapi', cookie: 'MUSIC_U=abc;os=pc;' })

    const cookieHeader = String(calls[0].init.headers.Cookie)
    assert.match(cookieHeader, /MUSIC_U=abc/)
    assert.match(cookieHeader, /os=pc/)
  })

  it('把调用方 IP 写进 X-Real-IP / X-Forwarded-For', async () => {
    stubFetch(() => jsonResponse({ code: 200 }))

    await createRequest('/api/x', {}, { crypto: 'eapi', cookie: {}, ip: '203.0.113.7' })

    assert.equal(calls[0].init.headers['X-Real-IP'], '203.0.113.7')
    assert.equal(calls[0].init.headers['X-Forwarded-For'], '203.0.113.7')
  })
})

describe('createRequest / 响应映射', () => {
  it('保留多个 Set-Cookie，并去掉 Domain 属性', async () => {
    stubFetch(() =>
      jsonResponse({ code: 200 }, [
        'MUSIC_U=abc; Path=/; Domain=.music.163.com; HttpOnly',
        'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/',
      ]),
    )

    const answer = await createRequest('/api/x', {}, { crypto: 'eapi', cookie: {} })

    assert.equal(answer.cookie.length, 2, '多个 Set-Cookie 必须都保留')
    assert.ok(
      answer.cookie.every((c) => !/Domain=/i.test(c)),
      'Domain 属性应被去掉',
    )
    assert.match(answer.cookie[0], /MUSIC_U=abc/)
    // Expires 里的逗号不能被当成 cookie 分隔符
    assert.match(answer.cookie[1], /Expires=Thu, 01 Jan 1970 00:00:00 GMT/)
  })

  it('201 / 302 / 800 归一成 HTTP 200', async () => {
    for (const code of [201, 302, 800]) {
      calls = []
      stubFetch(() => jsonResponse({ code, data: 'x' }))
      const answer = await createRequest('/api/x', {}, { crypto: 'eapi', cookie: {} })
      assert.equal(answer.status, 200, `code ${code} 应为 200`)
      assert.equal(answer.body.code, code)
    }
  })

  it('业务码 404 时抛出 answer（保留原始状态与响应体）', async () => {
    stubFetch(() => jsonResponse({ code: 404, msg: 'not found' }))

    await assert.rejects(
      () => createRequest('/api/x', {}, { crypto: 'eapi', cookie: {} }),
      (err) => {
        assert.equal(err.status, 404)
        assert.equal(err.body.code, 404)
        return true
      },
    )
  })

  it('未知加密方式归类为 502', async () => {
    stubFetch(() => jsonResponse({ code: 200 }))

    await assert.rejects(
      () => createRequest('/api/x', {}, { crypto: 'nope', cookie: {} }),
      (err) => {
        assert.equal(err.status, 502)
        return true
      },
    )
  })

  it('网络异常归类为 502 并带上定位信息', async () => {
    stubFetch(() => {
      throw new Error('boom')
    })

    await assert.rejects(
      () => createRequest('/api/x', {}, { crypto: 'eapi', cookie: {} }),
      (err) => {
        assert.equal(err.status, 502)
        assert.match(String(err.body.msg), /boom/)
        return true
      },
    )
  })
})
