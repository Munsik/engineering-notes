// 빌드 결과(dist)에서 사이트 안 링크가 실제 페이지와 heading id를 가리키는지 검사합니다.
// 깨진 링크가 하나라도 있으면 목록을 보여 주고 실패합니다(exit 1). 배포 workflow와 PR 검사에서 실행합니다.
// 사용법: npm run build && npm run check:links
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const dist = 'dist';
const base = '/engineering-notes/';
const skipExt = /\.(xml|txt|md|svg|css|js|png|jpg|jpeg|webp|json)$/;

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const pages = readdirSync(dist, { recursive: true })
  .filter((f) => f.endsWith('index.html'))
  .map((f) => {
    const rel = relative(dist, dirname(join(dist, f)));
    const path = rel ? `${base}${rel}/` : base;
    return { path, html: readFileSync(join(dist, f), 'utf8') };
  });
const ids = new Map(pages.map(({ path, html }) => [path, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => decode(m[1])))]));

const broken = [];
for (const { path, html } of pages) {
  for (const [, raw] of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    const href = decode(raw);
    if (/^(https?:|mailto:)/.test(href)) continue;
    const url = new URL(href, `https://site${path}`);
    if (!url.pathname.startsWith(base) || skipExt.test(url.pathname)) continue;
    // Starlight는 언어별 홈을 '/en'처럼 끝의 '/' 없이 링크하므로 '/'를 붙여 봅니다.
    let target = decodeURI(url.pathname);
    if (!ids.has(target) && ids.has(`${target}/`)) target = `${target}/`;
    if (!ids.has(target)) {
      broken.push(`페이지 없음   ${path} -> ${href}`);
      continue;
    }
    const anchor = decodeURIComponent(url.hash.slice(1));
    if (anchor && !ids.get(target).has(anchor)) broken.push(`anchor 없음  ${path} -> ${href}`);
  }
}

if (broken.length) {
  console.error(broken.join('\n'));
  console.error(`\n깨진 링크 ${broken.length}건`);
  process.exit(1);
}
console.log(`링크 검사 통과: 페이지 ${pages.length}개`);
