// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import sitemap from '@astrojs/sitemap';
import starlightImageZoom from 'starlight-image-zoom';
import { readFileSync, readdirSync } from 'node:fs';
import { siteAreas } from './src/site-areas.mjs';
import { siteUrl, siteVerification } from './src/site-seo.mjs';
import { gitDates } from './src/lib/git-dates.mjs';

// 영역과 컬렉션 index.md의 frontmatter에서 title과 draft를 읽습니다.
// sidebar 그룹 이름이 개요 페이지 제목과 항상 같도록 하기 위해서입니다.
const isDev = process.argv.includes('dev');
const collectionIndex = (dir) => {
  const text = readFileSync(new URL(`./src/content/docs/${dir}/index.md`, import.meta.url), 'utf8');
  const frontmatter = text.split('---')[1] ?? '';
  const title = frontmatter.match(/^title:\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
  const draft = /^draft:\s*true\s*$/m.test(frontmatter);
  return { title, draft };
};

// sidebar 규칙
// - 구조는 영역 > 컬렉션 > 글입니다(src/site-areas.mjs). 여기서는 영역마다 그룹 하나를 만듭니다.
//   그룹 안은 영역 개요 링크와 컬렉션 그룹들이고, 컬렉션 그룹은 기본으로 접혀 있습니다.
// - 화면에는 지금 페이지가 속한 영역(또는 About)의 그룹만 보입니다. 나머지 영역은 sidebar 맨 위의
//   영역 목록으로 이동합니다. 이 교체는 src/route-middleware.ts가, 영역 목록은 src/components/Sidebar.astro가 맡습니다.
//   그래서 영역과 컬렉션이 늘어도 sidebar 길이는 한 영역의 컬렉션 수만큼만 늘어납니다.
// - 그룹 이름은 영역과 컬렉션 index.md의 title을 그대로 씁니다.
const collectionGroup = (dir) => {
  const { title, draft } = collectionIndex(dir);
  return draft && !isDev ? undefined : { label: title, collapsed: true, items: [{ autogenerate: { directory: dir } }] };
};
const areaGroups = siteAreas
  .map(({ dir, collections }) => ({ dir, collections, ...collectionIndex(dir) }))
  .filter(({ draft }) => isDev || !draft)
  .map(({ dir, title, collections }) => ({
    label: title,
    collapsed: false,
    items: [{ slug: dir, label: '영역 개요' }, ...collections.map((c) => collectionGroup(c.dir)).filter(Boolean)],
  }));

// sitemap의 lastmod. 페이지 URL과 원본 파일을 짝지어 git 마지막 수정 시점을 넣습니다.
// Google은 lastmod가 꾸준히 정확할 때만 참고하므로, 손으로 쓰지 않고 git 이력에서 읽습니다.
const docsRoot = new URL('./src/content/docs/', import.meta.url);
const lastmodByUrl = new Map(
  readdirSync(docsRoot, { recursive: true })
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => {
      const id = file.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
      const url = new URL(id ? `${id}/` : '', siteUrl).href;
      return [url, gitDates(`src/content/docs/${file}`).modified];
    }),
);

// 검색엔진 소유권 확인 meta. site-seo.mjs에 값이 있는 것만 넣습니다.
const verificationMeta = Object.entries({
  'google-site-verification': siteVerification.google,
  'naver-site-verification': siteVerification.naver,
  'msvalidate.01': siteVerification.bing,
})
  .filter(([, content]) => content)
  .map(([name, content]) => ({ tag: 'meta', attrs: { name, content } }));


export default defineConfig({
  site: 'https://munsik.github.io',
  base: '/engineering-notes',
  integrations: [
    // Starlight가 기본으로 넣는 sitemap 대신 lastmod를 넣은 sitemap을 씁니다.
    // 같은 이름의 integration이 있으면 Starlight는 자기 sitemap을 추가하지 않습니다.
    sitemap({
      serialize(item) {
        const lastmod = lastmodByUrl.get(item.url);
        return lastmod ? { ...item, lastmod: lastmod.toISOString() } : item;
      },
    }),
    // Mermaid는 Starlight보다 먼저 등록해야 ```mermaid 코드 블록이 다이어그램으로 바뀝니다.
    // Mermaid 12의 기본 layout은 elk(약 1.5MB)입니다. 이 사이트의 flowchart는 dagre로 충분해서 dagre로 고정합니다.
    mermaid({ theme: 'default', autoTheme: true, enableLog: false, mermaidConfig: { layout: 'dagre' } }),
    starlight({
      title: 'Engineering Notes',
      // 본문 이미지(Kibana 화면 캡처)를 누르면 크게 볼 수 있습니다.
      plugins: [starlightImageZoom()],
      description: '엔터프라이즈 환경에서 기술을 프로덕션에 올릴 때 필요한 판단 기준과 운영 경험',
      locales: {
        root: { label: '한국어', lang: 'ko' },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Munsik/engineering-notes' },
        { icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/munsik-kim-69a9ab144' },
      ],
      lastUpdated: true,
      // 페이지마다 <title>, 공유 미리보기, JSON-LD를 붙입니다. 규칙은 파일 안에 적었습니다.
      routeMiddleware: './src/route-middleware.ts',
      customCss: ['./src/styles/custom.css'],
      head: [
        ...verificationMeta,
        // 검색 결과와 Discover에서 큰 미리보기 이미지를 허용합니다.
        { tag: 'meta', attrs: { name: 'robots', content: 'max-image-preview:large' } },
        // 새 글 피드와 AI agent용 요약 파일을 찾을 수 있게 알려 줍니다.
        {
          tag: 'link',
          attrs: { rel: 'alternate', type: 'application/rss+xml', title: 'Engineering Notes', href: '/engineering-notes/rss.xml' },
        },
        {
          // Apply the saved TOC width before the first paint so pages do not jump.
          tag: 'script',
          content:
            "try{var w=localStorage.getItem('en-toc-width');if(w)document.documentElement.style.setProperty('--en-toc-width',w+'px')}catch(e){}",
        },
        { tag: 'script', attrs: { src: '/engineering-notes/toc-resizer.js', defer: true } },
      ],
      components: {
        // sidebar 맨 위에 영역 목록을, 글 제목 위에 "영역 › 컬렉션" 위치 표시를 붙입니다.
        Sidebar: './src/components/Sidebar.astro',
        PageTitle: './src/components/PageTitle.astro',
      },
      sidebar: [
        ...areaGroups,
        {
          label: 'About',
          collapsed: true,
          items: [{ autogenerate: { directory: 'about' } }],
        },
      ],
    }),
  ],
});
