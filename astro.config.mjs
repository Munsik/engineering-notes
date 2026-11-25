// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import { readFileSync } from 'node:fs';
import { siteCollections } from './src/site-collections.mjs';

// 컬렉션 index.md의 frontmatter에서 title과 draft를 읽습니다.
// sidebar 그룹 이름이 컬렉션 개요 페이지 제목과 항상 같도록 하기 위해서입니다.
const isDev = process.argv.includes('dev');
const collectionIndex = (dir) => {
  const text = readFileSync(new URL(`./src/content/docs/${dir}/index.md`, import.meta.url), 'utf8');
  const frontmatter = text.split('---')[1] ?? '';
  const title = frontmatter.match(/^title:\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
  const draft = /^draft:\s*true\s*$/m.test(frontmatter);
  return { title, draft };
};

// sidebar 규칙
// - 최상위는 컬렉션입니다. 모든 컬렉션은 같은 깊이(컬렉션 > 개요, 01, 02 ...)로 보입니다.
// - 그룹은 기본으로 접혀 있고, 지금 보고 있는 페이지가 속한 컬렉션만 펼쳐집니다.
//   그래서 어느 페이지에서든 전체 컬렉션 목록이 한 화면에 보입니다.
const collectionGroups = siteCollections
  .map(({ dir }) => ({ dir, ...collectionIndex(dir) }))
  .filter(({ draft }) => isDev || !draft)
  .map(({ dir, title }) => ({
    label: title,
    collapsed: true,
    items: [{ autogenerate: { directory: dir } }],
  }));

export default defineConfig({
  site: 'https://munsik.github.io',
  base: '/engineering-notes',
  integrations: [
    // Mermaid는 Starlight보다 먼저 등록해야 ```mermaid 코드 블록이 다이어그램으로 바뀝니다.
    mermaid({ theme: 'default', autoTheme: true, enableLog: false }),
    starlight({
      title: 'Engineering Notes',
      description: '엔터프라이즈 환경에서 기술을 프로덕션에 올릴 때 필요한 판단 기준과 운영 경험',
      locales: {
        root: { label: '한국어', lang: 'ko' },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Munsik/engineering-notes' },
        { icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/munsik-kim-69a9ab144' },
      ],
      editLink: {
        baseUrl: 'https://github.com/Munsik/engineering-notes/edit/main/',
      },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          // Apply the saved TOC width before the first paint so pages do not jump.
          tag: 'script',
          content:
            "try{var w=localStorage.getItem('en-toc-width');if(w)document.documentElement.style.setProperty('--en-toc-width',w+'px')}catch(e){}",
        },
        { tag: 'script', attrs: { src: '/engineering-notes/toc-resizer.js', defer: true } },
      ],
      sidebar: [
        ...collectionGroups,
        {
          label: 'About',
          collapsed: true,
          items: [{ autogenerate: { directory: 'about' } }],
        },
      ],
    }),
  ],
});
