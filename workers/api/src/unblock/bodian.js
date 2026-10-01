/**
 * 波点音源解锁
 *
 * 来源：splayer-frontend/electron/server/unblock/bodian.ts，逻辑保持一致，
 * 差异仅在：axios → fetch、MD5 改用 crypto-js、直链升级为 https。
 *
 * 流程：搜索 → 匹配 → 生成签名 → 触发广告免广告 → 取直链
 */

import CryptoJS from 'crypto-js';
import { isSongMatch } from './match.js';
import { getTextAny, postTextAny, toHttps } from './http.js';

// 与上游一致的客户端标识
const DART_UA = 'Dart/2.19 (dart:io)';

function getRandomDeviceId() {
  const min = 0;
  const max = 100000000000;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

/** 进程内复用同一个设备 ID（与上游一致） */
const deviceId = getRandomDeviceId();

const baseHeaders = () => ({
  'user-agent': DART_UA,
  plat: 'ar',
  channel: 'aliopen',
  devid: deviceId,
  ver: '3.9.0',
  host: 'bd-api.kuwo.cn',
  accept: 'application/json, text/plain, */*',
});

/** 把搜索结果统一成便于匹配的结构 */
const format = (song) => ({
  id: String(song.MUSICRID || '').split('_').pop(),
  name: song.SONGNAME,
  duration: song.DURATION * 1000,
  album: { id: song.ALBUMID, name: song.ALBUM },
  artists: String(song.ARTIST || '')
    .split('&')
    .map((name, index) => ({ id: index ? null : song.ARTISTID, name })),
});

/**
 * 生成接口签名
 *
 * 规则：在 URL 上追加 timestamp，取 query 段去掉非字母数字后排序，
 * 拼成 `kuwotest{排序后的字符}{pathname}` 再取 MD5。
 */
const generateSign = (str) => {
  const url = new URL(str);
  const currentTime = Date.now();
  const withTs = `${str}&timestamp=${currentTime}`;

  const filteredChars = withTs
    .substring(withTs.indexOf('?') + 1)
    .replace(/[^a-zA-Z0-9]/g, '')
    .split('')
    .sort();

  const dataToEncrypt = `kuwotest${filteredChars.join('')}${url.pathname}`;
  const md5 = CryptoJS.MD5(dataToEncrypt).toString();
  return `${withTs}&sign=${md5}`;
};

/** 搜索并匹配出歌曲 ID */
async function search(match) {
  const keyword = encodeURIComponent(String(match.keyword).replace(' - ', ' '));
  const url =
    'https://search.kuwo.cn/r.s?&correct=1&vipver=1&stype=comprehensive&encoding=utf8' +
    '&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=' +
    keyword;

  const text = await getTextAny(url, { headers: { 'User-Agent': DART_UA, accept: 'application/json, text/plain, */*' } });
  const data = JSON.parse(text);

  const abslist = data?.content?.[1]?.musicpage?.abslist;
  if (!Array.isArray(abslist) || abslist.length < 1) return null;

  for (const raw of abslist) {
    const item = format(raw);
    if (!item?.id) continue;
    const artistStr = item.artists?.map((a) => a.name).join('&') || '';
    if (isSongMatch(item.name || '', artistStr, match)) {
      return item.id;
    }
  }
  return null;
}

/**
 * 触发一次「看广告免广告」请求。
 * 上游在取直链前会调用它，属于尽力而为：失败不影响主流程。
 */
async function sendAdFreeRequest() {
  const adUrl =
    'https://bd-api.kuwo.cn/api/service/advert/watch' +
    '?uid=-1&token=&timestamp=1724306124436&sign=15a676d66285117ad714e8c8371691da';

  const body = JSON.stringify({ type: 5, subType: 5, musicId: 0, adToken: '' });

  await postTextAny(adUrl, body, {
    headers: { ...baseHeaders(), 'content-type': 'application/json; charset=utf-8' },
    timeout: 15000,
  });
}

/**
 * 获取波点歌曲播放地址
 * @param {{keyword: string, songName?: string, artist?: string}} match
 * @returns {Promise<{code: number, url: string|null}>}
 */
async function getBodianSongUrl(match) {
  try {
    if (!match?.keyword) return { code: 404, url: null, reason: 'empty-keyword' };

    const songId = await search(match);
    if (!songId) {
      console.warn('[unblock/bodian] 搜索无匹配', match.keyword);
      return { code: 404, url: null, reason: 'no-match' };
    }

    let audioUrl = `https://bd-api.kuwo.cn/api/play/music/v2/audioUrl?&br=320kmp3&musicId=${songId}`;
    audioUrl = generateSign(audioUrl);

    // 尽力触发免广告，失败继续
    try {
      await sendAdFreeRequest();
    } catch (e) {
      /* ignore */
    }

    const text = await getTextAny(audioUrl, {
      headers: { ...baseHeaders(), 'X-Forwarded-For': '1.0.1.114' },
    });
    const data = JSON.parse(text);

    const url = data?.data?.audioHttpsUrl || data?.data?.audioUrl;
    if (!url) {
      const msg = data?.msg || '';
      // 407：版权保护，仅限中国大陆地区使用。
      // Cloudflare 出口通常在境外，会稳定撞到这条限制，属环境限制而非实现缺陷。
      const reason =
        data?.code === 407 || msg.includes('地区')
          ? 'region-locked'
          : // 20018：没有解锁付费歌曲，属正常业务结果
            'no-url';
      console.warn(
        `[unblock/bodian] ${reason} songId=${songId} code=${data?.code} msg=${msg}`,
      );
      return { code: 404, url: null, reason };
    }

    return { code: 200, url: toHttps(url) };
  } catch (err) {
    const reason =
      err?.name === 'TimeoutError' || /timeout/i.test(err?.message || '')
        ? 'timeout'
        : 'error';
    console.error('[unblock/bodian]', reason, err?.message || err);
    return { code: 404, url: null, reason };
  }
}

export default getBodianSongUrl;
