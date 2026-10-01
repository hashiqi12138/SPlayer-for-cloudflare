/**
 * 模块路由的离线单测
 *
 * 重点是 cookie 的取值优先级 —— 这是「歌曲无法播放」的直接原因：
 * 中间件把 req.cookies 恒置为对象，老代码无条件 `query.cookie = req.cookies`，
 * 把 URL 上显式传入的 cookie 覆盖成空，前端登录态整体丢失（song/url 返回 code 404）。
 *
 * 除了纯函数本身，这里还用一个假的 express app + 探针 fetch，把
 * 「URL 上的 cookie 一路传到发往网易云的请求头」整条链路走一遍。
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { registerModules, resolveRequestCookie } from '../src/module-router.js'

const realFetch = globalThis.fetch
let calls = []

function stubFetch(body) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
}

/** 只记录路由表的假 express app */
function createFakeApp() {
  const routes = new Map()
  const app = {
    all: (p, h) => {
      routes.set(`ALL ${p}`, h)
      return app
    },
    get: (p, h) => {
      routes.set(`GET ${p}`, h)
      return app
    },
  }
  return { app, routes }
}

function createReq({ query = {}, body = {}, cookies = {}, headers = {}, ip = '' } = {}) {
  return { query, body, cookies, headers, ip, protocol: 'https' }
}

function createRes() {
  const out = { statusCode: null, body: undefined, headers: [], redirect: null }
  const res = {
    status(code) {
      out.statusCode = code
      return res
    },
    json(body) {
      out.body = body
      return res
    },
    append(k, v) {
      out.headers.push([k, v])
      return res
    },
    redirect(code, url) {
      out.redirect = { code, url }
      return res
    },
    set() {
      return res
    },
    end() {
      return res
    },
  }
  return { res, out }
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('resolveRequestCookie', () => {
  it('显式传入的 cookie 优先于 req.cookies', () => {
    const picked = resolveRequestCookie(
      'MUSIC_U=from-url',
      { MUSIC_U: 'from-jar' },
      'MUSIC_U=from-header',
    )
    assert.equal(picked, 'MUSIC_U=from-url')
  })

  it('显式传入对象时也优先', () => {
    assert.deepEqual(resolveRequestCookie({ a: '1' }, { b: '2' }, 'c=3'), { a: '1' })
  })

  it('没有显式 cookie 时用中间件解析出的 cookie', () => {
    assert.deepEqual(resolveRequestCookie(undefined, { MUSIC_U: 'jar' }, 'MUSIC_U=header'), {
      MUSIC_U: 'jar',
    })
  })

  it('req.cookies 为空对象时回退到 Cookie 请求头', () => {
    assert.equal(resolveRequestCookie(undefined, {}, 'MUSIC_U=header'), 'MUSIC_U=header')
  })

  it('显式传入空对象不覆盖后续来源', () => {
    assert.equal(resolveRequestCookie({}, {}, 'MUSIC_U=header'), 'MUSIC_U=header')
  })

  it('三者都没有时返回空对象', () => {
    assert.deepEqual(resolveRequestCookie(undefined, {}, undefined), {})
  })
})

describe('registerModules / 路由表', () => {
  it('注册了播放地址、二维码与健康检查', () => {
    const { app, routes } = createFakeApp()
    registerModules(app)

    assert.ok(routes.has('ALL /song/url/v1'), '缺少 /song/url/v1')
    assert.ok(routes.has('ALL /login/qr/create'), '缺少 /login/qr/create')
    assert.ok(routes.has('GET /health'), '缺少 /health')
  })

  it('/health 返回 200', async () => {
    const { app, routes } = createFakeApp()
    registerModules(app)
    const { res, out } = createRes()

    await routes.get('GET /health')(createReq(), res)

    assert.equal(out.body.code, 200)
    assert.equal(out.body.status, 'ok')
  })

  it('/login/qr/create 回传二维码内容，不需要访问上游', async () => {
    const { app, routes } = createFakeApp()
    registerModules(app)
    const { res, out } = createRes()

    await routes.get('ALL /login/qr/create')(createReq({ query: { key: 'a b' } }), res)

    assert.equal(out.statusCode, 200)
    assert.equal(out.body.data.qrurl, 'https://music.163.com/login?codekey=a%20b')
  })
})

describe('handleModule / cookie 传递链路', () => {
  const upstreamCookie = () => String(calls[0].init.headers.Cookie || '')

  it('URL 上的 cookie 会一路传到发往网易云的请求头', async () => {
    stubFetch({ code: 200, data: [{ url: 'http://x/1.mp3' }] })
    const { app, routes } = createFakeApp()
    registerModules(app)
    const { res, out } = createRes()

    await routes.get('ALL /song/url/v1')(
      createReq({ query: { id: '2702937653', cookie: 'MUSIC_U=from-url;os=pc;' } }),
      res,
    )

    assert.match(upstreamCookie(), /MUSIC_U=from-url/)
    assert.equal(out.body.data[0].url, 'http://x/1.mp3')
  })

  it('URL 没有 cookie 时回退到中间件解析出的 cookie', async () => {
    stubFetch({ code: 200, data: [] })
    const { app, routes } = createFakeApp()
    registerModules(app)
    const { res } = createRes()

    await routes.get('ALL /song/url/v1')(
      createReq({ query: { id: '1' }, cookies: { MUSIC_U: 'from-jar' } }),
      res,
    )

    assert.match(upstreamCookie(), /MUSIC_U=from-jar/)
  })

  it('都没有时回退到 Cookie 请求头', async () => {
    stubFetch({ code: 200, data: [] })
    const { app, routes } = createFakeApp()
    registerModules(app)
    const { res } = createRes()

    await routes.get('ALL /song/url/v1')(
      createReq({ query: { id: '1' }, headers: { cookie: 'MUSIC_U=from-header' } }),
      res,
    )

    assert.match(upstreamCookie(), /MUSIC_U=from-header/)
  })

  it('上游返回非 200 业务码时按该状态码透传', async () => {
    stubFetch({ code: 404, msg: 'not found' })
    const { app, routes } = createFakeApp()
    registerModules(app)
    const { res, out } = createRes()

    await routes.get('ALL /song/url/v1')(createReq({ query: { id: '1' } }), res)

    assert.equal(out.statusCode, 404)
    assert.equal(out.body.code, 404)
  })
})
