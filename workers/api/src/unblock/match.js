/**
 * 解锁音源结果与原曲的匹配校验
 *
 * 来源：splayer-frontend/electron/server/unblock/match.ts，原样移植。
 * 音源搜索结果常带 "(伴奏版)"、"Live" 等后缀，直接比对会误判，
 * 因此先归一化再做双向 includes。
 */

/** 归一化歌名：小写 + 去除括号及其内容 */
export const normalizeName = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '')
    .trim();

/** 归一化艺术家：小写 + 统一分隔符为空格 */
export const normalizeArtist = (artist) =>
  String(artist || '')
    .toLowerCase()
    .replace(/[&/、，,;；]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 校验搜索结果是否与原曲匹配（歌名 + 艺术家）
 *
 * @param {string} resultName 搜索结果歌名
 * @param {string|undefined} resultArtist 搜索结果艺术家
 * @param {{songName?: string, artist?: string}} match 原曲信息
 * @returns {boolean}
 */
export const isSongMatch = (resultName, resultArtist, match) => {
  const normalizedResult = normalizeName(resultName);
  const normalizedOriginal = normalizeName(match.songName);

  // 结果歌名为空视为无效；原曲未提供歌名时跳过歌名校验
  if (!normalizedResult) return false;
  if (normalizedOriginal) {
    if (
      !normalizedResult.includes(normalizedOriginal) &&
      !normalizedOriginal.includes(normalizedResult)
    ) {
      return false;
    }
  }

  // 艺术家：任一侧为空则跳过
  if (resultArtist && match.artist) {
    const normalizedResultArtist = normalizeArtist(resultArtist);
    const normalizedOriginalArtist = normalizeArtist(match.artist);
    if (normalizedResultArtist && normalizedOriginalArtist) {
      if (
        !normalizedResultArtist.includes(normalizedOriginalArtist) &&
        !normalizedOriginalArtist.includes(normalizedResultArtist)
      ) {
        return false;
      }
    }
  }

  return true;
};

export default { normalizeName, normalizeArtist, isSongMatch };
