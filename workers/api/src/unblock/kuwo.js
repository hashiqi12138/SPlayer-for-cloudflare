/**
 * 酷我音源解锁
 *
 * 来源：splayer-frontend/electron/server/unblock/kuwo.ts，逻辑保持一致，
 * 差异仅在：axios → fetch、http 直链升级为 https、补充超时。
 *
 * 流程：搜索 → 按歌名/歌手匹配 → DES 加密请求取直链
 */

import { encryptQuery } from './kwdes.js';
import { isSongMatch } from './match.js';
import { getTextAny, toHttps } from './http.js';

// 与上游一致的客户端标识，酷我按此下发 convert_url2
const PACKAGE_NAME = 'kwplayer_ar_5.1.0.0_B_jiakong_vh.apk';
const KUWO_UA = 'okhttp/3.10.0';

/**
 * 搜索并匹配出酷我歌曲 ID
 * @param {{keyword: string, songName?: string, artist?: string}} match
 * @returns {Promise<string|null>}
 */
async function getKuwoSongId(match) {
  const url =
    'https://search.kuwo.cn/r.s?&correct=1&stype=comprehensive&encoding=utf8' +
    '&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=' +
    encodeURIComponent(match.keyword);

  const text = await getTextAny(url, { headers: { 'User-Agent': KUWO_UA } });
  const data = JSON.parse(text);

  const abslist = data?.content?.[1]?.musicpage?.abslist;
  if (!Array.isArray(abslist) || abslist.length < 1) return null;

  for (const item of abslist) {
    const rid = item?.MUSICRID;
    if (!rid) continue;
    if (isSongMatch(item?.SONGNAME || '', item?.ARTIST || '', match)) {
      return String(rid).replace(/^MUSIC_/, '');
    }
  }
  return null;
}

/**
 * 获取酷我歌曲播放地址
 * @param {{keyword: string, songName?: string, artist?: string}} match
 * @returns {Promise<{code: number, url: string|null}>}
 */
async function getKuwoSongUrl(match) {
  try {
    if (!match?.keyword) return { code: 404, url: null, reason: 'empty-keyword' };

    const songId = await getKuwoSongId(match);
    if (!songId) return { code: 404, url: null, reason: 'no-match' };

    const query = encryptQuery(
      `corp=kuwo&source=${PACKAGE_NAME}&p2p=1&type=convert_url2&sig=0&format=mp3&rid=${songId}`,
    );
    const text = await getTextAny(`https://mobi.kuwo.cn/mobi.s?f=kuwo&q=${query}`, {
      headers: { 'User-Agent': KUWO_UA },
    });

    const matched = text.match(/http[^\s$"]+/);
    if (!matched) return { code: 404, url: null, reason: 'no-url' };

    return { code: 200, url: toHttps(matched[0]) };
  } catch (err) {
    const reason =
      err?.name === 'TimeoutError' || /timeout/i.test(err?.message || '')
        ? 'timeout'
        : 'error';
    console.error('[unblock/kuwo]', reason, err?.message || err);
    return { code: 404, url: null, reason };
  }
}

export default getKuwoSongUrl;
