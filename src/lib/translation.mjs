// 영어 번역이 한국어 원본보다 오래됐는지 git 이력으로 판단합니다.
// - 영어 글 frontmatter의 translatedFrom은 번역할 때 기준으로 삼은 commit입니다.
// - 그 commit 이후 한국어 원본 파일을 바꾼 commit이 있으면 "오래된 번역"입니다.
// - 글 위 안내(src/components/PageTitle.astro)와 scripts/check-translations.mjs가 같은 판단을 씁니다.
import { execFileSync } from 'node:child_process';

const cache = new Map();

/** 'src/content/docs/en/data/01-segments.md' -> 'src/content/docs/data/01-segments.md' */
export const sourcePathOf = (enFilePath) => enFilePath.replace(/(^|\/)src\/content\/docs\/en\//, '$1src/content/docs/');

/** @returns {{ stale: boolean, changes: string[] }} changes는 번역 이후 원본을 바꾼 commit 목록(짧은 hash와 제목) */
export function translationStatus(enFilePath, translatedFrom) {
  const key = `${enFilePath}@${translatedFrom}`;
  if (cache.has(key)) return cache.get(key);
  let result = { stale: false, changes: [] };
  if (translatedFrom) {
    try {
      const out = execFileSync('git', ['log', '--format=%h %s', `${translatedFrom}..HEAD`, '--', sourcePathOf(enFilePath)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const changes = out ? out.split('\n') : [];
      result = { stale: changes.length > 0, changes };
    } catch {
      // commit을 찾을 수 없으면(잘못된 hash, 얕은 clone) 판단하지 않습니다.
    }
  }
  cache.set(key, result);
  return result;
}
