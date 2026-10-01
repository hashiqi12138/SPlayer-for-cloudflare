/**
 * createOption 的离线单测
 *
 * createOption 决定「这次请求用什么 cookie / 加密方式 / 是否随机国内 IP」，
 * 是每个接口都会经过的一层。cookie 取错 → 登录态丢失；crypto 取错 → 接口直接不通。
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { createOption } from '../src/option.js'

const ENV_KEYS = ['NETEASE_COOKIE', 'ENABLE_RANDOM_CN_IP']

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('createOption / cookie', () => {
  it('查询参数里的 cookie 优先', () => {
    process.env.NETEASE_COOKIE = 'MUSIC_U=env'
    assert.equal(createOption({ cookie: 'MUSIC_U=query' }).cookie, 'MUSIC_U=query')
  })

  it('没有查询参数时回退到环境变量', () => {
    process.env.NETEASE_COOKIE = 'MUSIC_U=env'
    assert.equal(createOption({}).cookie, 'MUSIC_U=env')
  })

  it('两者都没有时为 undefined，而不是空串', () => {
    assert.equal(createOption({}).cookie, undefined)
  })
})

describe('createOption / crypto', () => {
  it('查询参数里的 crypto 优先于默认值', () => {
    assert.equal(createOption({ crypto: 'weapi' }, 'eapi').crypto, 'weapi')
  })

  it('没有查询参数时用传入的默认值', () => {
    assert.equal(createOption({}, 'eapi').crypto, 'eapi')
  })

  it('都没有时为空串（由 request 层按 APP_CONF.encrypt 决定）', () => {
    assert.equal(createOption({}).crypto, '')
  })
})

describe('createOption / randomCNIP', () => {
  it('未开启 ENABLE_RANDOM_CN_IP 时，只有显式 true 才生效', () => {
    assert.equal(createOption({ randomCNIP: 'true' }).randomCNIP, true)
    assert.equal(createOption({ randomCNIP: true }).randomCNIP, true)
    assert.equal(createOption({ randomCNIP: 'false' }).randomCNIP, false)
    assert.equal(createOption({}).randomCNIP, false)
  })

  it('开启 ENABLE_RANDOM_CN_IP 后默认生效，除非显式关闭', () => {
    process.env.ENABLE_RANDOM_CN_IP = 'true'
    assert.equal(createOption({}).randomCNIP, true)
    assert.equal(createOption({ randomCNIP: 'false' }).randomCNIP, false)
  })
})

describe('createOption / 其余字段', () => {
  it('e_r 未传时为 undefined，交由 request 层决定是否加密响应', () => {
    assert.equal(createOption({}).e_r, undefined)
    assert.equal(createOption({ e_r: '1' }).e_r, '1')
  })

  it('headers / timeout / domain 有安全默认值', () => {
    const o = createOption({})
    assert.deepEqual(o.headers, {})
    assert.equal(o.timeout, 0)
    assert.equal(o.domain, '')
    assert.equal(o.ua, '')
  })
})
