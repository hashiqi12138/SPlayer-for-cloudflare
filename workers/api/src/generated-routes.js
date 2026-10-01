/**
 * 自动生成 —— 请勿手动编辑
 *
 * 来源: api-enhanced/ncm-source/module
 * 生成时间: 2026-10-01T01:11:44.368Z
 *
 * 已转译: 413 个模块
 * 已跳过: 28 个（依赖特殊，走 module-router.js 手动实现）
 */

import createOption from './option.js';
import { createRequest } from './ncm-request-handler.js';
import CryptoJS from 'crypto-js';
const __CryptoJS__ = CryptoJS;

// 评论等接口的资源类型映射（对应 util/config.json）
const resourceTypeMap = {
  '0': 'R_SO_4_',
  '1': 'R_MV_5_',
  '2': 'A_PL_0_',
  '3': 'R_AL_3_',
  '4': 'A_DJ_1_',
  '5': 'R_VI_62_',
  '6': 'A_EV_2_',
  '7': 'A_DR_14_',
};

export const moduleFns = {

  // /activate/init/profile  <-- activate_init_profile.js
  '/activate/init/profile': (query, request) => {
  const data = {
    nickname: query.nickname,
  }
  return request(`/api/activate/initProfile`, data, createOption(query))
},

  // /ad/get  <-- ad_get.js
  '/ad/get': async (query, request) => {
  const data = {
    type_ids: query.type_ids || '["400002_0"]',
  }

  const option = createOption(query, 'xeapi', 'v3')

  const res = await request(`/api/ad/get`, data, option)
  const raw = res.body

  // 提取广告中的 req_id
  let reqId = ''
  try {
    if (raw?.ads) {
      const ad = Object.values(raw.ads)[0]
      // 逆向 v9.5.61：客户端从 ad.adExtMap["req_id"] 取 reqUid
      if (ad?.adExtMap) {
        if (typeof ad.adExtMap === 'string') {
          try {
            reqId = JSON.parse(ad.adExtMap).req_id || ''
          } catch (_) {}
        } else {
          reqId = ad.adExtMap.req_id || ''
        }
      }
      // 兜底：adLogId.requestId / ad.reqId / extJson.contextInfo.req_id
      if (!reqId && ad?.adLogId?.requestId) reqId = ad.adLogId.requestId
      if (!reqId && ad?.reqId) reqId = ad.reqId
      if (!reqId && ad?.extJson) {
        try {
          const ext = JSON.parse(ad.extJson)
          reqId = ext?.contextInfo?.req_id || ''
        } catch (_) {}
      }
    }
  } catch (_) {}

  return {
    status: 200,
    body: {
      code: 200,
      ads: raw?.ads || null,
      message: raw?.message || null,
      extra: { reqId },
    },
  }
},

  // /ad/listening/rights  <-- ad_listening_rights.js
  '/ad/listening/rights': (query, request) => {
  const data = {
    entrance: 'FREE_LISTEN_RN',
  }
  return request(
    `/api/ad/homepage/free/tab/extend/v2`,
    data,
    createOption(query, 'xeapi'),
  )
},

  // /album  <-- album.js
  '/album': (query, request) => {
  return request(`/api/v1/album/${query.id}`, {}, createOption(query, 'weapi'))
},

  // /album/detail  <-- album_detail.js
  '/album/detail': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(
    `/api/vipmall/albumproduct/detail`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /album/detail/dynamic  <-- album_detail_dynamic.js
  '/album/detail/dynamic': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(
    `/api/album/detail/dynamic`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /album/list  <-- album_list.js
  '/album/list': (query, request) => {
  const data = {
    limit: query.limit || 30,
    offset: query.offset || 0,
    total: true,
    area: query.area || 'ALL', //ALL:全部,ZH:华语,EA:欧美,KR:韩国,JP:日本
    type: query.type,
  }
  return request(
    `/api/vipmall/albumproduct/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /album/list/style  <-- album_list_style.js
  '/album/list/style': (query, request) => {
  const data = {
    limit: query.limit || 10,
    offset: query.offset || 0,
    total: true,
    area: query.area || 'Z_H', //Z_H:华语,E_A:欧美,KR:韩国,JP:日本
  }
  return request(
    `/api/vipmall/appalbum/album/style`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /album/new  <-- album_new.js
  '/album/new': (query, request) => {
  const data = {
    limit: query.limit || 30,
    offset: query.offset || 0,
    total: true,
    area: query.area || 'ALL', //ALL:全部,ZH:华语,EA:欧美,KR:韩国,JP:日本
  }
  return request(`/api/album/new`, data, createOption(query, 'weapi'))
},

  // /album/newest  <-- album_newest.js
  '/album/newest': (query, request) => {
  return request(`/api/discovery/newAlbum`, {}, createOption(query, 'weapi'))
},

  // /album/privilege  <-- album_privilege.js
  '/album/privilege': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/album/privilege`, data, createOption(query))
},

  // /album/songsaleboard  <-- album_songsaleboard.js
  '/album/songsaleboard': (query, request) => {
  let data = {
    albumType: query.albumType || 0, //0为数字专辑,1为数字单曲
  }
  const type = query.type || 'daily' // daily,week,year,total
  if (type === 'year') {
    data = {
      ...data,
      year: query.year,
    }
  }
  return request(
    `/api/feealbum/songsaleboard/${type}/type`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /album/sub  <-- album_sub.js
  '/album/sub': (query, request) => {
  query.t = query.t == 1 ? 'sub' : 'unsub'
  const data = {
    id: query.id,
  }
  return request(`/api/album/${query.t}`, data, createOption(query, 'weapi'))
},

  // /album/sublist  <-- album_sublist.js
  '/album/sublist': (query, request) => {
  const data = {
    limit: query.limit || 25,
    offset: query.offset || 0,
    total: true,
  }
  return request(`/api/album/sublist`, data, createOption(query, 'weapi'))
},

  // /artist/album  <-- artist_album.js
  '/artist/album': (query, request) => {
  const data = {
    limit: query.limit || 30,
    offset: query.offset || 0,
    total: true,
  }
  return request(
    `/api/artist/albums/${query.id}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /artist/desc  <-- artist_desc.js
  '/artist/desc': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/artist/introduction`, data, createOption(query, 'weapi'))
},

  // /artist/detail  <-- artist_detail.js
  '/artist/detail': (query, request) => {
  return request(
    `/api/artist/head/info/get`,
    {
      id: query.id,
    },
    createOption(query),
  )
},

  // /artist/detail/dynamic  <-- artist_detail_dynamic.js
  '/artist/detail/dynamic': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/artist/detail/dynamic`, data, createOption(query))
},

  // /artist/fans  <-- artist_fans.js
  '/artist/fans': (query, request) => {
  const data = {
    id: query.id,
    limit: query.limit || 20,
    offset: query.offset || 0,
  }
  return request(`/api/artist/fans/get`, data, createOption(query, 'weapi'))
},

  // /artist/follow/count  <-- artist_follow_count.js
  '/artist/follow/count': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(
    `/api/artist/follow/count/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /artist/list  <-- artist_list.js
  '/artist/list': (query, request) => {
  const data = {
    initial: isNaN(query.initial)
      ? (query.initial || '').toUpperCase().charCodeAt() || undefined
      : query.initial,
    offset: query.offset || 0,
    limit: query.limit || 30,
    total: true,
    type: query.type || '1',
    area: query.area,
  }
  return request(`/api/v1/artist/list`, data, createOption(query, 'weapi'))
},

  // /artist/mv  <-- artist_mv.js
  '/artist/mv': (query, request) => {
  const data = {
    artistId: query.id,
    limit: query.limit,
    offset: query.offset,
    total: true,
  }
  return request(`/api/artist/mvs`, data, createOption(query, 'weapi'))
},

  // /artist/new/mv  <-- artist_new_mv.js
  '/artist/new/mv': (query, request) => {
  const data = {
    limit: query.limit || 20,
    startTimestamp: query.before || Date.now(),
  }
  return request(
    `/api/sub/artist/new/works/mv/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /artist/new/song  <-- artist_new_song.js
  '/artist/new/song': (query, request) => {
  const data = {
    limit: query.limit || 20,
    startTimestamp: query.before || Date.now(),
  }
  return request(
    `/api/sub/artist/new/works/song/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /artist/new/song/mv/list/v2  <-- artist_new_song_mv_list_v2.js
  '/artist/new/song/mv/list/v2': (query, request) => {
  const data = {
    startTimestamp: query.startTimestamp || query.before || Date.now(),
    sourceType: query.sourceType || 1,
    limit: query.limit || 10,
    firstRequest: query.firstRequest ?? true,
  }
  return request(
    `/api/sub/artist/new/works/song-mv/list/v2`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /artist/new/song/playall  <-- artist_new_song_playall.js
  '/artist/new/song/playall': (query, request) => {
  return request(
    `/api/sub/artist/new/works/song/playall`,
    {},
    createOption(query, 'eapi'),
  )
},

  // /artist/songs  <-- artist_songs.js
  '/artist/songs': (query, request) => {
  const data = {
    id: query.id,
    private_cloud: 'true',
    work_type: 1,
    order: query.order || 'hot', //hot,time
    offset: query.offset || 0,
    limit: query.limit || 100,
  }
  return request(`/api/v1/artist/songs`, data, createOption(query))
},

  // /artist/sub  <-- artist_sub.js
  '/artist/sub': (query, request) => {
  query.t = query.t == 1 ? 'sub' : 'unsub'
  const data = {
    artistId: query.id,
    artistIds: '[' + query.id + ']',
  }
  return request(`/api/artist/${query.t}`, data, createOption(query, 'weapi'))
},

  // /artist/sublist  <-- artist_sublist.js
  '/artist/sublist': (query, request) => {
  const data = {
    limit: query.limit || 25,
    offset: query.offset || 0,
    total: true,
  }
  return request(`/api/artist/sublist`, data, createOption(query, 'weapi'))
},

  // /artist/top/song  <-- artist_top_song.js
  '/artist/top/song': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/artist/top/song`, data, createOption(query, 'weapi'))
},

  // /artist/video  <-- artist_video.js
  '/artist/video': (query, request) => {
  const data = {
    artistId: query.id,
    page: JSON.stringify({
      size: query.size || 10,
      cursor: query.cursor || 0,
    }),
    tab: 0,
    order: query.order || 0,
  }
  return request(`/api/mlog/artist/video`, data, createOption(query, 'weapi'))
},

  // /artists  <-- artists.js
  '/artists': (query, request) => {
  return request(`/api/v1/artist/${query.id}`, {}, createOption(query, 'weapi'))
},

  // /banner  <-- banner.js
  '/banner': (query, request) => {
  const type =
    {
      0: 'pc',
      1: 'android',
      2: 'iphone',
      3: 'ipad',
    }[query.type || 0] || 'pc'
  return request(
    `/api/v2/banner/get`,
    { clientType: type },
    createOption(query),
  )
},

  // /batch  <-- batch.js
  '/batch': (query, request) => {
  const data = {}
  Object.keys(query).forEach((i) => {
    if (/^\/api\//.test(i)) {
      data[i] = query[i]
    }
  })
  return request(`/api/batch`, data, createOption(query))
},

  // /broadcast/category/region/get  <-- broadcast_category_region_get.js
  '/broadcast/category/region/get': (query, request) => {
  const data = {}
  return request(
    `/api/voice/broadcast/category/region/get`,
    data,
    createOption(query),
  )
},

  // /broadcast/channel/collect/list  <-- broadcast_channel_collect_list.js
  '/broadcast/channel/collect/list': (query, request) => {
  const data = {
    contentType: 'BROADCAST',
    limit: query.limit || '99999',
    timeReverseOrder: 'true',
    startDate: '4762584922000',
  }
  return request(`/api/content/channel/collect/list`, data, createOption(query))
},

  // /broadcast/channel/currentinfo  <-- broadcast_channel_currentinfo.js
  '/broadcast/channel/currentinfo': (query, request) => {
  const data = {
    channelId: query.id,
  }
  return request(
    `/api/voice/broadcast/channel/currentinfo`,
    data,
    createOption(query),
  )
},

  // /broadcast/channel/list  <-- broadcast_channel_list.js
  '/broadcast/channel/list': (query, request) => {
  const data = {
    categoryId: query.categoryId || '0',
    regionId: query.regionId || '0',
    limit: query.limit || '20',
    lastId: query.lastId || '0',
    score: query.score || '-1',
  }
  return request(`/api/voice/broadcast/channel/list`, data, createOption(query))
},

  // /broadcast/sub  <-- broadcast_sub.js
  '/broadcast/sub': (query, request) => {
  query.t = query.t == 1 ? 'false' : 'true'
  const data = {
    contentType: 'BROADCAST',
    contentId: query.id,
    cancelCollect: query.t,
  }
  return request(`/api/content/interact/collect`, data, createOption(query))
},

  // /calendar  <-- calendar.js
  '/calendar': (query, request) => {
  const data = {
    startTime: query.startTime || Date.now(),
    endTime: query.endTime || Date.now(),
  }
  return request(`/api/mcalendar/detail`, data, createOption(query, 'weapi'))
},

  // /captcha/safe/sent  <-- captcha_safe_sent.js
  '/captcha/safe/sent': (query, request) => {
  const data = {
    ctcode: query.ctcode || '86',
  }
  return request(
    `/api/sms/captcha/safe/sent`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /captcha/sent  <-- captcha_sent.js
  '/captcha/sent': (query, request) => {
  const data = {
    ctcode: query.ctcode || '86',
    secrete: 'music_middleuser_pclogin',
    cellphone: query.phone,
  }
  return request(`/api/sms/captcha/sent`, data, createOption(query, 'weapi'))
},

  // /captcha/sent/v1  <-- captcha_sent_v1.js
  '/captcha/sent/v1': (query, request) => {
  const data = {
    ctcode: query.ctcode || '86',
    secrete: 'music_middleuser_pclogin',
    cellphone: query.phone,
    scene: '0',
  }
  return request(
    `/api/middle/captcha/sent/v1`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /captcha/verify  <-- captcha_verify.js
  '/captcha/verify': (query, request) => {
  const data = {
    ctcode: query.ctcode || '86',
    cellphone: query.phone,
    captcha: query.captcha,
  }
  return request(`/api/sms/captcha/verify`, data, createOption(query, 'weapi'))
},

  // /cellphone/existence/check  <-- cellphone_existence_check.js
  '/cellphone/existence/check': (query, request) => {
  const data = {
    cellphone: query.phone,
    countrycode: query.countrycode,
  }
  return request(
    `/api/cellphone/existence/check`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /chart/detail  <-- chart_detail.js
  '/chart/detail': (query, request) => {
  const data = {
    chartCode: query.chartCode,
    targetId: query.targetId,
    targetType: query.targetType,
  }
  return request(`/api/chart/detail`, data, createOption(query))
},

  // /chart/song/detail  <-- chart_song_detail.js
  '/chart/song/detail': (query, request) => {
  const data = {
    chartCode: query.chartCode,
    targetId: query.targetId,
    targetType: query.targetType,
  }
  return request(`/api/chart/song/detail`, data, createOption(query))
},

  // /check/music  <-- check_music.js
  '/check/music': (query, request) => {
  const data = {
    ids: '[' + parseInt(query.id) + ']',
    br: parseInt(query.br || 999000),
  }
  return request(
    `/api/song/enhance/player/url`,
    data,
    createOption(query, 'weapi'),
  ).then((response) => {
    let playable = false
    if (response.body.code == 200) {
      if (response.body.data[0].code == 200) {
        playable = true
      }
    }
    if (playable) {
      response.body = { code: 200, success: true, message: 'ok' }
      return response
    } else {
      // response.status = 404
      response.body = { code: 200, success: false, message: '亲爱的,暂无版权' }
      return response
      // return Promise.reject(response)
    }
  })
},

  // /cloud/import  <-- cloud_import.js
  '/cloud/import': async (query, request) => {
  query.id = query.id || -2
  query.artist = query.artist || '未知'
  query.album = query.album || '未知'
  const checkData = {
    uploadType: 0,
    songs: JSON.stringify([
      {
        md5: query.md5,
        songId: query.id,
        bitrate: query.bitrate,
        fileSize: query.fileSize,
      },
    ]),
  }
  const res = await request(
    `/api/cloud/upload/check/v2`,
    checkData,
    createOption(query),
  )
  //res.body.data[0].upload 0:文件可导入,1:文件已在云盘,2:不能导入
  //只能用song决定云盘文件名，且上传后的文件名后缀固定为mp3
  const importData = {
    uploadType: 0,
    songs: JSON.stringify([
      {
        songId: res.body.data[0].songId,
        bitrate: query.bitrate,
        song: query.song,
        artist: query.artist,
        album: query.album,
        fileName: query.song + '.' + query.fileType,
      },
    ]),
  }
  return request(`/api/cloud/user/song/import`, importData, createOption(query))
},

  // /cloud/lyric/get  <-- cloud_lyric_get.js
  '/cloud/lyric/get': (query, request) => {
  const data = {
    userId: query.uid,
    songId: query.sid,
    lv: -1,
    kv: -1,
  }
  return request(`/api/cloud/lyric/get`, data, createOption(query, 'eapi'))
},

  // /cloud/match  <-- cloud_match.js
  '/cloud/match': (query, request) => {
  const data = {
    userId: query.uid,
    songId: query.sid,
    adjustSongId: query.asid,
  }
  return request(
    `/api/cloud/user/song/match`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /cloud/upload/complete  <-- cloud_upload_complete.js
  '/cloud/upload/complete': async (query, request) => {
  const {
    songId,
    resourceId,
    md5,
    filename,
    song,
    artist,
    album,
    bitrate = 999000,
  } = query

  if (!songId || !resourceId || !md5 || !filename) {
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        msg: '缺少必要参数: songId, resourceId, md5, filename',
      },
    })
  }

  const songName = song || filename.replace(/\.[^.]+$/, '')

  const res2 = await request(
    `/api/upload/cloud/info/v2`,
    {
      md5: md5,
      songid: songId,
      filename: filename,
      song: songName,
      album: album || '未知专辑',
      artist: artist || '未知艺术家',
      bitrate: String(bitrate),
      resourceId: resourceId,
    },
    createOption(query),
  )

  if (res2.body.code !== 200) {
    return Promise.reject({
      status: res2.status || 500,
      body: {
        code: res2.body.code || 500,
        msg: res2.body.msg || '上传云盘信息失败',
        detail: res2.body,
      },
    })
  }

  const res3 = await request(
    `/api/cloud/pub/v2`,
    {
      songid: res2.body.songId,
    },
    createOption(query),
  )

  return {
    status: 200,
    body: {
      code: 200,
      data: {
        songId: res2.body.songId,
        ...res3.body,
      },
    },
    cookie: res2.cookie,
  }
},

  // /cloudsearch  <-- cloudsearch.js
  '/cloudsearch': (query, request) => {
  const data = {
    s: query.keywords,
    type: query.type || 1, // 1: 单曲, 10: 专辑, 100: 歌手, 1000: 歌单, 1002: 用户, 1004: MV, 1006: 歌词, 1009: 电台, 1014: 视频
    limit: query.limit || 30,
    offset: query.offset || 0,
    total: true,
  }
  return request(`/api/cloudsearch/pc`, data, createOption(query))
},

  // /comment  <-- comment.js
  '/comment': (query, request) => {
  query.t = {
    1: 'add',
    0: 'delete',
    2: 'reply',
  }[query.t]
  query.type = resourceTypeMap[query.type]
  const data = {
    threadId: query.type + query.id,
  }

  if (query.type == 'A_EV_2_') {
    data.threadId = query.threadId
  }
  if (query.t == 'add') data.content = query.content
  else if (query.t == 'delete') data.commentId = query.commentId
  else if (query.t == 'reply') {
    data.commentId = query.commentId
    data.content = query.content
  }
  return request(
    `/api/resource/comments/${query.t}`,
    data,
    createOption(query, 'eapi', 'v2'),
  )
},

  // /comment/add  <-- comment_add.js
  '/comment/add': (query, request) => {
  const data = {
    threadId: resourceTypeMap[query.type] + query.id,
    content: query.content,
    resourceType: '0',
    expressionPicId: '-1',
    bubbleId: '-1',
  }
  return request(
    `/api/resource/comments/add`,
    data,
    createOption(query, 'xeapi', 'v3'),
  )
},

  // /comment/album  <-- comment_album.js
  '/comment/album': (query, request) => {
  const data = {
    rid: query.id,
    limit: query.limit || 20,
    offset: query.offset || 0,
    beforeTime: query.before || 0,
  }
  return request(
    `/api/v1/resource/comments/R_AL_3_${query.id}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /comment/delete  <-- comment_delete.js
  '/comment/delete': (query, request) => {
  const data = {
    commentId: query.cid,
    threadId: resourceTypeMap[query.type] + query.id,
  }
  return request(
    `/api/resource/comments/delete`,
    data,
    createOption(query, 'xeapi'),
  )
},

  // /comment/dj  <-- comment_dj.js
  '/comment/dj': (query, request) => {
  const data = {
    rid: query.id,
    limit: query.limit || 20,
    offset: query.offset || 0,
    beforeTime: query.before || 0,
  }
  return request(
    `/api/v1/resource/comments/A_DJ_1_${query.id}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /comment/event  <-- comment_event.js
  '/comment/event': (query, request) => {
  const data = {
    limit: query.limit || 20,
    offset: query.offset || 0,
    beforeTime: query.before || 0,
  }
  return request(
    `/api/v1/resource/comments/${query.threadId}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /comment/floor  <-- comment_floor.js
  '/comment/floor': (query, request) => {
  query.type = resourceTypeMap[query.type]
  const data = {
    parentCommentId: query.parentCommentId,
    threadId: query.type + query.id,
    time: query.time || -1,
    limit: query.limit || 20,
  }
  return request(
    `/api/resource/comment/floor/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /comment/hot  <-- comment_hot.js
  '/comment/hot': (query, request) => {
  query.type = resourceTypeMap[query.type]
  const data = {
    rid: query.id,
    limit: query.limit || 20,
    offset: query.offset || 0,
    beforeTime: query.before || 0,
  }
  return request(
    `/api/v1/resource/hotcomments/${query.type}${query.id}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /comment/hug/list  <-- comment_hug_list.js
  '/comment/hug/list': (query, request) => {
  query.type = resourceTypeMap[query.type || 0]
  const threadId = query.type + query.sid
  const data = {
    targetUserId: query.uid,
    commentId: query.cid,
    cursor: query.cursor || '-1',
    threadId: threadId,
    pageNo: query.page || 1,
    idCursor: query.idCursor || -1,
    pageSize: query.pageSize || 100,
  }
  return request(
    `/api/v2/resource/comments/hug/list`,
    data,
    createOption(query),
  )
},

  // /comment/info/list  <-- comment_info_list.js
  '/comment/info/list': (query, request) => {
  const ids = String(query.ids || query.id || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  return request(
    `/api/resource/commentInfo/list`,
    {
      resourceType: resourceTypeIdMap[String(query.type || 0)],
      resourceIds: JSON.stringify(ids),
    },
    createOption(query, 'weapi'),
  )
},

  // /comment/like  <-- comment_like.js
  '/comment/like': (query, request) => {
  query.t = query.t == 1 ? 'like' : 'unlike'
  query.type = resourceTypeMap[query.type]
  const data = {
    threadId: query.type + query.id,
    commentId: query.cid,
  }
  if (query.type == 'A_EV_2_') {
    data.threadId = query.threadId
  }
  return request(
    `/api/v1/comment/${query.t}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /comment/music  <-- comment_music.js
  '/comment/music': (query, request) => {
  const data = {
    rid: query.id,
    limit: query.limit || 20,
    offset: query.offset || 0,
    beforeTime: query.before || 0,
  }
  return request(
    `/api/v1/resource/comments/R_SO_4_${query.id}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /comment/mv  <-- comment_mv.js
  '/comment/mv': (query, request) => {
  const data = {
    rid: query.id,
    limit: query.limit || 20,
    offset: query.offset || 0,
    beforeTime: query.before || 0,
  }
  return request(
    `/api/v1/resource/comments/R_MV_5_${query.id}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /comment/new  <-- comment_new.js
  '/comment/new': (query, request) => {
  query.type = resourceTypeMap[query.type]
  const threadId = query.type + query.id
  const pageSize = query.pageSize || 20
  const pageNo = query.pageNo || 1
  let sortType = Number(query.sortType) || 99
  if (sortType === 1) {
    sortType = 99
  }
  let cursor = ''
  switch (sortType) {
    case 99:
      cursor = (pageNo - 1) * pageSize
      break
    case 2:
      cursor = 'normalHot#' + (pageNo - 1) * pageSize
      break
    case 3:
      cursor = query.cursor || '0'
      break
    default:
      break
  }
  const data = {
    threadId: threadId,
    pageNo,
    showInner: query.showInner || true,
    pageSize,
    cursor: cursor,
    sortType: sortType, //99:按推荐排序,2:按热度排序,3:按时间排序
  }
  return request(`/api/v2/resource/comments`, data, createOption(query))
},

  // /comment/playlist  <-- comment_playlist.js
  '/comment/playlist': (query, request) => {
  const data = {
    rid: query.id,
    limit: query.limit || 20,
    offset: query.offset || 0,
    beforeTime: query.before || 0,
  }
  return request(
    `/api/v1/resource/comments/A_PL_0_${query.id}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /comment/reply  <-- comment_reply.js
  '/comment/reply': (query, request) => {
  const data = {
    threadId: resourceTypeMap[query.type] + query.id,
    commentId: query.cid,
    content: query.content,
    resourceType: '0',
  }
  return request(
    `/api/v1/resource/comments/reply`,
    data,
    createOption(query, 'xeapi', 'v3'),
  )
},

  // /comment/report  <-- comment_report.js
  '/comment/report': (query, request) => {
  const data = {
    threadId: 'R_SO_4_' + query.id,
    commentId: query.cid,
    reason: query.reason,
  }
  return request(`/api/report/reportcomment`, data, createOption(query))
},

  // /comment/video  <-- comment_video.js
  '/comment/video': (query, request) => {
  const data = {
    rid: query.id,
    limit: query.limit || 20,
    offset: query.offset || 0,
    beforeTime: query.before || 0,
  }
  return request(
    `/api/v1/resource/comments/R_VI_62_${query.id}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /countries/code/list  <-- countries_code_list.js
  '/countries/code/list': (query, request) => {
  const data = {}
  return request(`/api/lbs/countries/v1`, data, createOption(query))
},

  // /creator/authinfo/get  <-- creator_authinfo_get.js
  '/creator/authinfo/get': (query, request) => {
  const data = {}
  return request(`/api/user/creator/authinfo/get`, data, createOption(query))
},

  // /daily/signin  <-- daily_signin.js
  '/daily/signin': (query, request) => {
  const data = {
    type: query.type || 0,
  }
  return request(`/api/point/dailyTask`, data, createOption(query))
},

  // /device/kickoff  <-- device_kickoff.js
  '/device/kickoff': (query, request) => {
  const data = {
    key: query.deviceKey,
    captcha: query.captcha || '',
  }
  return request(
    `/api/middle/user/security/device/kickoff`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /device/list  <-- device_list.js
  '/device/list': (query, request) => {
  const data = {
    excStatus: '9',
  }
  return request(
    `/api/middle/user/device/list`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /deviceinfo/center/upload  <-- deviceinfo_center_upload.js
  '/deviceinfo/center/upload': async (query, request) => {
  const deviceName = String(query.deviceName || query.name || '').trim()

  if (!deviceName) {
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        msg: '缺少必要参数: deviceName',
      },
    })
  }

  const data = {
    deviceName,
  }

  return request(
    `/api/deviceinfo/center/upload`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /digitalAlbum/detail  <-- digitalAlbum_detail.js
  '/digitalAlbum/detail': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(
    `/api/vipmall/albumproduct/detail`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /digitalAlbum/ordering  <-- digitalAlbum_ordering.js
  '/digitalAlbum/ordering': (query, request) => {
  const data = {
    business: 'Album',
    paymentMethod: query.payment,
    digitalResources: JSON.stringify([
      {
        business: 'Album',
        resourceID: query.id,
        quantity: query.quantity,
      },
    ]),
    from: 'web',
  }
  return request(
    `/api/ordering/web/digital`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /digitalAlbum/purchased  <-- digitalAlbum_purchased.js
  '/digitalAlbum/purchased': (query, request) => {
  const data = {
    limit: query.limit || 30,
    offset: query.offset || 0,
    total: true,
  }
  return request(
    `/api/digitalAlbum/purchased`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /digitalAlbum/sales  <-- digitalAlbum_sales.js
  '/digitalAlbum/sales': (query, request) => {
  const data = {
    albumIds: query.ids,
  }
  return request(
    `/api/vipmall/albumproduct/album/query/sales`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /djRadio/top  <-- djRadio_top.js
  '/djRadio/top': (query, request) => {
  const data = {
    djRadioId: query.djRadioId || null, // 电台id
    sortIndex: query.sortIndex || 1, // 排序 1:播放数 2:点赞数 3：评论数 4：分享数 5：收藏数
    dataGapDays: query.dataGapDays || 7, // 天数 7:一周 30:一个月 90:三个月
    dataType: query.dataType || 3, // 未知
  }
  return request(
    '/api/expert/worksdata/works/top/get',
    data,
    createOption(query),
  )
},

  // /dj/banner  <-- dj_banner.js
  '/dj/banner': (query, request) => {
  return request(`/api/djradio/banner/get`, {}, createOption(query, 'weapi'))
},

  // /dj/category/excludehot  <-- dj_category_excludehot.js
  '/dj/category/excludehot': (query, request) => {
  return request(
    `/api/djradio/category/excludehot`,
    {},
    createOption(query, 'weapi'),
  )
},

  // /dj/category/recommend  <-- dj_category_recommend.js
  '/dj/category/recommend': (query, request) => {
  return request(
    `/api/djradio/home/category/recommend`,
    {},
    createOption(query, 'weapi'),
  )
},

  // /dj/catelist  <-- dj_catelist.js
  '/dj/catelist': (query, request) => {
  return request(`/api/djradio/category/get`, {}, createOption(query, 'weapi'))
},

  // /dj/detail  <-- dj_detail.js
  '/dj/detail': (query, request) => {
  const data = {
    id: query.rid,
  }
  return request(`/api/djradio/v2/get`, data, createOption(query, 'weapi'))
},

  // /dj/difm/all/style/channel  <-- dj_difm_all_style_channel.js
  '/dj/difm/all/style/channel': (query, request) => {
  const data = {
    sources: query.sources || '[0]',
  }
  return request(`/api/dj/difm/all/style/channel/v2`, data, createOption(query))
},

  // /dj/difm/channel/subscribe  <-- dj_difm_channel_subscribe.js
  '/dj/difm/channel/subscribe': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/dj/difm/channel/subscribe`, data, createOption(query))
},

  // /dj/difm/channel/unsubscribe  <-- dj_difm_channel_unsubscribe.js
  '/dj/difm/channel/unsubscribe': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/dj/difm/channel/unsubscribe`, data, createOption(query))
},

  // /dj/difm/playing/tracks/list  <-- dj_difm_playing_tracks_list.js
  '/dj/difm/playing/tracks/list': (query, request) => {
  const data = {
    limit: query.limit || 5,
    source: query.source || 0,
    channelId: query.channelId,
  }
  return request(`/api/dj/difm/playing/tracks/list`, data, createOption(query))
},

  // /dj/difm/subscribe/channels/get  <-- dj_difm_subscribe_channels_get.js
  '/dj/difm/subscribe/channels/get': (query, request) => {
  const data = {
    sources: query.sources || '[0]',
  }
  return request(
    `/api/dj/difm/subscribe/channels/get/v2`,
    data,
    createOption(query),
  )
},

  // /dj/hot  <-- dj_hot.js
  '/dj/hot': (query, request) => {
  const data = {
    limit: query.limit || 30,
    offset: query.offset || 0,
  }
  return request(`/api/djradio/hot/v1`, data, createOption(query, 'weapi'))
},

  // /dj/paygift  <-- dj_paygift.js
  '/dj/paygift': (query, request) => {
  const data = {
    limit: query.limit || 30,
    offset: query.offset || 0,
    _nmclfl: 1,
  }
  return request(
    `/api/djradio/home/paygift/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /dj/personalize/recommend  <-- dj_personalize_recommend.js
  '/dj/personalize/recommend': (query, request) => {
  return request(
    `/api/djradio/personalize/rcmd`,
    {
      limit: query.limit || 6,
    },
    createOption(query, 'weapi'),
  )
},

  // /dj/program/detail  <-- dj_program_detail.js
  '/dj/program/detail': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/dj/program/detail`, data, createOption(query, 'weapi'))
},

  // /dj/program/toplist  <-- dj_program_toplist.js
  '/dj/program/toplist': (query, request) => {
  const data = {
    limit: query.limit || 100,
    offset: query.offset || 0,
  }
  return request(`/api/program/toplist/v1`, data, createOption(query, 'weapi'))
},

  // /dj/program/toplist/hours  <-- dj_program_toplist_hours.js
  '/dj/program/toplist/hours': (query, request) => {
  const data = {
    limit: query.limit || 100,
    // 不支持 offset
  }
  return request(
    `/api/djprogram/toplist/hours`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /dj/radio/hot  <-- dj_radio_hot.js
  '/dj/radio/hot': (query, request) => {
  const data = {
    cateId: query.cateId,
    limit: query.limit || 30,
    offset: query.offset || 0,
  }
  return request(`/api/djradio/hot`, data, createOption(query, 'weapi'))
},

  // /dj/recommend  <-- dj_recommend.js
  '/dj/recommend': (query, request) => {
  return request(`/api/djradio/recommend/v1`, {}, createOption(query, 'weapi'))
},

  // /dj/recommend/type  <-- dj_recommend_type.js
  '/dj/recommend/type': (query, request) => {
  const data = {
    cateId: query.type,
  }
  return request(`/api/djradio/recommend`, data, createOption(query, 'weapi'))
},

  // /dj/sub  <-- dj_sub.js
  '/dj/sub': (query, request) => {
  query.t = query.t == 1 ? 'sub' : 'unsub'
  const data = {
    id: query.rid,
  }
  return request(`/api/djradio/${query.t}`, data, createOption(query, 'weapi'))
},

  // /dj/sublist  <-- dj_sublist.js
  '/dj/sublist': (query, request) => {
  const data = {
    limit: query.limit || 30,
    offset: query.offset || 0,
    total: true,
  }
  return request(`/api/djradio/get/subed`, data, createOption(query, 'weapi'))
},

  // /dj/subscriber  <-- dj_subscriber.js
  '/dj/subscriber': (query, request) => {
  const data = {
    time: query.time || '-1',
    id: query.id,
    limit: query.limit || '20',
    total: 'true',
  }
  return request(`/api/djradio/subscriber`, data, createOption(query, 'weapi'))
},

  // /dj/today/perfered  <-- dj_today_perfered.js
  '/dj/today/perfered': (query, request) => {
  const data = {
    page: query.page || 0,
  }
  return request(
    `/api/djradio/home/today/perfered`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /dj/toplist  <-- dj_toplist.js
  '/dj/toplist': (query, request) => {
  const data = {
    limit: query.limit || 100,
    offset: query.offset || 0,
    type: typeMap[query.type || 'new'] || '0', //0为新晋,1为热门
  }
  return request(`/api/djradio/toplist`, data, createOption(query, 'weapi'))
},

  // /dj/toplist/hours  <-- dj_toplist_hours.js
  '/dj/toplist/hours': (query, request) => {
  const data = {
    limit: query.limit || 100,
    // 不支持 offset
  }
  return request(`/api/dj/toplist/hours`, data, createOption(query, 'weapi'))
},

  // /dj/toplist/newcomer  <-- dj_toplist_newcomer.js
  '/dj/toplist/newcomer': (query, request) => {
  const data = {
    limit: query.limit || 100,
    offset: query.offset || 0,
  }
  return request(`/api/dj/toplist/newcomer`, data, createOption(query, 'weapi'))
},

  // /dj/toplist/pay  <-- dj_toplist_pay.js
  '/dj/toplist/pay': (query, request) => {
  const data = {
    limit: query.limit || 100,
    // 不支持 offset
  }
  return request(`/api/djradio/toplist/pay`, data, createOption(query, 'weapi'))
},

  // /dj/toplist/popular  <-- dj_toplist_popular.js
  '/dj/toplist/popular': (query, request) => {
  const data = {
    limit: query.limit || 100,
    // 不支持 offset
  }
  return request(`/api/dj/toplist/popular`, data, createOption(query, 'weapi'))
},

  // /event  <-- event.js
  '/event': (query, request) => {
  const data = {
    pagesize: query.pagesize || 20,
    lasttime: query.lasttime || -1,
  }
  return request(`/api/v1/event/get`, data, createOption(query, 'weapi'))
},

  // /event/del  <-- event_del.js
  '/event/del': (query, request) => {
  const data = {
    id: query.evId,
  }
  return request(`/api/event/delete`, data, createOption(query, 'weapi'))
},

  // /event/forward  <-- event_forward.js
  '/event/forward': (query, request) => {
  const data = {
    forwards: query.forwards,
    id: query.evId,
    eventUserId: query.uid,
  }
  return request(`/api/event/forward`, data, createOption(query))
},

  // /event/privacy  <-- event_privacy.js
  '/event/privacy': (query, request) => {
  const eventId = String(query.evId ?? '').trim()
  const rawPrivacy = String(query.privacy ?? '').trim()
  const privacy = Number(rawPrivacy)

  if (
    !eventId ||
    !rawPrivacy ||
    !Number.isInteger(privacy) ||
    !PRIVACY_VALUES.has(privacy)
  ) {
    return Promise.resolve({
      status: 400,
      body: {
        code: 400,
        message: 'evId is required and privacy must be one of 0, 1, 2, 6',
      },
      cookie: [],
    })
  }

  const data = {
    eventId,
    privacy,
  }

  return request(`/api/event/privacy/op`, data, createOption(query))
},

  // /fanscenter/basicinfo/age/get  <-- fanscenter_basicinfo_age_get.js
  '/fanscenter/basicinfo/age/get': (query, request) => {
  const data = {}
  return request(`/api/fanscenter/basicinfo/age/get`, data, createOption(query))
},

  // /fanscenter/basicinfo/gender/get  <-- fanscenter_basicinfo_gender_get.js
  '/fanscenter/basicinfo/gender/get': (query, request) => {
  const data = {}
  return request(
    `/api/fanscenter/basicinfo/gender/get`,
    data,
    createOption(query),
  )
},

  // /fanscenter/basicinfo/province/get  <-- fanscenter_basicinfo_province_get.js
  '/fanscenter/basicinfo/province/get': (query, request) => {
  const data = {}
  return request(
    `/api/fanscenter/basicinfo/province/get`,
    data,
    createOption(query),
  )
},

  // /fanscenter/overview/get  <-- fanscenter_overview_get.js
  '/fanscenter/overview/get': (query, request) => {
  const data = {}
  return request(`/api/fanscenter/overview/get`, data, createOption(query))
},

  // /fanscenter/trend/list  <-- fanscenter_trend_list.js
  '/fanscenter/trend/list': (query, request) => {
  const data = {
    startTime: query.startTime || Date.now() - 7 * 24 * 3600 * 1000,
    endTime: query.endTime || Date.now(),
    type: query.type || 0, //新增关注:0 新增取关:1
  }
  return request(`/api/fanscenter/trend/list`, data, createOption(query))
},

  // /fm/trash  <-- fm_trash.js
  '/fm/trash': (query, request) => {
  const data = {
    songId: query.id,
    alg: 'RT',
    time: query.time || 25,
  }
  return request(`/api/radio/trash/add`, data, createOption(query, 'weapi'))
},

  // /follow  <-- follow.js
  '/follow': (query, request) => {
  query.t = query.t == 1 ? 'follow' : 'delfollow'
  return request(
    `/api/user/${query.t}/${query.id}`,
    {},
    createOption(query, 'weapi'),
  )
},

  // /get/userids  <-- get_userids.js
  '/get/userids': (query, request) => {
  const data = {
    nicknames: query.nicknames,
  }
  return request(`/api/user/getUserIds`, data, createOption(query, 'weapi'))
},

  // /history/recommend/songs  <-- history_recommend_songs.js
  '/history/recommend/songs': (query, request) => {
  const data = {}
  return request(
    `/api/discovery/recommend/songs/history/recent`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /history/recommend/songs/detail  <-- history_recommend_songs_detail.js
  '/history/recommend/songs/detail': (query, request) => {
  const data = {
    date: query.date || '',
  }
  return request(
    `/api/discovery/recommend/songs/history/detail`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /homepage/block/page  <-- homepage_block_page.js
  '/homepage/block/page': (query, request) => {
  const data = { refresh: query.refresh || false, cursor: query.cursor }
  return request(`/api/homepage/block/page`, data, createOption(query, 'weapi'))
},

  // /homepage/dragon/ball  <-- homepage_dragon_ball.js
  '/homepage/dragon/ball': (query, request) => {
  const data = {}

  return request(`/api/homepage/dragon/ball/static`, data, createOption(query))
},

  // /hot/topic  <-- hot_topic.js
  '/hot/topic': (query, request) => {
  const data = {
    limit: query.limit || 20,
    offset: query.offset || 0,
  }
  return request(`/api/act/hot`, data, createOption(query, 'weapi'))
},

  // /hug/comment  <-- hug_comment.js
  '/hug/comment': (query, request) => {
  query.type = resourceTypeMap[query.type || 0]
  const threadId = query.type + query.sid
  const data = {
    targetUserId: query.uid,
    commentId: query.cid,
    threadId: threadId,
  }
  return request(
    `/api/v2/resource/comments/hug/listener`,
    data,
    createOption(query),
  )
},

  // /lbs/city/code  <-- lbs_city_code.js
  '/lbs/city/code': (query, request) => {
  const data = {
    bizCode: query.bizCode || '',
  }
  return request(`/api/lbs/city/code`, data, createOption(query))
},

  // /like  <-- like.js
  '/like': (query, request) => {
  query.like = query.like == 'false' ? false : true
  const data = {
    alg: 'itembased',
    trackId: query.id,
    like: query.like,
    time: '3',
  }
  return request(`/api/radio/like`, data, createOption(query, 'weapi'))
},

  // /like/v1  <-- like_v1.js
  '/like/v1': (query, request) => {
  query.like = query.like == 'false' ? false : true
  const data = {
    alg: 'itembased',
    trackId: query.id,
    like: query.like,
    time: '3',
  }
  return request(`/api/v1/radio/like`, data, createOption(query, 'xeapi', 'v3'))
},

  // /likelist  <-- likelist.js
  '/likelist': (query, request) => {
  const data = {
    uid: query.uid,
  }
  return request(`/api/song/like/get`, data, createOption(query))
},

  // /listen/data/realtime/report  <-- listen_data_realtime_report.js
  '/listen/data/realtime/report': (query, request) => {
  return request(
    `/api/content/activity/listen/data/realtime/report`,
    {
      type: query.type || 'week', //周 week 月 month
    },
    createOption(query),
  )
},

  // /listen/data/report  <-- listen_data_report.js
  '/listen/data/report': (query, request) => {
  return request(
    `/api/content/activity/listen/data/report`,
    {
      type: query.type || 'week', //周 week 月 month 年 year
      endTime: query.endTime, // 不填就是本周/月的
    },
    createOption(query),
  )
},

  // /listen/data/song/play/rank  <-- listen_data_song_play_rank.js
  '/listen/data/song/play/rank': (query, request) => {
  return request(
    `/api/content/activity/listen/data/song/play/rank`,
    {
      type: query.type || 'month', //周 week 月 month
      endTime: query.endTime, // 不填就是本周/月的
    },
    createOption(query),
  )
},

  // /listen/data/today/song  <-- listen_data_today_song.js
  '/listen/data/today/song': (query, request) => {
  return request(
    `/api/content/activity/listen/data/today/song/play/rank`,
    {},
    createOption(query),
  )
},

  // /listen/data/total  <-- listen_data_total.js
  '/listen/data/total': (query, request) => {
  return request(
    `/api/content/activity/listen/data/total`,
    {},
    createOption(query),
  )
},

  // /listen/data/year/report  <-- listen_data_year_report.js
  '/listen/data/year/report': (query, request) => {
  return request(
    `/api/content/activity/listen/data/year/report`,
    {},
    createOption(query),
  )
},

  // /listentogether/accept  <-- listentogether_accept.js
  '/listentogether/accept': (query, request) => {
  const data = {
    refer: 'inbox_invite',
    roomId: query.roomId,
    inviterId: query.inviterId,
  }
  return request(
    `/api/listen/together/play/invitation/accept`,
    data,
    createOption(query),
  )
},

  // /listentogether/end  <-- listentogether_end.js
  '/listentogether/end': (query, request) => {
  const data = {
    roomId: query.roomId,
  }
  return request(`/api/listen/together/end/v2`, data, createOption(query))
},

  // /listentogether/heatbeat  <-- listentogether_heatbeat.js
  '/listentogether/heatbeat': (query, request) => {
  const data = {
    roomId: query.roomId,
    songId: query.songId,
    playStatus: query.playStatus,
    progress: query.progress,
  }
  return request(`/api/listen/together/heartbeat`, data, createOption(query))
},

  // /listentogether/play/command  <-- listentogether_play_command.js
  '/listentogether/play/command': (query, request) => {
  const data = {
    roomId: query.roomId,
    commandInfo: JSON.stringify({
      commandType: query.commandType,
      progress: query.progress || 0,
      playStatus: query.playStatus,
      formerSongId: query.formerSongId,
      targetSongId: query.targetSongId,
      clientSeq: query.clientSeq,
    }),
  }
  return request(
    `/api/listen/together/play/command/report`,
    data,
    createOption(query),
  )
},

  // /listentogether/room/check  <-- listentogether_room_check.js
  '/listentogether/room/check': (query, request) => {
  const data = {
    roomId: query.roomId,
  }
  return request(`/api/listen/together/room/check`, data, createOption(query))
},

  // /listentogether/room/create  <-- listentogether_room_create.js
  '/listentogether/room/create': (query, request) => {
  const data = {
    refer: 'songplay_more',
  }
  return request(`/api/listen/together/room/create`, data, createOption(query))
},

  // /listentogether/status  <-- listentogether_status.js
  '/listentogether/status': (query, request) => {
  return request(
    `/api/listen/together/status/get`,
    {},
    createOption(query, 'weapi'),
  )
},

  // /listentogether/sync/list/command  <-- listentogether_sync_list_command.js
  '/listentogether/sync/list/command': (query, request) => {
  const data = {
    roomId: query.roomId,
    playlistParam: JSON.stringify({
      commandType: query.commandType,
      version: [
        {
          userId: query.userId,
          version: query.version,
        },
      ],
      anchorSongId: '',
      anchorPosition: -1,
      randomList: query.randomList.split(','),
      displayList: query.displayList.split(','),
    }),
  }
  return request(
    `/api/listen/together/sync/list/command/report`,
    data,
    createOption(query),
  )
},

  // /listentogether/sync/playlist/get  <-- listentogether_sync_playlist_get.js
  '/listentogether/sync/playlist/get': (query, request) => {
  const data = {
    roomId: query.roomId,
  }
  return request(
    `/api/listen/together/sync/playlist/get`,
    data,
    createOption(query),
  )
},

  // /login  <-- login.js
  '/login': async (query, request) => {
  const data = {
    type: '0',
    https: 'true',
    username: query.email,
    password: query.md5_password || CryptoJS.MD5(query.password).toString(),
    rememberLogin: 'true',
  }
  let result = await request(`/api/w/login`, data, createOption(query))
  if (result.body.code === 502) {
    return {
      status: 200,
      body: {
        msg: '账号或密码错误',
        code: 502,
        message: '账号或密码错误',
      },
    }
  }
  if (result.body.code === 200) {
    result = {
      status: 200,
      body: {
        ...JSON.parse(
          JSON.stringify(result.body).replace(
            /avatarImgId_str/g,
            'avatarImgIdStr',
          ),
        ),
        cookie: result.cookie.join(';'),
      },
      cookie: result.cookie,
    }
  }
  return result
},

  // /login/cellphone  <-- login_cellphone.js
  '/login/cellphone': async (query, request) => {
  const data = {
    type: '1',
    https: 'true',
    phone: query.phone,
    countrycode: query.countrycode || '86',
    captcha: query.captcha,
    [query.captcha ? 'captcha' : 'password']: query.captcha
      ? query.captcha
      : query.md5_password || CryptoJS.MD5(query.password).toString(),
    remember: 'true',
    secureCaptcha: query.sca || '',
  }
  let result = await request(
    `/api/w/login/cellphone`,
    data,
    createOption(query, 'weapi'),
  )

  if (result.body.code === 200) {
    result = {
      status: 200,
      body: {
        ...JSON.parse(
          JSON.stringify(result.body).replace(
            /avatarImgId_str/g,
            'avatarImgIdStr',
          ),
        ),
        cookie: result.cookie.join(';'),
      },
      cookie: result.cookie,
    }
  }
  return result
},

  // /login/qr/check  <-- login_qr_check.js
  '/login/qr/check': async (query, request) => {
  const data = {
    key: query.key,
    type: 3,
  }
  try {
    const result = await request(
      `/api/login/qrcode/client/login`,
      data,
      createOption(query),
    )
    return {
      status: 200,
      body: {
        ...result.body,
        cookie: (result.cookie || []).join(';'),
      },
      cookie: result.cookie || [],
    }
  } catch (error) {
    return {
      status: 200,
      body: {},
      cookie: [],
    }
  }
},

  // /login/qr/key  <-- login_qr_key.js
  '/login/qr/key': async (query, request) => {
  const data = {
    type: 3,
  }
  const result = await request(
    `/api/login/qrcode/unikey`,
    data,
    createOption(query),
  )
  return {
    status: 200,
    body: {
      data: result.body,
      code: 200,
    },
    cookie: result.cookie,
  }
},

  // /login/refresh  <-- login_refresh.js
  '/login/refresh': async (query, request) => {
  let result = await request(
    `/api/login/token/refresh`,
    {},
    createOption(query),
  )
  if (result.body.code === 200) {
    result = {
      status: 200,
      body: {
        ...result.body,
        cookie: result.cookie.join(';'),
      },
      cookie: result.cookie,
    }
  }
  return result
},

  // /login/status  <-- login_status.js
  '/login/status': async (query, request) => {
  const data = {}
  let result = await request(
    `/api/w/nuser/account/get`,
    data,
    createOption(query, 'weapi'),
  )
  if (result.body.code === 200) {
    result = {
      status: 200,
      body: {
        data: {
          ...result.body,
        },
      },
      cookie: result.cookie,
    }
  }
  return result
},

  // /logout  <-- logout.js
  '/logout': (query, request) => {
  return request(`/api/logout`, {}, createOption(query))
},

  // /lyric  <-- lyric.js
  '/lyric': (query, request) => {
  const data = {
    id: query.id,
    tv: -1,
    lv: -1,
    rv: -1,
    kv: -1,
    _nmclfl: 1,
  }
  return request(`/api/song/lyric`, data, createOption(query))
},

  // /lyric/new  <-- lyric_new.js
  '/lyric/new': (query, request) => {
  const data = {
    id: query.id,
    cp: false,
    tv: 0,
    lv: 0,
    rv: 0,
    kv: 0,
    yv: 0,
    ytv: 0,
    yrv: 0,
  }
  return request(`/api/song/lyric/v1`, data, createOption(query))
},

  // /middle/play/do/lottery  <-- middle_play_do_lottery.js
  '/middle/play/do/lottery': (query, request) => {
  const data = {
    activityId: query.activityId || '6501202',
    drawCount: query.drawCount || '1',
  }
  return request(
    `/api/middle/play/do/lottery`,
    data,
    createOption(query, 'eapi', 'v2'),
  )
},

  // /middle/play/lottery/remain/chance  <-- middle_play_lottery_remain_chance.js
  '/middle/play/lottery/remain/chance': (query, request) => {
  const data = {
    activityId: query.activityId || '6501202',
  }
  return request(
    `/api/middle/play/lottery/remain/chance`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /mlog/music/rcmd  <-- mlog_music_rcmd.js
  '/mlog/music/rcmd': (query, request) => {
  const data = {
    id: query.mvid || 0,
    type: 2,
    rcmdType: 20,
    limit: query.limit || 10,
    extInfo: JSON.stringify({ songId: query.songid }),
  }
  return request(`/api/mlog/rcmd/feed/list`, data, createOption(query))
},

  // /mlog/to/video  <-- mlog_to_video.js
  '/mlog/to/video': (query, request) => {
  const data = {
    mlogId: query.id,
  }
  return request(
    `/api/mlog/video/convert/id`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /mlog/url  <-- mlog_url.js
  '/mlog/url': (query, request) => {
  const data = {
    id: query.id,
    resolution: query.res || 1080,
    type: 1,
  }
  return request(`/api/mlog/detail/v1`, data, createOption(query, 'weapi'))
},

  // /msg/comments  <-- msg_comments.js
  '/msg/comments': (query, request) => {
  const data = {
    beforeTime: query.before || '-1',
    limit: query.limit || 30,
    total: 'true',
    uid: query.uid,
  }

  return request(
    `/api/v1/user/comments/${query.uid}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /msg/forwards  <-- msg_forwards.js
  '/msg/forwards': (query, request) => {
  const data = {
    offset: query.offset || 0,
    limit: query.limit || 30,
    total: 'true',
  }
  return request(`/api/forwards/get`, data, createOption(query, 'weapi'))
},

  // /msg/notices  <-- msg_notices.js
  '/msg/notices': (query, request) => {
  const data = {
    limit: query.limit || 30,
    time: query.lasttime || -1,
  }
  return request(`/api/msg/notices`, data, createOption(query, 'weapi'))
},

  // /msg/private  <-- msg_private.js
  '/msg/private': (query, request) => {
  const data = {
    offset: query.offset || 0,
    limit: query.limit || 30,
    total: 'true',
  }
  return request(`/api/msg/private/users`, data, createOption(query, 'weapi'))
},

  // /msg/private/history  <-- msg_private_history.js
  '/msg/private/history': (query, request) => {
  const data = {
    userId: query.uid,
    limit: query.limit || 30,
    time: query.before || 0,
    total: 'true',
  }
  return request(`/api/msg/private/history`, data, createOption(query, 'weapi'))
},

  // /msg/recentcontact  <-- msg_recentcontact.js
  '/msg/recentcontact': (query, request) => {
  const data = {}
  return request(
    `/api/msg/recentcontact/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /music/first/listen/info  <-- music_first_listen_info.js
  '/music/first/listen/info': (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(
    `/api/content/activity/music/first/listen/info`,
    data,
    createOption(query),
  )
},

  // /musician/cloudbean  <-- musician_cloudbean.js
  '/musician/cloudbean': (query, request) => {
  const data = {}
  return request(`/api/cloudbean/get`, data, createOption(query, 'weapi'))
},

  // /musician/cloudbean/obtain  <-- musician_cloudbean_obtain.js
  '/musician/cloudbean/obtain': (query, request) => {
  const data = {
    userMissionId: query.id,
    period: query.period,
  }
  return request(
    `/api/nmusician/workbench/mission/reward/obtain/new`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /musician/data/overview  <-- musician_data_overview.js
  '/musician/data/overview': (query, request) => {
  const data = {}
  return request(
    `/api/creator/musician/statistic/data/overview/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /musician/play/trend  <-- musician_play_trend.js
  '/musician/play/trend': (query, request) => {
  const data = {
    startTime: query.startTime,
    endTime: query.endTime,
  }
  return request(
    `/api/creator/musician/play/count/statistic/data/trend/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /musician/sign  <-- musician_sign.js
  '/musician/sign': (query, request) => {
  const data = {}
  return request(`/api/creator/user/access`, data, createOption(query, 'weapi'))
},

  // /musician/tasks  <-- musician_tasks.js
  '/musician/tasks': (query, request) => {
  const data = {}
  return request(
    `/api/nmusician/workbench/mission/cycle/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /musician/tasks/new  <-- musician_tasks_new.js
  '/musician/tasks/new': (query, request) => {
  const data = {}
  return request(
    `/api/nmusician/workbench/mission/stage/list `,
    data,
    createOption(query, 'weapi'),
  )
},

  // /musician/vip/tasks  <-- musician_vip_tasks.js
  '/musician/vip/tasks': (query, request) => {
  const data = {}
  return request(
    `/api/nmusician/workbench/special/right/vip/info`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /mv/all  <-- mv_all.js
  '/mv/all': (query, request) => {
  const data = {
    tags: JSON.stringify({
      地区: query.area || '全部',
      类型: query.type || '全部',
      排序: query.order || '上升最快',
    }),
    offset: query.offset || 0,
    total: 'true',
    limit: query.limit || 30,
  }
  return request(`/api/mv/all`, data, createOption(query))
},

  // /mv/detail  <-- mv_detail.js
  '/mv/detail': (query, request) => {
  const data = {
    id: query.mvid,
  }
  return request(`/api/v1/mv/detail`, data, createOption(query, 'weapi'))
},

  // /mv/detail/info  <-- mv_detail_info.js
  '/mv/detail/info': (query, request) => {
  const data = {
    threadid: `R_MV_5_${query.mvid}`,
    composeliked: true,
  }
  return request(
    `/api/comment/commentthread/info`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /mv/exclusive/rcmd  <-- mv_exclusive_rcmd.js
  '/mv/exclusive/rcmd': (query, request) => {
  const data = {
    offset: query.offset || 0,
    limit: query.limit || 30,
  }
  return request(`/api/mv/exclusive/rcmd`, data, createOption(query))
},

  // /mv/first  <-- mv_first.js
  '/mv/first': (query, request) => {
  const data = {
    // 'offset': query.offset || 0,
    area: query.area || '',
    limit: query.limit || 30,
    total: true,
  }
  return request(`/api/mv/first`, data, createOption(query))
},

  // /mv/sub  <-- mv_sub.js
  '/mv/sub': (query, request) => {
  query.t = query.t == 1 ? 'sub' : 'unsub'
  const data = {
    mvId: query.mvid,
    mvIds: '["' + query.mvid + '"]',
  }
  return request(`/api/mv/${query.t}`, data, createOption(query, 'weapi'))
},

  // /mv/sublist  <-- mv_sublist.js
  '/mv/sublist': (query, request) => {
  const data = {
    limit: query.limit || 25,
    offset: query.offset || 0,
    total: true,
  }
  return request(
    `/api/cloudvideo/allvideo/sublist`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /mv/url  <-- mv_url.js
  '/mv/url': (query, request) => {
  const data = {
    id: query.id,
    r: query.r || 1080,
  }
  return request(
    `/api/song/enhance/play/mv/url`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /nickname/check  <-- nickname_check.js
  '/nickname/check': (query, request) => {
  const data = {
    nickname: query.nickname,
  }
  return request(`/api/nickname/duplicated`, data, createOption(query, 'weapi'))
},

  // /personal/fm  <-- personal_fm.js
  '/personal/fm': (query, request) => {
  return request(`/api/v1/radio/get`, {}, createOption(query, 'weapi'))
},

  // /personal/fm/mode  <-- personal_fm_mode.js
  '/personal/fm/mode': (query, request) => {
  const data = {
    mode: query.mode,
    subMode: query.submode,
    limit: query.limit || 3,
  }
  return request(`/api/v1/radio/get`, data, createOption(query))
},

  // /personalized  <-- personalized.js
  '/personalized': (query, request) => {
  const data = {
    limit: query.limit || 30,
    // offset: query.offset || 0,
    total: true,
    n: 1000,
  }
  return request(
    `/api/personalized/playlist`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /personalized/djprogram  <-- personalized_djprogram.js
  '/personalized/djprogram': (query, request) => {
  return request(
    `/api/personalized/djprogram`,
    {},
    createOption(query, 'weapi'),
  )
},

  // /personalized/mv  <-- personalized_mv.js
  '/personalized/mv': (query, request) => {
  return request(`/api/personalized/mv`, {}, createOption(query, 'weapi'))
},

  // /personalized/newsong  <-- personalized_newsong.js
  '/personalized/newsong': (query, request) => {
  const data = {
    type: 'recommend',
    limit: query.limit || 10,
    areaId: query.areaId || 0,
  }
  return request(
    `/api/personalized/newsong`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /personalized/privatecontent  <-- personalized_privatecontent.js
  '/personalized/privatecontent': (query, request) => {
  return request(
    `/api/personalized/privatecontent`,
    {},
    createOption(query, 'weapi'),
  )
},

  // /personalized/privatecontent/list  <-- personalized_privatecontent_list.js
  '/personalized/privatecontent/list': (query, request) => {
  const data = {
    offset: query.offset || 0,
    total: 'true',
    limit: query.limit || 60,
  }
  return request(
    `/api/v2/privatecontent/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /pl/count  <-- pl_count.js
  '/pl/count': (query, request) => {
  const data = {}
  return request(`/api/pl/count`, data, createOption(query, 'weapi'))
},

  // /playlist/category/list  <-- playlist_category_list.js
  '/playlist/category/list': (query, request) => {
  const data = {
    cat: query.cat || '全部',
    limit: query.limit || 24,
    newStyle: true,
  }
  return request(`/api/playlist/category/list`, data, createOption(query))
},

  // /playlist/catlist  <-- playlist_catlist.js
  '/playlist/catlist': (query, request) => {
  return request(`/api/playlist/catalogue`, {}, createOption(query, 'eapi'))
},

  // /playlist/create  <-- playlist_create.js
  '/playlist/create': (query, request) => {
  const data = {
    name: query.name,
    privacy: query.privacy || '0', // 0 普通歌单, 10 隐私歌单
    type: query.type || 'NORMAL', // 默认 NORMAL, VIDEO 视频歌单, SHARED 共享歌单
  }
  return request(`/api/playlist/create`, data, createOption(query, 'weapi'))
},

  // /playlist/delete  <-- playlist_delete.js
  '/playlist/delete': (query, request) => {
  const data = {
    ids: '[' + query.id + ']',
  }
  return request(`/api/playlist/remove`, data, createOption(query, 'weapi'))
},

  // /playlist/desc/update  <-- playlist_desc_update.js
  '/playlist/desc/update': (query, request) => {
  const data = {
    id: query.id,
    desc: query.desc,
  }
  return request(`/api/playlist/desc/update`, data, createOption(query))
},

  // /playlist/detail  <-- playlist_detail.js
  '/playlist/detail': (query, request) => {
  const data = {
    id: query.id,
    n: 100000,
    s: query.s || 8,
  }
  return request(`/api/v6/playlist/detail`, data, createOption(query))
},

  // /playlist/detail/dynamic  <-- playlist_detail_dynamic.js
  '/playlist/detail/dynamic': (query, request) => {
  const data = {
    id: query.id,
    n: 100000,
    s: query.s || 8,
  }
  return request(`/api/playlist/detail/dynamic`, data, createOption(query))
},

  // /playlist/detail/rcmd/get  <-- playlist_detail_rcmd_get.js
  '/playlist/detail/rcmd/get': (query, request) => {
  const data = {
    scene: 'playlist_head',
    playlistId: query.id,
    newStyle: 'true',
  }
  return request(`/api/playlist/detail/rcmd/get`, data, createOption(query))
},

  // /playlist/highquality/tags  <-- playlist_highquality_tags.js
  '/playlist/highquality/tags': (query, request) => {
  const data = {}
  return request(
    `/api/playlist/highquality/tags`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /playlist/hot  <-- playlist_hot.js
  '/playlist/hot': (query, request) => {
  return request(`/api/playlist/hottags`, {}, createOption(query, 'weapi'))
},

  // /playlist/import/name/task/create  <-- playlist_import_name_task_create.js
  '/playlist/import/name/task/create': (query, request) => {
  let data = {
    importStarPlaylist: query.importStarPlaylist || false, // 导入我喜欢的音乐
  }

  if (query.local) {
    // 元数据导入
    let local = JSON.parse(query.local)
    let multiSongs = JSON.stringify(
      local.map(function (e) {
        return {
          songName: e.name,
          artistName: e.artist,
          albumName: e.album,
        }
      }),
    )
    data = {
      ...data,
      multiSongs: multiSongs,
    }
  } else {
    let playlistName = // 歌单名称
      query.playlistName || '导入音乐 '.concat(new Date().toLocaleString())
    let songs = ''
    if (query.text) {
      // 文字导入
      songs = JSON.stringify([
        {
          name: playlistName,
          type: '',
          url: encodeURI('rpc://playlist/import?text='.concat(query.text)),
        },
      ])
    }

    if (query.link) {
      // 链接导入
      let link = JSON.parse(query.link)
      songs = JSON.stringify(
        link.map(function (e) {
          return { name: playlistName, type: '', url: encodeURI(e) }
        }),
      )
    }
    data = {
      ...data,
      playlistName: playlistName,
      createBusinessCode: undefined,
      extParam: undefined,
      taskIdForLog: '',
      songs: songs,
    }
  }
  return request(
    `/api/playlist/import/name/task/create`,
    data,
    createOption(query),
  )
},

  // /playlist/import/task/status  <-- playlist_import_task_status.js
  '/playlist/import/task/status': (query, request) => {
  return request(
    `/api/playlist/import/task/status/v2`,
    {
      taskIds: JSON.stringify([query.id]),
    },
    createOption(query),
  )
},

  // /playlist/mylike  <-- playlist_mylike.js
  '/playlist/mylike': (query, request) => {
  const data = {
    time: query.time || '-1',
    limit: query.limit || '12',
  }
  return request(
    `/api/mlog/playlist/mylike/bytime/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /playlist/name/update  <-- playlist_name_update.js
  '/playlist/name/update': (query, request) => {
  const data = {
    id: query.id,
    name: query.name,
  }
  return request(`/api/playlist/update/name`, data, createOption(query))
},

  // /playlist/order/update  <-- playlist_order_update.js
  '/playlist/order/update': (query, request) => {
  const data = {
    ids: query.ids,
  }
  return request(
    `/api/playlist/order/update`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /playlist/privacy  <-- playlist_privacy.js
  '/playlist/privacy': (query, request) => {
  const data = {
    id: query.id,
    privacy: 0,
  }
  return request(`/api/playlist/update/privacy`, data, createOption(query))
},

  // /playlist/subscribe  <-- playlist_subscribe.js
  '/playlist/subscribe': (query, request) => {
  const path = query.t == 1 ? 'subscribe' : 'unsubscribe'
  const data = {
    id: query.id,
    ...(query.t === 1
      ? { checkToken: query.checkToken || APP_CONF.checkToken }
      : {}),
  }
  query.checkToken = 'v2' // 强制开启checkToken
  return request(`/api/playlist/${path}`, data, createOption(query, 'eapi'))
},

  // /playlist/subscribers  <-- playlist_subscribers.js
  '/playlist/subscribers': (query, request) => {
  const data = {
    id: query.id,
    limit: query.limit || 20,
    offset: query.offset || 0,
  }
  return request(`/api/playlist/subscribers`, data, createOption(query))
},

  // /playlist/tags/update  <-- playlist_tags_update.js
  '/playlist/tags/update': (query, request) => {
  const data = {
    id: query.id,
    tags: query.tags,
  }
  return request(`/api/playlist/tags/update`, data, createOption(query))
},

  // /playlist/track/all  <-- playlist_track_all.js
  '/playlist/track/all': (query, request) => {
  const data = {
    id: query.id,
    n: 100000,
    s: query.s || 8,
  }
  //不放在data里面避免请求带上无用的数据
  let limit = parseInt(query.limit) || 1000
  let offset = parseInt(query.offset) || 0

  return request(`/api/v6/playlist/detail`, data, createOption(query)).then(
    (res) => {
      let trackIds = res.body.playlist.trackIds
      let idsData = {
        c:
          '[' +
          trackIds
            .slice(offset, offset + limit)
            .map((item) => '{"id":' + item.id + '}')
            .join(',') +
          ']',
      }

      return request(`/api/v3/song/detail`, idsData, createOption(query))
    },
  )
},

  // /playlist/track/delete  <-- playlist_track_delete.js
  '/playlist/track/delete': async (query, request) => {
  query.ids = query.ids || ''
  const data = {
    id: query.id,
    tracks: JSON.stringify(
      query.ids.split(',').map((item) => {
        return { type: 3, id: item }
      }),
    ),
  }

  return request(
    `/api/playlist/track/delete`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /playlist/tracks  <-- playlist_tracks.js
  '/playlist/tracks': async (query, request) => {
  //
  const tracks = query.tracks.split(',')
  const data = {
    op: query.op, // del,add
    pid: query.pid, // 歌单id
    trackIds: JSON.stringify(tracks), // 歌曲id
    imme: 'true',
  }

  try {
    const res = await request(
      `/api/playlist/manipulate/tracks`,
      data,
      createOption(query),
    )
    return {
      status: 200,
      body: {
        ...res,
      },
    }
  } catch (error) {
    if (error.body.code === 512) {
      return request(
        `/api/playlist/manipulate/tracks`,
        {
          op: query.op, // del,add
          pid: query.pid, // 歌单id
          trackIds: JSON.stringify([...tracks, ...tracks]),
          imme: 'true',
        },
        createOption(query),
      )
    } else {
      return {
        status: 200,
        body: error.body,
      }
    }
  }
},

  // /playlist/update  <-- playlist_update.js
  '/playlist/update': (query, request) => {
  query.desc = query.desc || ''
  query.tags = query.tags || ''
  const data = {
    '/api/playlist/desc/update': `{"id":${query.id},"desc":"${query.desc}"}`,
    '/api/playlist/tags/update': `{"id":${query.id},"tags":"${query.tags}"}`,
    '/api/playlist/update/name': `{"id":${query.id},"name":"${query.name}"}`,
  }
  return request(`/api/batch`, data, createOption(query))
},

  // /playlist/update/playcount  <-- playlist_update_playcount.js
  '/playlist/update/playcount': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/playlist/update/playcount`, data, createOption(query))
},

  // /playlist/video/recent  <-- playlist_video_recent.js
  '/playlist/video/recent': (query, request) => {
  const data = {}
  return request(
    `/api/playlist/video/recent`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /playmode/intelligence/list  <-- playmode_intelligence_list.js
  '/playmode/intelligence/list': (query, request) => {
  const data = {
    songId: query.id,
    type: 'fromPlayOne',
    playlistId: query.pid,
    startMusicId: query.sid || query.id,
    count: query.count || 1,
  }
  return request(`/api/playmode/intelligence/list`, data, createOption(query))
},

  // /playmode/song/vector  <-- playmode_song_vector.js
  '/playmode/song/vector': (query, request) => {
  const data = {
    ids: query.ids,
  }
  return request(`/api/playmode/song/vector/get`, data, createOption(query))
},

  // /program/recommend  <-- program_recommend.js
  '/program/recommend': (query, request) => {
  const data = {
    cateId: query.type,
    limit: query.limit || 10,
    offset: query.offset || 0,
  }
  return request(
    `/api/program/recommend/v1`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /radio/sport/get  <-- radio_sport_get.js
  '/radio/sport/get': (query, request) => {
  const data = {
    bpm: query.bpm || 50,
  }
  return request(`/api/radio/sport/get`, data, createOption(query))
},

  // /rebind  <-- rebind.js
  '/rebind': (query, request) => {
  const data = {
    captcha: query.captcha,
    phone: query.phone,
    oldcaptcha: query.oldcaptcha,
    ctcode: query.ctcode || '86',
  }
  return request(
    `/api/user/replaceCellphone`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /recent/listen/list  <-- recent_listen_list.js
  '/recent/listen/list': (query, request) => {
  const data = {}
  return request(`/api/pc/recent/listen/list`, data, createOption(query))
},

  // /recommend/resource  <-- recommend_resource.js
  '/recommend/resource': (query, request) => {
  return request(
    `/api/v1/discovery/recommend/resource`,
    {},
    createOption(query, 'weapi'),
  )
},

  // /recommend/songs  <-- recommend_songs.js
  '/recommend/songs': (query, request) => {
  const data = {
    afresh: query.afresh,
  }
  return request(
    `/api/v3/discovery/recommend/songs`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /recommend/songs/dislike  <-- recommend_songs_dislike.js
  '/recommend/songs/dislike': (query, request) => {
  const data = {
    resId: query.id, // 日推歌曲id
    resType: 4,
    sceneType: 1,
  }
  return request(
    `/api/v2/discovery/recommend/dislike`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /record/recent/album  <-- record_recent_album.js
  '/record/recent/album': (query, request) => {
  const data = {
    limit: query.limit || 100,
  }
  return request(
    `/api/play-record/album/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /record/recent/dj  <-- record_recent_dj.js
  '/record/recent/dj': (query, request) => {
  const data = {
    limit: query.limit || 100,
  }
  return request(
    `/api/play-record/djradio/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /record/recent/playlist  <-- record_recent_playlist.js
  '/record/recent/playlist': (query, request) => {
  const data = {
    limit: query.limit || 100,
  }
  return request(
    `/api/play-record/playlist/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /record/recent/song  <-- record_recent_song.js
  '/record/recent/song': (query, request) => {
  const data = {
    limit: query.limit || 100,
  }
  return request(
    `/api/play-record/song/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /record/recent/video  <-- record_recent_video.js
  '/record/recent/video': (query, request) => {
  const data = {
    limit: query.limit || 100,
  }
  return request(
    `/api/play-record/newvideo/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /record/recent/voice  <-- record_recent_voice.js
  '/record/recent/voice': (query, request) => {
  const data = {
    limit: query.limit || 100,
  }
  return request(
    `/api/play-record/voice/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /register/cellphone  <-- register_cellphone.js
  '/register/cellphone': (query, request) => {
  const data = {
    captcha: query.captcha,
    phone: query.phone,
    password: CryptoJS.MD5(query.password).toString(),
    nickname: query.nickname,
    countrycode: query.countrycode || '86',
    force: 'false',
  }
  return request(`/api/w/register/cellphone`, data, createOption(query))
},

  // /related/allvideo  <-- related_allvideo.js
  '/related/allvideo': (query, request) => {
  const data = {
    id: query.id,
    type: /^\d+$/.test(query.id) ? 0 : 1,
  }
  return request(
    `/api/cloudvideo/v1/allvideo/rcmd`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /relay/play/state/submit  <-- relay_play_state_submit.js
  '/relay/play/state/submit': (query, request) => {
  const {
    id,
    sessionId,
    progress = 0,
    playMode = 'list_loop',
    type = 'song',
  } = query

  if (!id) {
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        msg: '缺少必要参数：id',
      },
    })
  }

  const playStateSubmitReq = JSON.stringify({
    resource: {
      id: String(id),
      type: type,
    },
    progress: Number(progress) || 0,
    sessionId: sessionId || generateSessionId(),
    playMode: playMode,
  })

  const data = {
    playStateSubmitReq: playStateSubmitReq,
  }

  return request(
    '/api/relay/play/state/submit',
    data,
    createOption(query, 'weapi'),
  )
},

  // /rep/ugc/activity/collect  <-- rep_ugc_activity_collect.js
  '/rep/ugc/activity/collect': (query, request) => {
  const data = {
    activityId: query.activityId || '5001',
  }
  return request(
    `/api/rep/ugc/activity/collect`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /rep/ugc/activity/get  <-- rep_ugc_activity_get.js
  '/rep/ugc/activity/get': (query, request) => {
  return request(`/api/rep/ugc/activity/get`, {}, createOption(query, 'eapi'))
},

  // /rep/ugc/exam/info/get  <-- rep_ugc_exam_info_get.js
  '/rep/ugc/exam/info/get': (query, request) => {
  if (!query.examType)
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        message: '参数不足',
      },
    })
  const data = {
    examType: query.examType,
  }
  return request(
    '/api/rep/ugc/exam/info/get',
    data,
    createOption(query, 'eapi'),
  )
},

  // /rep/ugc/exam/question/single/get  <-- rep_ugc_exam_question_single_get.js
  '/rep/ugc/exam/question/single/get': (query, request) => {
  if (!query.examType || !query.taskId)
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        message: '参数不足',
      },
    })
  const data = {
    examType: query.examType,
    taskId: query.taskId,
  }
  return request(
    '/api/rep/ugc/exam/question/single/get',
    data,
    createOption(query, 'eapi'),
  )
},

  // /rep/ugc/exam/result/get  <-- rep_ugc_exam_result_get.js
  '/rep/ugc/exam/result/get': (query, request) => {
  if (!query.examType || !query.taskId)
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        message: '参数不足',
      },
    })
  const data = {
    examType: query.examType,
    taskId: query.taskId,
  }
  return request(
    '/api/rep/ugc/exam/result/get',
    data,
    createOption(query, 'eapi'),
  )
},

  // /rep/ugc/exam/start  <-- rep_ugc_exam_start.js
  '/rep/ugc/exam/start': (query, request) => {
  if (!query.examType)
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        message: '参数不足',
      },
    })
  const data = {
    examType: query.examType,
  }
  return request('/api/rep/ugc/exam/start', data, createOption(query, 'eapi'))
},

  // /rep/ugc/exam/submit  <-- rep_ugc_exam_submit.js
  '/rep/ugc/exam/submit': (query, request) => {
  if (!query.examType || !query.taskId || !query.questionId || !query.answer)
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        message: '参数不足',
      },
    })
  const data = {
    examType: query.examType,
    taskId: query.taskId,
    questionId: query.questionId,
    answer: query.answer,
  }
  return request('/api/rep/ugc/exam/submit', data, createOption(query, 'eapi'))
},

  // /rep/ugc/user/collect-vip  <-- rep_ugc_user_collect-vip.js
  '/rep/ugc/user/collect-vip': (query, request) => {
  const data = {
    activityId: query.activityId || '5001',
  }
  return request(
    `/api/rep/ugc/user/collect-vip`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /rep/ugc/user/get  <-- rep_ugc_user_get.js
  '/rep/ugc/user/get': (query, request) => {
  return request(`/api/rep/ugc/user/get`, {}, createOption(query, 'eapi'))
},

  // /rep/ugc/user/sign  <-- rep_ugc_user_sign.js
  '/rep/ugc/user/sign': (query, request) => {
  return request(`/api/rep/ugc/user/sign`, {}, createOption(query, 'eapi'))
},

  // /rep/ugc/user/vip  <-- rep_ugc_user_vip.js
  '/rep/ugc/user/vip': (query, request) => {
  return request(`/api/rep/ugc/user/vip`, {}, createOption(query, 'eapi'))
},

  // /resource/like  <-- resource_like.js
  '/resource/like': (query, request) => {
  query.t = query.t == 1 ? 'like' : 'unlike'
  query.type = resourceTypeMap[query.type]
  const data = {
    threadId: query.type + query.id,
  }
  if (query.type === 'A_EV_2_') {
    data.threadId = query.threadId
  }
  return request(`/api/resource/${query.t}`, data, createOption(query, 'weapi'))
},

  // /sati/resource/list  <-- sati_resource_list.js
  '/sati/resource/list': (query, request) => {
  const data = {
    tag: query.tag,
    firstQuery: false,
  }

  return request(`/api/voice/sati/resource/list`, data, createOption(query))
},

  // /sati/resource/list/more  <-- sati_resource_list_more.js
  '/sati/resource/list/more': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(
    `/api/voice/sati/resource/list/more/v1`,
    data,
    createOption(query),
  )
},

  // /sati/resource/sub  <-- sati_resource_sub.js
  '/sati/resource/sub': (query, request) => {
  const data = {
    id: query.id,
    cancel: query.cancel || false,
  }
  return request(`/api/voice/sati/resource/sub`, data, createOption(query))
},

  // /sati/resource/sub/list  <-- sati_resource_sub_list.js
  '/sati/resource/sub/list': (query, request) => {
  const data = {}
  return request(`/api/voice/sati/resource/sub/list`, data, createOption(query))
},

  // /sati/tag/list  <-- sati_tag_list.js
  '/sati/tag/list': (query, request) => {
  const data = {}
  return request(`/api/voice/sati/tag/list`, data, createOption(query))
},

  // /sati/timescene/resources/get  <-- sati_timescene_resources_get.js
  '/sati/timescene/resources/get': (query, request) => {
  const data = {
    firstQuery: false,
  }
  return request(
    `/api/voice/sati/timescene/resources/get`,
    data,
    createOption(query),
  )
},

  // /scrobble  <-- scrobble.js
  '/scrobble': async (query, request) => {
  // 注入 os=osx 的 cookie
  let cookie = query.cookie || ''
  if (typeof cookie === 'object') {
    cookie = Object.assign({ os: 'osx' }, cookie)
  } else if (typeof cookie === 'string') {
    if (cookie.indexOf('os=') > -1) {
      cookie = cookie.replace(/os=[^;]+/g, 'os=osx')
    } else {
      cookie = cookie + '; os=osx'
    }
  } else {
    cookie = 'os=osx'
  }
  query.cookie = cookie

  // 1) startplay → 进「最近播放」
  const startplayData = {
    logs: JSON.stringify([
      {
        action: 'startplay',
        json: {
          id: query.id,
          type: 'song',
          mainsite: '1',
          mainsiteWeb: '1',
          content: `id=${query.sourceid}`,
        },
      },
    ]),
  }

  // 2) play → 涨「听歌排行」计数
  const playData = {
    logs: JSON.stringify([
      {
        action: 'play',
        json: {
          download: 0,
          end: 'playend',
          id: query.id,
          sourceId: query.sourceid,
          time: query.time,
          type: 'song',
          wifi: 0,
          source: 'list',
          mainsite: '1',
          mainsiteWeb: '1',
          content: `id=${query.sourceid}`,
        },
      },
    ]),
  }

  const option = createOption(query, 'eapi')
  option.domain = DOMAIN

  // 发送两次请求
  const res1 = await request(`/api/feedback/weblog`, startplayData, option)
  const res2 = await request(`/api/feedback/weblog`, playData, option)

  return {
    status: 200,
    body: {
      code: 200,
      data: 'success',
      details: {
        startplay: res1.body,
        play: res2.body,
      },
    },
  }
},

  // /search  <-- search.js
  '/search': (query, request) => {
  if (query.type && query.type == '2000') {
    const data = {
      keyword: query.keywords,
      scene: 'normal',
      limit: query.limit || 30,
      offset: query.offset || 0,
    }
    return request(`/api/search/voice/get`, data, createOption(query))
  }
  const data = {
    s: query.keywords,
    type: query.type || 1, // 1: 单曲, 10: 专辑, 100: 歌手, 1000: 歌单, 1002: 用户, 1004: MV, 1006: 歌词, 1009: 电台, 1014: 视频
    limit: query.limit || 30,
    offset: query.offset || 0,
  }
  return request(`/api/search/get`, data, createOption(query))
},

  // /search/default  <-- search_default.js
  '/search/default': (query, request) => {
  return request(`/api/search/defaultkeyword/get`, {}, createOption(query))
},

  // /search/hot  <-- search_hot.js
  '/search/hot': (query, request) => {
  const data = {
    type: 1111,
  }
  return request(`/api/search/hot`, data, createOption(query))
},

  // /search/hot/detail  <-- search_hot_detail.js
  '/search/hot/detail': (query, request) => {
  const data = {}
  return request(`/api/hotsearchlist/get`, data, createOption(query, 'weapi'))
},

  // /search/match  <-- search_match.js
  '/search/match': (query, request) => {
  let songs = [
    {
      title: query.title || '',
      album: query.album || '',
      artist: query.artist || '',
      duration: query.duration || 0,
      persistId: query.md5,
    },
  ]
  const data = {
    songs: JSON.stringify(songs),
  }
  return request(`/api/search/match/new`, data, createOption(query))
},

  // /search/multimatch  <-- search_multimatch.js
  '/search/multimatch': (query, request) => {
  const data = {
    type: query.type || 1,
    s: query.keywords || '',
  }
  return request(
    `/api/search/suggest/multimatch`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /search/suggest  <-- search_suggest.js
  '/search/suggest': (query, request) => {
  const data = {
    s: query.keywords || '',
  }
  let type = query.type == 'mobile' ? 'keyword' : 'web'
  return request(
    `/api/search/suggest/` + type,
    data,
    createOption(query, 'weapi'),
  )
},

  // /search/suggest/pc  <-- search_suggest_pc.js
  '/search/suggest/pc': (query, request) => {
  const data = {
    keyword: query.keyword || '',
  }
  return request(
    `/api/search/pc/suggest/keyword/get`,
    data,
    createOption(query),
  )
},

  // /send/album  <-- send_album.js
  '/send/album': (query, request) => {
  const data = {
    id: query.id,
    msg: query.msg || '',
    type: 'album',
    userIds: '[' + query.user_ids + ']',
  }
  return request(`/api/msg/private/send`, data, createOption(query))
},

  // /send/playlist  <-- send_playlist.js
  '/send/playlist': (query, request) => {
  const data = {
    id: query.playlist,
    type: 'playlist',
    msg: query.msg,
    userIds: '[' + query.user_ids + ']',
  }
  return request(`/api/msg/private/send`, data, createOption(query))
},

  // /send/song  <-- send_song.js
  '/send/song': (query, request) => {
  const data = {
    id: query.id,
    msg: query.msg || '',
    type: 'song',
    userIds: '[' + query.user_ids + ']',
  }
  return request(`/api/msg/private/send`, data, createOption(query))
},

  // /send/text  <-- send_text.js
  '/send/text': (query, request) => {
  const data = {
    type: 'text',
    msg: query.msg,
    userIds: '[' + query.user_ids + ']',
  }
  return request(`/api/msg/private/send`, data, createOption(query))
},

  // /setting  <-- setting.js
  '/setting': (query, request) => {
  const data = {}
  return request(`/api/user/setting`, data, createOption(query, 'weapi'))
},

  // /share/resource  <-- share_resource.js
  '/share/resource': (query, request) => {
  const data = {
    type: query.type || 'song', // song,playlist,mv,djprogram,djradio,noresource
    msg: query.msg || '',
    id: query.id || '',
  }
  return request(
    `/api/share/friends/resource`,
    data,
    createOption(query, 'xeapi', 'v3'),
  )
},

  // /sheet/list  <-- sheet_list.js
  '/sheet/list': (query, request) => {
  const data = {
    id: query.id,
    abTest: query.ab || 'b',
  }
  return request(`/api/music/sheet/list/v1`, data, createOption(query))
},

  // /sheet/preview  <-- sheet_preview.js
  '/sheet/preview': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/music/sheet/preview/info`, data, createOption(query))
},

  // /sign/happy/info  <-- sign_happy_info.js
  '/sign/happy/info': (query, request) => {
  const data = {}
  return request(`/api/sign/happy/info`, data, createOption(query, 'weapi'))
},

  // /signin/progress  <-- signin_progress.js
  '/signin/progress': (query, request) => {
  const data = {
    moduleId: query.moduleId || '1207signin-1207signin',
  }
  return request(
    `/api/act/modules/signin/v2/progress`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /simi/artist  <-- simi_artist.js
  '/simi/artist': (query, request) => {
  const data = {
    artistid: query.id,
  }
  return request(
    `/api/discovery/simiArtist`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /simi/mv  <-- simi_mv.js
  '/simi/mv': (query, request) => {
  const data = {
    mvid: query.mvid,
  }
  return request(`/api/discovery/simiMV`, data, createOption(query, 'weapi'))
},

  // /simi/playlist  <-- simi_playlist.js
  '/simi/playlist': (query, request) => {
  const data = {
    songid: query.id,
    limit: query.limit || 50,
    offset: query.offset || 0,
  }
  return request(
    `/api/discovery/simiPlaylist`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /simi/song  <-- simi_song.js
  '/simi/song': (query, request) => {
  const data = {
    songid: query.id,
    limit: query.limit || 50,
    offset: query.offset || 0,
  }
  return request(
    `/api/v1/discovery/simiSong`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /simi/user  <-- simi_user.js
  '/simi/user': (query, request) => {
  const data = {
    songid: query.id,
    limit: query.limit || 50,
    offset: query.offset || 0,
  }
  return request(`/api/discovery/simiUser`, data, createOption(query, 'weapi'))
},

  // /song/chorus  <-- song_chorus.js
  '/song/chorus': (query, request) => {
  return request(
    `/api/song/chorus`,
    {
      ids: JSON.stringify([query.id]),
    },
    createOption(query),
  )
},

  // /song/cloud/download  <-- song_cloud_download.js
  '/song/cloud/download': (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/cloud/dowonload`, data, createOption(query, 'eapi'))
},

  // /song/copyright/rcmd  <-- song_copyright_rcmd.js
  '/song/copyright/rcmd': (query, request) => {
  const data = {
    songid: query.songid || query.id,
  }
  return request(`/api/song/copyright/rcmd`, data, createOption(query, 'eapi'))
},

  // /song/creators  <-- song_creators.js
  '/song/creators': (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/song/creators`, data, createOption(query))
},

  // /song/detail  <-- song_detail.js
  '/song/detail': (query, request) => {
  // 歌曲数量不要超过1000
  query.ids = query.ids.split(/\s*,\s*/)
  const data = {
    c: '[' + query.ids.map((id) => '{"id":' + id + '}').join(',') + ']',
  }
  return request(`/api/v3/song/detail`, data, createOption(query, 'weapi'))
},

  // /song/downlist  <-- song_downlist.js
  '/song/downlist': (query, request) => {
  const data = {
    limit: query.limit || '20',
    offset: query.offset || '0',
    total: 'true',
  }
  return request(`/api/member/song/downlist`, data, createOption(query))
},

  // /song/download/url  <-- song_download_url.js
  '/song/download/url': (query, request) => {
  const data = {
    id: query.id,
    br: parseInt(query.br || 999000),
  }
  return request(`/api/song/enhance/download/url`, data, createOption(query))
},

  // /song/dynamic/cover  <-- song_dynamic_cover.js
  '/song/dynamic/cover': (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/songplay/dynamic-cover`, data, createOption(query))
},

  // /song/like  <-- song_like.js
  '/song/like': (query, request) => {
  const like = query.like !== 'false'
  const data = {
    trackId: query.id,
    userid: query.uid,
    like: like,
  }
  return request(`/api/song/like`, data, createOption(query))
},

  // /song/like/check  <-- song_like_check.js
  '/song/like/check': (query, request) => {
  const data = {
    trackIds: query.ids,
  }
  return request(`/api/song/like/check`, data, createOption(query))
},

  // /song/lyrics/mark  <-- song_lyrics_mark.js
  '/song/lyrics/mark': (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/song/play/lyrics/mark/song`, data, createOption(query))
},

  // /song/lyrics/mark/add  <-- song_lyrics_mark_add.js
  '/song/lyrics/mark/add': (query, request) => {
  const data = {
    songId: query.id,
    markId: query.markId || '',
    data: query.data || '[]',
    // "[{\"translateType\":1,\"startTimeStamp\":800,\"translateLyricsText\":\"让我逃走吧、声音已经枯萎\",\"originalLyricsText\":\"逃がしてくれって声を枯らした\"},{\"translateType\":1,\"startTimeStamp\":4040,\"translateLyricsText\":\"我的愿望究竟会实现吗\",\"originalLyricsText\":\"あたしの願いなど叶うでしょうか\"}]"
  }
  return request(`/api/song/play/lyrics/mark/add`, data, createOption(query))
},

  // /song/lyrics/mark/del  <-- song_lyrics_mark_del.js
  '/song/lyrics/mark/del': (query, request) => {
  const data = {
    markIds: query.id,
  }
  return request(`/api/song/play/lyrics/mark/del`, data, createOption(query))
},

  // /song/lyrics/mark/user/page  <-- song_lyrics_mark_user_page.js
  '/song/lyrics/mark/user/page': (query, request) => {
  const data = {
    limit: query.limit || 10,
    offset: query.offset || 0,
  }
  return request(
    `/api/song/play/lyrics/mark/user/page`,
    data,
    createOption(query),
  )
},

  // /song/monthdownlist  <-- song_monthdownlist.js
  '/song/monthdownlist': (query, request) => {
  const data = {
    limit: query.limit || '20',
    offset: query.offset || '0',
    total: 'true',
  }
  return request(`/api/member/song/monthdownlist`, data, createOption(query))
},

  // /song/music/detail  <-- song_music_detail.js
  '/song/music/detail': (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/song/music/detail/get`, data, createOption(query))
},

  // /song/order/update  <-- song_order_update.js
  '/song/order/update': (query, request) => {
  const data = {
    pid: query.pid,
    trackIds: query.ids,
    op: 'update',
  }

  return request(`/api/playlist/manipulate/tracks`, data, createOption(query))
},

  // /song/purchased  <-- song_purchased.js
  '/song/purchased': (query, request) => {
  const data = {
    limit: query.limit || 20,
    offset: query.offset || 0,
  }
  return request(
    `/api/single/mybought/song/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /song/red/count  <-- song_red_count.js
  '/song/red/count': (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/song/red/count`, data, createOption(query))
},

  // /song/simi/get  <-- song_simi_get.js
  '/song/simi/get': (query, request) => {
  const data = {
    positionCode: 'toolBarRcmdSong',
    resourceId: query.id,
    resourceType: 'song',
  }
  return request(
    `/api/link/position/show/resource`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /song/singledownlist  <-- song_singledownlist.js
  '/song/singledownlist': (query, request) => {
  const data = {
    limit: query.limit || '20',
    offset: query.offset || '0',
    total: 'true',
  }
  return request(`/api/member/song/singledownlist`, data, createOption(query))
},

  // /song/url  <-- song_url.js
  '/song/url': async (query, request) => {
  const ids = String(query.id).split(',')
  const data = {
    ids: JSON.stringify(ids),
    br: parseInt(query.br || 999000),
  }
  const res = await request(
    `/api/song/enhance/player/url`,
    data,
    createOption(query),
  )
  // 根据id排序
  const result = res.body.data
  result.sort((a, b) => {
    return ids.indexOf(String(a.id)) - ids.indexOf(String(b.id))
  })
  return {
    status: 200,
    body: {
      code: 200,
      data: result,
    },
  }
},

  // /song/url/ncmget  <-- song_url_ncmget.js
  '/song/url/ncmget': async (query, request) => {
  return { status: 200, body: { code: 200, data: [] } }
},

  // /song/wiki/info  <-- song_wiki_info.js
  '/song/wiki/info': (query, request) => {
  const extJson = {
    states: {
      playingResource: {
        current: query.id,
        scene: 'songWiki',
      },
    },
  }
  const data = {
    extJson: JSON.stringify(extJson),
    positionCode: 'songWikiMainPosition',
  }
  return request(
    `/api/link/page/parent/relation/construct/info`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /song/wiki/summary  <-- song_wiki_summary.js
  '/song/wiki/summary': (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/song/play/about/block/page`, data, createOption(query))
},

  // /starpick/comments/summary  <-- starpick_comments_summary.js
  '/starpick/comments/summary': (query, request) => {
  const data = {
    cursor: JSON.stringify({
      offset: 0,
      blockCodeOrderList: ['HOMEPAGE_BLOCK_NEW_HOT_COMMENT'],
      refresh: true,
    }),
  }
  return request(`/api/homepage/block/page`, data, createOption(query))
},

  // /style/album  <-- style_album.js
  '/style/album': (query, request) => {
  const data = {
    cursor: query.cursor || 0,
    size: query.size || 20,
    tagId: query.tagId,
    sort: query.sort || 0,
  }
  return request(
    `/api/style-tag/home/album`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /style/artist  <-- style_artist.js
  '/style/artist': (query, request) => {
  const data = {
    cursor: query.cursor || 0,
    size: query.size || 20,
    tagId: query.tagId,
    sort: 0,
  }
  return request(
    `/api/style-tag/home/artist`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /style/detail  <-- style_detail.js
  '/style/detail': (query, request) => {
  const data = {
    tagId: query.tagId,
  }
  return request(`/api/style-tag/home/head`, data, createOption(query, 'weapi'))
},

  // /style/list  <-- style_list.js
  '/style/list': (query, request) => {
  const data = {}
  return request(`/api/tag/list/get`, data, createOption(query, 'weapi'))
},

  // /style/playlist  <-- style_playlist.js
  '/style/playlist': (query, request) => {
  const data = {
    cursor: query.cursor || 0,
    size: query.size || 20,
    tagId: query.tagId,
    sort: 0,
  }
  return request(
    `/api/style-tag/home/playlist`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /style/preference  <-- style_preference.js
  '/style/preference': (query, request) => {
  const data = {}
  return request(
    `/api/tag/my/preference/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /style/song  <-- style_song.js
  '/style/song': (query, request) => {
  const data = {
    cursor: query.cursor || 0,
    size: query.size || 20,
    tagId: query.tagId,
    sort: query.sort || 0,
  }
  return request(`/api/style-tag/home/song`, data, createOption(query, 'weapi'))
},

  // /summary/annual  <-- summary_annual.js
  '/summary/annual': (query, request) => {
  const data = {}
  const key =
    ['2017', '2018', '2019'].indexOf(query.year) > -1 ? 'userdata' : 'data'
  return request(
    `/api/activity/summary/annual/${query.year}/${key}`,
    data,
    createOption(query),
  )
},

  // /thinktank/audit/resource/detail  <-- thinktank_audit_resource_detail.js
  '/thinktank/audit/resource/detail': (query, request) => {
  const data = {
    type: query.type || '4',
  }
  return request(
    `/api/thinktank/audit/resource/detail`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /thinktank/audit/resource/update  <-- thinktank_audit_resource_update.js
  '/thinktank/audit/resource/update': (query, request) => {
  if (!query.taskId || !query.judgement)
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        message: '参数不足',
      },
    })
  const data = {
    type: query.type || '4',
    taskId: query.taskId,
    judgement: query.judgement,
  }
  return request(
    `/api/thinktank/audit/resource/update`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /threshold/detail/get  <-- threshold_detail_get.js
  '/threshold/detail/get': (query, request) => {
  const data = {}
  return request(
    `/api/influencer/web/apply/threshold/detail/get`,
    data,
    createOption(query),
  )
},

  // /top/album  <-- top_album.js
  '/top/album': (query, request) => {
  const date = new Date()

  const data = {
    area: query.area || 'ALL', // //ALL:全部,ZH:华语,EA:欧美,KR:韩国,JP:日本
    limit: query.limit || 50,
    offset: query.offset || 0,
    type: query.type || 'new',
    year: query.year || date.getFullYear(),
    month: query.month || date.getMonth() + 1,
    total: false,
    rcmd: true,
  }
  return request(
    `/api/discovery/new/albums/area`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /top/artists  <-- top_artists.js
  '/top/artists': (query, request) => {
  const data = {
    limit: query.limit || 50,
    offset: query.offset || 0,
    total: true,
  }
  return request(`/api/artist/top`, data, createOption(query, 'weapi'))
},

  // /top/list  <-- top_list.js
  '/top/list': (query, request) => {
  if (query.idx) {
    return Promise.resolve({
      status: 500,
      body: {
        code: 500,
        msg: '不支持此方式调用,只支持id调用',
      },
    })
  }

  const data = {
    id: query.id,
    n: '500',
    s: '0',
  }
  return request(`/api/playlist/v4/detail`, data, createOption(query))
},

  // /top/mv  <-- top_mv.js
  '/top/mv': (query, request) => {
  const data = {
    area: query.area || '',
    limit: query.limit || 30,
    offset: query.offset || 0,
    total: true,
  }
  return request(`/api/mv/toplist`, data, createOption(query, 'weapi'))
},

  // /top/playlist  <-- top_playlist.js
  '/top/playlist': async (query, request) => {
  const data = {
    cat: query.cat || '全部', // 全部,华语,欧美,日语,韩语,粤语,小语种,流行,摇滚,民谣,电子,舞曲,说唱,轻音乐,爵士,乡村,R&B/Soul,古典,民族,英伦,金属,朋克,蓝调,雷鬼,世界音乐,拉丁,另类/独立,New Age,古风,后摇,Bossa Nova,清晨,夜晚,学习,工作,午休,下午茶,地铁,驾车,运动,旅行,散步,酒吧,怀旧,清新,浪漫,性感,伤感,治愈,放松,孤独,感动,兴奋,快乐,安静,思念,影视原声,ACG,儿童,校园,游戏,70后,80后,90后,网络歌曲,KTV,经典,翻唱,吉他,钢琴,器乐,榜单,00后
    order: query.order || 'hot', // hot,new
    limit: query.limit || 50,
    offset: query.offset || 0,
    total: true,
  }
  const res = await request(
    `/api/playlist/list`,
    data,
    createOption(query, 'weapi'),
  )
  const result = JSON.stringify(res).replace(
    /avatarImgId_str/g,
    'avatarImgIdStr',
  )
  return JSON.parse(result)
},

  // /top/playlist/highquality  <-- top_playlist_highquality.js
  '/top/playlist/highquality': (query, request) => {
  const data = {
    cat: query.cat || '全部', // 全部,华语,欧美,韩语,日语,粤语,小语种,运动,ACG,影视原声,流行,摇滚,后摇,古风,民谣,轻音乐,电子,器乐,说唱,古典,爵士
    limit: query.limit || 50,
    lasttime: query.before || 0, // 歌单updateTime
    total: true,
  }
  return request(
    `/api/playlist/highquality/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /top/song  <-- top_song.js
  '/top/song': (query, request) => {
  const data = {
    areaId: query.type || 0, // 全部:0 华语:7 欧美:96 日本:8 韩国:16
    // limit: query.limit || 100,
    // offset: query.offset || 0,
    total: true,
  }
  return request(
    `/api/v1/discovery/new/songs`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /topic/detail  <-- topic_detail.js
  '/topic/detail': (query, request) => {
  const data = {
    actid: query.actid,
  }
  return request(`/api/act/detail`, data, createOption(query, 'weapi'))
},

  // /topic/detail/event/hot  <-- topic_detail_event_hot.js
  '/topic/detail/event/hot': (query, request) => {
  const data = {
    actid: query.actid,
  }
  return request(`/api/act/event/hot`, data, createOption(query, 'weapi'))
},

  // /topic/sublist  <-- topic_sublist.js
  '/topic/sublist': (query, request) => {
  const data = {
    limit: query.limit || 50,
    offset: query.offset || 0,
    total: true,
  }
  return request(`/api/topic/sublist`, data, createOption(query, 'weapi'))
},

  // /toplist  <-- toplist.js
  '/toplist': (query, request) => {
  return request(`/api/toplist`, {}, createOption(query))
},

  // /toplist/artist  <-- toplist_artist.js
  '/toplist/artist': (query, request) => {
  const data = {
    type: query.type || 1,
    limit: 100,
    offset: 0,
    total: true,
  }
  return request(`/api/toplist/artist`, data, createOption(query, 'weapi'))
},

  // /toplist/detail  <-- toplist_detail.js
  '/toplist/detail': (query, request) => {
  return request(`/api/toplist/detail`, {}, createOption(query, 'weapi'))
},

  // /toplist/detail/v2  <-- toplist_detail_v2.js
  '/toplist/detail/v2': (query, request) => {
  return request(`/api/toplist/detail/v2`, {}, createOption(query, 'weapi'))
},

  // /ugc/album/get  <-- ugc_album_get.js
  '/ugc/album/get': (query, request) => {
  const data = {
    albumId: query.id,
  }
  return request(`/api/rep/ugc/album/get`, data, createOption(query))
},

  // /ugc/artist/get  <-- ugc_artist_get.js
  '/ugc/artist/get': (query, request) => {
  const data = {
    artistId: query.id,
  }
  return request(`/api/rep/ugc/artist/get`, data, createOption(query))
},

  // /ugc/artist/search  <-- ugc_artist_search.js
  '/ugc/artist/search': (query, request) => {
  const data = {
    keyword: query.keyword,
    limit: query.limit || 40,
  }
  return request(`/api/rep/ugc/artist/search`, data, createOption(query))
},

  // /ugc/detail  <-- ugc_detail.js
  '/ugc/detail': (query, request) => {
  const data = {
    auditStatus: query.auditStatus || '',
    //待审核:0 未采纳:-5 审核中:1 部分审核通过:4 审核通过:5
    //WAIT:0 REJECT:-5 AUDITING:1 PARTLY_APPROVED:4 PASS:5
    limit: query.limit || 10,
    offset: query.offset || 0,
    order: query.order || 'desc', //asc
    sortBy: query.sortBy || 'createTime',
    type: query.type || 1,
    //曲库纠错 ARTIST:1 ALBUM:2 SONG:3 MV:4 LYRIC:5 TLYRIC:6
    //曲库补充 ALBUM:101 MV:103
  }
  return request(`/api/rep/ugc/detail`, data, createOption(query, 'weapi'))
},

  // /ugc/mv/get  <-- ugc_mv_get.js
  '/ugc/mv/get': (query, request) => {
  const data = {
    mvId: query.id,
  }
  return request(`/api/rep/ugc/mv/get`, data, createOption(query))
},

  // /ugc/song/get  <-- ugc_song_get.js
  '/ugc/song/get': (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/rep/ugc/song/get`, data, createOption(query))
},

  // /ugc/user/devote  <-- ugc_user_devote.js
  '/ugc/user/devote': (query, request) => {
  const data = {}
  return request(`/api/rep/ugc/user/devote`, data, createOption(query))
},

  // /user/account  <-- user_account.js
  '/user/account': (query, request) => {
  const data = {}
  return request(`/api/nuser/account/get`, data, createOption(query, 'weapi'))
},

  // /user/audio  <-- user_audio.js
  '/user/audio': (query, request) => {
  const data = {
    userId: query.uid,
  }
  return request(`/api/djradio/get/byuser`, data, createOption(query, 'weapi'))
},

  // /user/binding  <-- user_binding.js
  '/user/binding': (query, request) => {
  const data = {}
  return request(
    `/api/v1/user/bindings/${query.uid}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /user/bindingcellphone  <-- user_bindingcellphone.js
  '/user/bindingcellphone': (query, request) => {
  const data = {
    phone: query.phone,
    countrycode: query.countrycode || '86',
    captcha: query.captcha,
    password: query.password ? CryptoJS.MD5(query.password).toString() : '',
  }
  return request(
    `/api/user/bindingCellphone`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /user/cloud  <-- user_cloud.js
  '/user/cloud': (query, request) => {
  const data = {
    limit: query.limit || 30,
    offset: query.offset || 0,
  }
  return request(`/api/v1/cloud/get`, data, createOption(query, 'weapi'))
},

  // /user/cloud/del  <-- user_cloud_del.js
  '/user/cloud/del': (query, request) => {
  const data = {
    songIds: [query.id],
  }
  return request(`/api/cloud/del`, data, createOption(query, 'weapi'))
},

  // /user/cloud/detail  <-- user_cloud_detail.js
  '/user/cloud/detail': (query, request) => {
  const id = query.id.replace(/\s/g, '').split(',')
  const data = {
    songIds: id,
  }
  return request(`/api/v1/cloud/get/byids`, data, createOption(query, 'weapi'))
},

  // /user/comment/history  <-- user_comment_history.js
  '/user/comment/history': (query, request) => {
  const data = {
    compose_reminder: 'true',
    compose_hot_comment: 'true',
    limit: query.limit || 10,
    user_id: query.uid,
    time: query.time || 0,
  }
  return request(
    `/api/comment/user/comment/history`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /user/detail  <-- user_detail.js
  '/user/detail': async (query, request) => {
  const res = await request(
    `/api/v1/user/detail/${query.uid}`,
    {},
    createOption(query, 'weapi'),
  )
  const result = JSON.stringify(res).replace(
    /avatarImgId_str/g,
    'avatarImgIdStr',
  )
  return JSON.parse(result)
},

  // /user/detail/new  <-- user_detail_new.js
  '/user/detail/new': async (query, request) => {
  const data = {
    all: 'true',
    userId: query.uid,
  }
  const res = await request(
    `/api/w/v1/user/detail/${query.uid}`,
    data,
    createOption(query, 'eapi'),
  )
  // const result = JSON.stringify(res).replace(
  //   /avatarImgId_str/g,
  //   "avatarImgIdStr"
  // );
  // return JSON.parse(result);
  return res
},

  // /user/dj  <-- user_dj.js
  '/user/dj': (query, request) => {
  const data = {
    limit: query.limit || 30,
    offset: query.offset || 0,
  }
  return request(
    `/api/dj/program/${query.uid}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /user/event  <-- user_event.js
  '/user/event': (query, request) => {
  const data = {
    getcounts: true,
    time: query.lasttime ?? -1,
    limit: query.limit ?? 30,
    total: false,
    fromRN: 'true',
  }
  return request(`/api/event/get/${query.uid}`, data, createOption(query))
},

  // /user/follow/mixed  <-- user_follow_mixed.js
  '/user/follow/mixed': (query, request) => {
  const size = query.size || 30
  const cursor = query.cursor || 0
  const scene = query.scene || 0 // 0: 所有关注 1: 关注的歌手 2: 关注的用户
  const data = {
    authority: 'false',
    page: JSON.stringify({
      size: size,
      cursor: cursor,
    }),
    scene: scene,
    size: size,
    sortType: '0',
  }
  return request(
    `/api/user/follow/users/mixed/get/v2`,
    data,
    createOption(query),
  )
},

  // /user/followeds  <-- user_followeds.js
  '/user/followeds': (query, request) => {
  const data = {
    userId: query.uid,
    time: '0',
    limit: query.limit || 20,
    offset: query.offset || 0,
    getcounts: 'true',
  }
  return request(
    `/api/user/getfolloweds/${query.uid}`,
    data,
    createOption(query),
  )
},

  // /user/follows  <-- user_follows.js
  '/user/follows': (query, request) => {
  const data = {
    offset: query.offset || 0,
    limit: query.limit || 30,
    order: true,
  }
  return request(
    `/api/user/getfollows/${query.uid}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /user/level  <-- user_level.js
  '/user/level': (query, request) => {
  const data = {}
  return request(`/api/user/level`, data, createOption(query, 'weapi'))
},

  // /user/medal  <-- user_medal.js
  '/user/medal': (query, request) => {
  return request(
    `/api/medal/user/page`,
    {
      uid: query.uid,
    },
    createOption(query),
  )
},

  // /user/mutualfollow/get  <-- user_mutualfollow_get.js
  '/user/mutualfollow/get': (query, request) => {
  const data = {
    friendid: query.uid,
  }
  return request(`/api/user/mutualfollow/get`, data, createOption(query))
},

  // /user/playlist  <-- user_playlist.js
  '/user/playlist': (query, request) => {
  const data = {
    uid: query.uid,
    limit: query.limit || 30,
    offset: query.offset || 0,
    includeVideo: true,
  }
  return request(`/api/user/playlist`, data, createOption(query, 'weapi'))
},

  // /user/playlist/collect  <-- user_playlist_collect.js
  '/user/playlist/collect': (query, request) => {
  const data = {
    limit: query.limit || '100',
    offset: query.offset || '0',
    userId: query.uid,
    isWebview: 'true',
    includeRedHeart: 'true',
    includeTop: 'true',
  }
  return request(`/api/user/playlist/collect`, data, createOption(query))
},

  // /user/playlist/create  <-- user_playlist_create.js
  '/user/playlist/create': (query, request) => {
  const data = {
    limit: query.limit || '100',
    offset: query.offset || '0',
    userId: query.uid,
    isWebview: 'true',
    includeRedHeart: 'true',
    includeTop: 'true',
  }
  return request(`/api/user/playlist/create`, data, createOption(query))
},

  // /user/record  <-- user_record.js
  '/user/record': (query, request) => {
  const data = {
    uid: query.uid,
    type: query.type || 0, // 1: 最近一周, 0: 所有时间
  }
  return request(`/api/v1/play/record`, data, createOption(query, 'weapi'))
},

  // /user/replacephone  <-- user_replacephone.js
  '/user/replacephone': (query, request) => {
  const data = {
    phone: query.phone,
    captcha: query.captcha,
    oldcaptcha: query.oldcaptcha,
    countrycode: query.countrycode || '86',
  }
  return request(
    `/api/user/replaceCellphone`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /user/social/status  <-- user_social_status.js
  '/user/social/status': (query, request) => {
  return request(
    `/api/social/user/status`,
    {
      visitorId: query.uid,
    },
    createOption(query),
  )
},

  // /user/social/status/edit  <-- user_social_status_edit.js
  '/user/social/status/edit': (query, request) => {
  return request(
    `/api/social/user/status/edit`,
    {
      content: JSON.stringify({
        type: query.type,
        iconUrl: query.iconUrl,
        content: query.content,
        actionUrl: query.actionUrl,
      }),
    },
    createOption(query),
  )
},

  // /user/social/status/rcmd  <-- user_social_status_rcmd.js
  '/user/social/status/rcmd': (query, request) => {
  return request(`/api/social/user/status/rcmd`, {}, createOption(query))
},

  // /user/social/status/support  <-- user_social_status_support.js
  '/user/social/status/support': (query, request) => {
  return request(`/api/social/user/status/support`, {}, createOption(query))
},

  // /user/subcount  <-- user_subcount.js
  '/user/subcount': (query, request) => {
  return request(`/api/subcount`, {}, createOption(query, 'weapi'))
},

  // /user/update  <-- user_update.js
  '/user/update': (query, request) => {
  const data = {
    // avatarImgId: '0',
    birthday: query.birthday,
    city: query.city,
    gender: query.gender,
    nickname: query.nickname,
    province: query.province,
    signature: query.signature,
  }
  return request(`/api/user/profile/update`, data, createOption(query))
},

  // /verify/qrcodestatus  <-- verify_qrcodestatus.js
  '/verify/qrcodestatus': async (query, request) => {
  const data = {
    qrCode: query.qr,
  }
  const res = await request(
    `/api/frontrisk/verify/qrcodestatus`,
    data,
    createOption(query, 'weapi'),
  )
  return res
},

  // /video/category/list  <-- video_category_list.js
  '/video/category/list': (query, request) => {
  const data = {
    offset: query.offset || 0,
    total: 'true',
    limit: query.limit || 99,
  }
  return request(
    `/api/cloudvideo/category/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /video/detail  <-- video_detail.js
  '/video/detail': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(
    `/api/cloudvideo/v1/video/detail`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /video/detail/info  <-- video_detail_info.js
  '/video/detail/info': (query, request) => {
  const data = {
    threadid: `R_VI_62_${query.vid}`,
    composeliked: true,
  }
  return request(
    `/api/comment/commentthread/info`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /video/group  <-- video_group.js
  '/video/group': (query, request) => {
  const data = {
    groupId: query.id,
    offset: query.offset || 0,
    need_preview_url: 'true',
    total: true,
  }
  return request(
    `/api/videotimeline/videogroup/otherclient/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /video/group/list  <-- video_group_list.js
  '/video/group/list': (query, request) => {
  const data = {}
  return request(
    `/api/cloudvideo/group/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /video/sub  <-- video_sub.js
  '/video/sub': (query, request) => {
  query.t = query.t == 1 ? 'sub' : 'unsub'
  const data = {
    id: query.id,
  }
  return request(
    `/api/cloudvideo/video/${query.t}`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /video/timeline/all  <-- video_timeline_all.js
  '/video/timeline/all': (query, request) => {
  const data = {
    groupId: 0,
    offset: query.offset || 0,
    need_preview_url: 'true',
    total: true,
  }
  //   /api/videotimeline/otherclient/get
  return request(
    `/api/videotimeline/otherclient/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /video/timeline/recommend  <-- video_timeline_recommend.js
  '/video/timeline/recommend': (query, request) => {
  const data = {
    offset: query.offset || 0,
    filterLives: '[]',
    withProgramInfo: 'true',
    needUrl: '1',
    resolution: '480',
  }
  return request(`/api/videotimeline/get`, data, createOption(query, 'weapi'))
},

  // /video/url  <-- video_url.js
  '/video/url': (query, request) => {
  const data = {
    ids: '["' + query.id + '"]',
    resolution: query.res || 1080,
  }
  return request(`/api/cloudvideo/playurl`, data, createOption(query, 'weapi'))
},

  // /vip/growthpoint  <-- vip_growthpoint.js
  '/vip/growthpoint': (query, request) => {
  const data = {}
  return request(
    `/api/vipnewcenter/app/level/growhpoint/basic`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /vip/growthpoint/details  <-- vip_growthpoint_details.js
  '/vip/growthpoint/details': (query, request) => {
  const data = {
    limit: query.limit || 20,
    offset: query.offset || 0,
  }
  return request(
    `/api/vipnewcenter/app/level/growth/details`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /vip/growthpoint/get  <-- vip_growthpoint_get.js
  '/vip/growthpoint/get': (query, request) => {
  const data = {
    taskIds: query.ids,
  }
  return request(
    `/api/vipnewcenter/app/level/task/reward/get`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /vip/growthpoint/getall  <-- vip_growthpoint_getall.js
  '/vip/growthpoint/getall': (query, request) => {
  const data = {}
  return request(
    `/api/vipnewcenter/app/level/task/reward/getall`,
    data,
    createOption(query, 'xeapi'),
  )
},

  // /vip/info  <-- vip_info.js
  '/vip/info': (query, request) => {
  return request(
    `/api/music-vip-membership/front/vip/info`,
    {
      userId: query.uid || '',
    },
    createOption(query, 'weapi'),
  )
},

  // /vip/info/v2  <-- vip_info_v2.js
  '/vip/info/v2': (query, request) => {
  return request(
    `/api/music-vip-membership/client/vip/info`,
    {
      userId: query.uid || '',
    },
    createOption(query, 'weapi'),
  )
},

  // /vip/sign  <-- vip_sign.js
  '/vip/sign': async (query, request) => {
  const results = {}

  const taskSign = await request(
    '/api/vip-center-bff/task/sign',
    {},
    createOption(query, 'weapi'),
  )
  results.taskSign = taskSign.body

  const checkinDetail = await request(
    '/api/vipnewcenter/app/level/user/checkin/history/detail',
    {
      signDayTime: Date.now(),
      type: 1,
    },
    createOption(query, 'eapi'),
  )
  results.checkinDetail = checkinDetail.body

  // 两个接口都返回 code=200 即视为打卡成功
  const signed =
    Number(results.taskSign?.code) === 200 &&
    Number(results.checkinDetail?.code) === 200

  return {
    body: {
      code: 200,
      ...results,
      signed,
      message: signed ? '黑胶乐签打卡成功' : '黑胶乐签打卡失败',
    },
    cookie: taskSign.cookie,
    status: 200,
  }
},

  // /vip/sign/detail  <-- vip_sign_detail.js
  '/vip/sign/detail': (query, request) => {
  const data = {
    signDayTime: query.timestamp,
    type: '1',
  }
  return request(
    `/api/vipnewcenter/app/level/user/checkin/history/detail`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /vip/sign/history  <-- vip_sign_history.js
  '/vip/sign/history': (query, request) => {
  const data = {
    type: query.type || '0',
  }
  return request(
    `/api/vipnewcenter/app/minidesk/music/sign/pc`,
    data,
    createOption(query, 'eapi'),
  )
},

  // /vip/sign/info  <-- vip_sign_info.js
  '/vip/sign/info': (query, request) => {
  const data = {}
  return request(
    `/api/vipnewcenter/app/user/sign/info`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /vip/tasks  <-- vip_tasks.js
  '/vip/tasks': (query, request) => {
  const data = {}
  return request(
    `/api/vipnewcenter/app/level/task/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /vip/tasks/v1  <-- vip_tasks_v1.js
  '/vip/tasks/v1': (query, request) => {
  const data = {
    taskType: 'app_vip_task_center',
    userId: query.id,
  }
  return request(
    `/api/middle/vip/mission/user/progress/list`,
    data,
    createOption(query, 'xeapi'),
  )
},

  // /vip/timemachine  <-- vip_timemachine.js
  '/vip/timemachine': (query, request) => {
  const data = {}
  if (query.startTime && query.endTime) {
    data.startTime = query.startTime
    data.endTime = query.endTime
    data.type = 1
    data.limit = query.limit || 60
  }
  return request(
    `/api/vipmusic/newrecord/weekflow`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /voice/delete  <-- voice_delete.js
  '/voice/delete': (query, request) => {
  const data = {
    ids: query.ids,
  }
  return request('/api/content/voice/delete', data, createOption(query))
},

  // /voice/detail  <-- voice_detail.js
  '/voice/detail': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/voice/workbench/voice/detail`, data, createOption(query))
},

  // /voice/lyric  <-- voice_lyric.js
  '/voice/lyric': (query, request) => {
  const data = {
    programId: query.id,
  }
  return request(`/api/voice/lyric/get`, data, createOption(query))
},

  // /voicelist/detail  <-- voicelist_detail.js
  '/voicelist/detail': (query, request) => {
  const data = {
    id: query.id,
  }
  return request(
    `/api/voice/workbench/voicelist/detail`,
    data,
    createOption(query),
  )
},

  // /voicelist/list  <-- voicelist_list.js
  '/voicelist/list': (query, request) => {
  const data = {
    limit: query.limit || '200',
    offset: query.offset || '0',
    voiceListId: query.voiceListId,
  }
  return request(
    `/api/voice/workbench/voices/by/voicelist`,
    data,
    createOption(query),
  )
},

  // /voicelist/list/search  <-- voicelist_list_search.js
  '/voicelist/list/search': (query, request) => {
  const data = {
    limit: query.limit || '200',
    offset: query.offset || '0',
    name: query.name || null,
    displayStatus: query.displayStatus || null,
    type: query.type || null,
    voiceFeeType: query.voiceFeeType || null,
    radioId: query.voiceListId,
  }
  return request('/api/voice/workbench/voice/list', data, createOption(query))
},

  // /voicelist/my/created  <-- voicelist_my_created.js
  '/voicelist/my/created': (query, request) => {
  const data = {
    limit: query.limit || 20,
  }
  return request(
    `/api/social/my/created/voicelist/v1`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /voicelist/search  <-- voicelist_search.js
  '/voicelist/search': (query, request) => {
  const data = {
    keyword: query.keyword || '',
    scene: 'normal',
    limit: query.limit || '10',
    offset: query.offset || '30',
    e_r: true,
  }
  return request(`/api/search/voicelist/get`, data, createOption(query))
},

  // /voicelist/trans  <-- voicelist_trans.js
  '/voicelist/trans': (query, request) => {
  const data = {
    limit: query.limit || '200', // 每页数量
    offset: query.offset || '0', // 偏移量
    radioId: query.radioId || null, // 电台id
    programId: query.programId || '0', // 节目id
    position: query.position || '1', // 排序编号
  }
  return request(
    `/api/voice/workbench/radio/program/trans`,
    data,
    createOption(query),
  )
},

  // /weblog  <-- weblog.js
  '/weblog': (query, request) => {
  return request(
    `/api/feedback/weblog`,
    query.data || {},
    createOption(query, 'weapi'),
  )
},

  // /yunbei  <-- yunbei.js
  '/yunbei': (query, request) => {
  const data = {}
  // /api/point/today/get
  return request(`/api/point/signed/get`, data, createOption(query, 'weapi'))
},

  // /yunbei/expense  <-- yunbei_expense.js
  '/yunbei/expense': (query, request) => {
  const data = {
    limit: query.limit || 10,
    offset: query.offset || 0,
  }
  return request(`/api/point/expense`, data, createOption(query))
},

  // /yunbei/info  <-- yunbei_info.js
  '/yunbei/info': (query, request) => {
  const data = {}
  return request(`/api/v1/user/info`, data, createOption(query, 'weapi'))
},

  // /yunbei/rcmd/song  <-- yunbei_rcmd_song.js
  '/yunbei/rcmd/song': (query, request) => {
  const data = {
    songId: query.id,
    reason: query.reason || '好歌献给你',
    scene: '',
    fromUserId: -1,
    yunbeiNum: query.yunbeiNum || 10,
  }
  return request(
    `/api/yunbei/rcmd/song/submit`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /yunbei/rcmd/song/history  <-- yunbei_rcmd_song_history.js
  '/yunbei/rcmd/song/history': (query, request) => {
  const data = {
    page: JSON.stringify({
      size: query.size || 20,
      cursor: query.cursor || '',
    }),
  }
  return request(
    `/api/yunbei/rcmd/song/history/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /yunbei/receipt  <-- yunbei_receipt.js
  '/yunbei/receipt': (query, request) => {
  const data = {
    limit: query.limit || 10,
    offset: query.offset || 0,
  }
  return request(`/api/point/receipt`, data, createOption(query))
},

  // /yunbei/sign  <-- yunbei_sign.js
  '/yunbei/sign': (query, request) => {
  const data = {}
  return request(
    `/api/pointmall/user/sign`,
    data,
    createOption(query, 'xeapi', 'v3'),
  )
},

  // /yunbei/task/finish  <-- yunbei_task_finish.js
  '/yunbei/task/finish': (query, request) => {
  const data = {
    userTaskId: query.userTaskId,
    depositCode: query.depositCode || '0',
  }
  return request(
    `/api/usertool/task/point/receive`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /yunbei/task/finish/v1  <-- yunbei_task_finish_v1.js
  '/yunbei/task/finish/v1': (query, request) => {
  const data = {
    yunbeiAmount: query.yunbeiAmount || 150,
  }
  return request(
    `/api/ad/power/yunbei/distribution/create`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /yunbei/task/list/v1  <-- yunbei_task_list_v1.js
  '/yunbei/task/list/v1': (query, request) => {
  const data = {}
  return request(
    `/api/ad/power/yunbei/distribution/list`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /yunbei/task/recommend/song  <-- yunbei_task_recommend_song.js
  '/yunbei/task/recommend/song': (query, request) => {
  const data = {
    offset: query.offset || 0,
    limit: query.limit || 10,
  }
  return request(
    `/api/ad/power/yunbei/distribution/recommend/song`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /yunbei/tasks  <-- yunbei_tasks.js
  '/yunbei/tasks': (query, request) => {
  const data = {}
  return request(
    `/api/usertool/task/list/all`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /yunbei/tasks/todo  <-- yunbei_tasks_todo.js
  '/yunbei/tasks/todo': (query, request) => {
  const data = {}
  return request(
    `/api/usertool/task/todo/query`,
    data,
    createOption(query, 'weapi'),
  )
},

  // /yunbei/today  <-- yunbei_today.js
  '/yunbei/today': (query, request) => {
  const data = {}
  return request(`/api/point/today/get`, data, createOption(query, 'weapi'))
},
};

export function registerGeneratedRoutes(app) {
  for (const [route, fn] of Object.entries(moduleFns)) {
    app.all(route, handleModule(fn));
  }
}

function handleModule(moduleFn) {
  return async (req, res) => {
    try {
      const query = { ...req.query, ...req.body };
      if (req.cookies) query.cookie = req.cookies;
      else if (req.headers.cookie) query.cookie = req.headers.cookie;

      const ip =
        req.ip || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '';

      const requestFn = (p, data, options = {}) =>
        createRequest(p, data, { ...options, ip: options.ip || ip });

      const result = await moduleFn(query, requestFn);

      if (result.cookie && result.cookie.length > 0 && !query.noCookie) {
        for (const cookie of result.cookie) {
          res.append('Set-Cookie', req.protocol === 'https' ? cookie + '; SameSite=None; Secure' : cookie);
        }
      }

      if (result.redirectUrl) {
        res.redirect(result.status || 302, result.redirectUrl);
        return;
      }

      res.status(result.status || 200).json(result.body);
    } catch (err) {
      let status = 500;
      let body = { code: 500, msg: 'Internal Server Error' };
      if (err && typeof err === 'object') {
        status = err.status || err.statusCode || 500;
        if (err.body) body = err.body;
        else if (err.message) body = { code: status, msg: String(err.message) };
        else {
          try { body = { code: status, msg: JSON.stringify(err) }; }
          catch (e) { body = { code: status, msg: String(err) }; }
        }
      } else {
        body = { code: status, msg: String(err) };
      }
      if (err?.cookie && !req.query?.noCookie) res.append('Set-Cookie', err.cookie);
      res.status(status).json(body);
    }
  };
}

export const routeStats = {
  total: 413,
  skipped: 28,
  skippedModules: [{"route":"/ad/listening/rights/gain","reason":"unsupported require: ./ad_get.js"},{"route":"/aidj/content/rcmd","reason":"unsupported require: ../util/logger.js"},{"route":"/api","reason":"unsupported require: ../util/index"},{"route":"/audio/match","reason":"unsupported require: axios"},{"route":"/avatar/upload","reason":"unsupported require: ../plugins/upload"},{"route":"/cloud","reason":"unsupported require: ../plugins/songUpload, ../util/logger.js, ../util/fileHelper, music-metadata"},{"route":"/cloud/upload/token","reason":"unsupported require: axios"},{"route":"/decrypt","reason":"unsupported require: ../util/crypto"},{"route":"/dj/program","reason":"unsupported require: ../util"},{"route":"/eapi/decrypt","reason":"unsupported require: ../util/crypto"},{"route":"/inner/version","reason":"unsupported require: ../package.json"},{"route":"/login/qr/create","reason":"unsupported require: qrcode, ../util/index"},{"route":"/playlist/cover/update","reason":"unsupported require: ../plugins/upload"},{"route":"/playlist/track/add","reason":"unsupported require: ../util/logger.js"},{"route":"/register/anonimous","reason":"unsupported require: path, fs, ../util/logger.js, ../util/index"},{"route":"/register/checktoken/v2","reason":"unsupported require: jsdom, axios, ../util/logger"},{"route":"/register/checktoken/v3","reason":"unsupported require: axios"},{"route":"/register/neapikey","reason":"unsupported require: axios, ../util/neapiKey, ../util/neapiConfig"},{"route":"/register/xeapikey","reason":"unsupported require: axios, ../util/crypto"},{"route":"/related/playlist","reason":"unsupported require: axios"},{"route":"/scrobble/v1","reason":"unsupported require: ../util/ncbl"},{"route":"/song/download/url/v1","reason":"unsupported require: ../util/index.js"},{"route":"/song/url/match","reason":"unsupported require: ../util/logger.js, @neteasecloudmusicapienhanced/unblockmusic-utils"},{"route":"/song/url/v1","reason":"unsupported require: ../util/logger.js, ../util/index.js, @neteasecloudmusicapienhanced/unblockmusic-utils, dotenv"},{"route":"/song/url/v1/302","reason":"unsupported require: ../util/index.js"},{"route":"/user/event/all","reason":"unsupported require: ./user_account.js, ./user_event.js"},{"route":"/verify/getQr","reason":"unsupported require: qrcode"},{"route":"/voice/upload","reason":"unsupported require: axios, fs, xml2js, ../plugins/upload, ../util/fileHelper"}],
};
