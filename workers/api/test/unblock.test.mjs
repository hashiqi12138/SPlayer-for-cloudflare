/**
 * 解锁相关逻辑的离线单测
 *
 * 解锁功能当前默认关闭（三大音源按出口 IP 限制，Cloudflare 出口无法真正生效），
 * 但代码仍在仓库里、也仍可能在境内出口重新启用，所以这些都值得钉住：
 *   - 默认必须是关闭的（不该因为环境变量读取方式变化而悄悄打开）
 *   - debug 参数只能覆盖白名单请求头，不能变成任意请求头注入
 *   - 音频代理的主机白名单不能被后缀绕过，否则就成了开放代理
 *   - 关键词匹配要能处理歌名自带连字符的情况
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { buildProxyUrl } from '../src/unblock/audio-proxy.js'
import { buildDebugHeaders, buildMatchInfo, isUnblockEnabled } from '../src/unblock/index.js'

afterEach(() => {
  delete globalThis.CF_ENV
})

describe('isUnblockEnabled', () => {
  it('默认关闭：没有 CF_ENV 时必须返回 false', () => {
    assert.equal(isUnblockEnabled(), false)
  })

  it('只有字符串 "true" 才视为开启', () => {
    globalThis.CF_ENV = { ENABLE_UNBLOCK: 'true' }
    assert.equal(isUnblockEnabled(), true)

    globalThis.CF_ENV = { ENABLE_UNBLOCK: 'false' }
    assert.equal(isUnblockEnabled(), false)

    globalThis.CF_ENV = { ENABLE_UNBLOCK: '1' }
    assert.equal(isUnblockEnabled(), false)

    globalThis.CF_ENV = {}
    assert.equal(isUnblockEnabled(), false)
  })
})

describe('buildMatchInfo', () => {
  it('按最后一个连字符切分「歌名-歌手」', () => {
    assert.deepEqual(buildMatchInfo({ keyword: '起风了-买辣椒也用券' }), {
      keyword: '起风了-买辣椒也用券',
      songName: '起风了',
      artist: '买辣椒也用券',
    })
  })

  it('歌名自带连字符时，只切最后一段作为歌手', () => {
    const m = buildMatchInfo({ keyword: 'Love-Me-Like-You-Do' })
    assert.equal(m.songName, 'Love-Me-Like-You-Do'.slice(0, 'Love-Me-Like-You-Do'.lastIndexOf('-')))
    assert.equal(m.artist, 'Do')
  })

  it('去掉连字符两侧的空格', () => {
    const m = buildMatchInfo({ keyword: '起风了 - 买辣椒也用券' })
    assert.equal(m.songName, '起风了')
    assert.equal(m.artist, '买辣椒也用券')
  })

  it('没有连字符时整体作为歌名', () => {
    const m = buildMatchInfo({ keyword: '起风了' })
    assert.equal(m.songName, '起风了')
    assert.equal(m.artist, '')
  })

  it('连字符在开头时不切分', () => {
    const m = buildMatchInfo({ keyword: '-买辣椒也用券' })
    assert.equal(m.songName, '-买辣椒也用券')
    assert.equal(m.artist, '')
  })

  it('显式传入 songName / artist 时优先', () => {
    const m = buildMatchInfo({ songName: '起风了', artist: '买辣椒也用券' })
    assert.equal(m.songName, '起风了')
    assert.equal(m.artist, '买辣椒也用券')
  })

  it('空入参返回空字段而不是抛错', () => {
    assert.deepEqual(buildMatchInfo(), { keyword: '', songName: '', artist: '' })
    assert.deepEqual(buildMatchInfo({}), { keyword: '', songName: '', artist: '' })
  })
})

describe('buildDebugHeaders', () => {
  it('非 debug=1 时不覆盖任何请求头', () => {
    assert.deepEqual(buildDebugHeaders({}), {})
    assert.deepEqual(buildDebugHeaders({ debug: '0', ua: 'x', xff: '1.2.3.4' }), {})
  })

  it('debug=1 时把白名单参数映射成请求头', () => {
    assert.deepEqual(buildDebugHeaders({ debug: '1', xff: '1.2.3.4', realip: '5.6.7.8' }), {
      'X-Forwarded-For': '1.2.3.4',
      'X-Real-IP': '5.6.7.8',
    })
  })

  it('只认白名单，不能借此注入任意请求头', () => {
    const headers = buildDebugHeaders({
      debug: '1',
      ua: 'probe',
      'x-custom-evil': '1',
      authorization: 'Bearer x',
      cookie: 'MUSIC_U=x',
    })
    assert.deepEqual(headers, { 'User-Agent': 'probe' })
  })
})

describe('buildProxyUrl', () => {
  it('白名单主机转为同源代理路径，并保留路径与查询', () => {
    assert.equal(
      buildProxyUrl('http://kw-bj.kuwo.cn/lx/1/2.mp3?bitrate=320k'),
      '/api/unblock/audio/kw-bj.kuwo.cn/lx/1/2.mp3?bitrate=320k',
    )
  })

  it('网易云音频 CDN 也在白名单内', () => {
    assert.match(
      String(buildProxyUrl('http://m801.music.126.net/x/y.mp3')),
      /^\/api\/unblock\/audio\/m801\.music\.126\.net\//,
    )
  })

  it('非白名单主机返回 null，避免变成开放代理', () => {
    assert.equal(buildProxyUrl('http://evil.com/x.mp3'), null)
  })

  it('不能被后缀绕过：kuwo.cn.evil.com 必须拒绝', () => {
    assert.equal(buildProxyUrl('http://kw-bj.kuwo.cn.evil.com/x.mp3'), null)
    assert.equal(buildProxyUrl('http://evilkuwo.cn/x.mp3'), null)
  })

  it('裸域名（无子域）不通过：白名单要求至少多一层子域', () => {
    assert.equal(buildProxyUrl('http://kuwo.cn/x.mp3'), null)
  })

  it('非法 URL 返回 null 而不是抛错', () => {
    assert.equal(buildProxyUrl('not-a-url'), null)
    assert.equal(buildProxyUrl(''), null)
    assert.equal(buildProxyUrl(undefined), null)
  })
})
