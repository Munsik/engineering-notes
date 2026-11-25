// 글 파일의 처음 공개 시점과 마지막 수정 시점을 git 이력에서 읽습니다.
// JSON-LD(datePublished, dateModified), sitemap의 lastmod, RSS의 pubDate가 같은 값을 씁니다.
// GitHub Actions는 fetch-depth: 0으로 전체 이력을 가져오므로 배포 결과에도 같은 값이 나옵니다.
// git 이력이 없는 파일(아직 커밋하지 않은 새 글)은 undefined를 돌려줍니다.
import { execFileSync } from 'node:child_process';

const cache = new Map();

const git = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

const toDate = (text) => (text ? new Date(text) : undefined);

export function gitDates(filePath) {
  if (cache.has(filePath)) return cache.get(filePath);
  // 파일을 처음 추가한 commit. 이름을 바꾼 경우도 따라갑니다.
  const created = git(['log', '--follow', '--diff-filter=A', '--format=%cI', '--', filePath]).split('\n').pop();
  const modified = git(['log', '-1', '--format=%cI', '--', filePath]);
  const dates = { published: toDate(created), modified: toDate(modified) };
  cache.set(filePath, dates);
  return dates;
}
