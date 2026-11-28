// 영어 번역 상태를 보고합니다. 실패로 처리하지는 않고 목록만 보여 줍니다.
// - 원본이 바뀐 번역: translatedFrom 이후 한국어 원본에 commit이 있는 글
// - translatedFrom이 없는 번역
// - 아직 번역이 없는 한국어 글 수(컬렉션별)
// 사용법: npm run check:translations
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { translationStatus, sourcePathOf } from '../src/lib/translation.mjs';

const root = 'src/content/docs';
const files = readdirSync(root, { recursive: true }).filter((f) => /\.mdx?$/.test(f));
const en = files.filter((f) => f.startsWith('en/'));
const ko = files.filter((f) => !f.startsWith('en/') && !f.startsWith('en\\'));

const stale = [];
const missingMeta = [];
for (const f of en) {
  const path = join(root, f);
  const front = readFileSync(path, 'utf8').split('---')[1] ?? '';
  const from = front.match(/^translatedFrom:\s*['"]?([0-9a-f]{7,40})/m)?.[1];
  if (!existsSync(sourcePathOf(path))) continue;
  if (!from) {
    missingMeta.push(f);
    continue;
  }
  const { stale: isStale, changes } = translationStatus(path, from);
  if (isStale) stale.push(`${f}\n    ${changes.join('\n    ')}`);
}
const untranslated = ko.filter((f) => !existsSync(join(root, 'en', f)));
const byDir = untranslated.reduce((acc, f) => {
  const dir = f.includes('/') ? f.split('/').slice(0, f.startsWith('ml/') ? 2 : 1).join('/') : '(root)';
  acc[dir] = (acc[dir] ?? 0) + 1;
  return acc;
}, {});

console.log(`영어 번역 ${en.length}개, 번역 없는 한국어 페이지 ${untranslated.length}개`);
console.log(Object.entries(byDir).map(([d, n]) => `  ${d}: ${n}`).join('\n'));
if (missingMeta.length) console.log(`\ntranslatedFrom 없음:\n  ${missingMeta.join('\n  ')}`);
if (stale.length) console.log(`\n원본이 바뀐 번역:\n  ${stale.join('\n  ')}`);
if (!missingMeta.length && !stale.length) console.log('\n모든 번역이 원본과 맞습니다.');
