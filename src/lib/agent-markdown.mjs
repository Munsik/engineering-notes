// AI agent와 LLM이 읽는 Markdown을 만듭니다.
// llms.txt, llms-full.txt, 컬렉션별 llms-full.txt, 글마다의 .md 파일이 모두 이 파일을 씁니다.
//
// 원칙
// - 화면에 보이는 글과 같은 내용입니다. 따로 요약하거나 다시 쓰지 않습니다.
// - 원본 Markdown을 그대로 쓰되, 상대 링크는 사이트의 절대 URL로 바꿉니다.
//   글을 한 파일로 묶거나 다른 곳에 붙여도 링크가 깨지지 않게 하기 위해서입니다.
// - 이미지는 GitHub 저장소의 원본 파일 URL로 바꿉니다. alt 문장이 그림 설명 역할을 합니다.
// - 공개된 영역 개요와 컬렉션(site-areas.mjs), About만 넣습니다. draft는 넣지 않습니다.
import { posix } from 'node:path';
import { getCollection } from 'astro:content';
import { siteAreas, siteCollections } from '../site-areas.mjs';
import { author, siteUrl } from '../site-seo.mjs';
import { gitDates } from './git-dates.mjs';

const rawBase = 'https://raw.githubusercontent.com/Munsik/engineering-notes/main/';

export const indexId = (id) => id.replace(/(^|\/)index$/, '');
export const pageUrl = (id) => new URL(id ? `${id}/` : '', siteUrl).href;
// HTML 주소 끝의 "/"를 ".md"로 바꾼 주소입니다. 홈은 index.md입니다.
export const markdownUrl = (id) => new URL(id ? `${id}.md` : 'index.md', siteUrl).href;

const byOrder = (a, b) => (a.data.sidebar?.order ?? 0) - (b.data.sidebar?.order ?? 0);

/**
 * 공개된 페이지를 사이트 순서대로 묶어 돌려줍니다.
 * 영역마다 [영역 개요 섹션, 컬렉션 섹션...] 순서이고, 마지막에 About이 옵니다.
 * 섹션은 { kind: 'area' | 'collection' | 'extra', dir, area, topic, title, description, index, articles } 형태입니다.
 * area는 소속 영역 개요 페이지의 title입니다.
 */
export async function siteSections() {
  const docs = await getCollection('docs', ({ data }) => !data.draft);
  const indexOf = (dir) => docs.find((d) => indexId(d.id) === dir);
  const sections = [];
  for (const area of siteAreas) {
    const areaIndex = indexOf(area.dir);
    if (!areaIndex) continue;
    const areaTitle = areaIndex.data.title;
    sections.push({
      kind: 'area',
      dir: area.dir,
      area: areaTitle,
      topic: undefined,
      title: areaTitle,
      description: areaIndex.data.description,
      index: areaIndex,
      articles: docs.filter((d) => d.id.startsWith(`${area.dir}/`) && d !== areaIndex && !siteCollections.some((c) => d.id.startsWith(`${c.dir}/`) || indexId(d.id) === c.dir)).sort(byOrder),
    });
    for (const { dir, topic } of area.collections) {
      const index = indexOf(dir);
      if (!index) continue;
      const articles = docs.filter((d) => d.id.startsWith(`${dir}/`) && d !== index).sort(byOrder);
      sections.push({ kind: 'collection', dir, area: areaTitle, topic, title: index.data.title, description: index.data.description, index, articles });
    }
  }
  const aboutPages = docs.filter((d) => d.id === 'about' || d.id.startsWith('about/')).sort(byOrder);
  const aboutIndex = aboutPages.find((d) => indexId(d.id) === 'about');
  if (aboutIndex) {
    sections.push({
      kind: 'extra',
      dir: 'about',
      area: undefined,
      topic: undefined,
      title: 'About',
      description: aboutIndex.data.description,
      index: aboutIndex,
      articles: aboutPages.filter((d) => d !== aboutIndex),
    });
  }
  return sections;
}

// fenced code block 밖의 Markdown 링크와 이미지 경로만 바꿉니다.
function absolutize(body, entry) {
  const base = pageUrl(indexId(entry.id));
  const fileDir = posix.dirname(entry.filePath);
  const link = /(!?)\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;
  let inFence = false;
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(link, (all, bang, text, href, title = '') => {
        if (/^[a-z]+:/i.test(href)) return all; // https:, mailto: 등은 그대로
        if (bang) {
          const repoPath = posix.normalize(posix.join(fileDir, href));
          return `![${text}](${rawBase}${repoPath}${title})`;
        }
        return `[${text}](${decodeURI(new URL(href, base).href)}${title})`;
      });
    })
    .join('\n');
}

/** 페이지 하나를 Markdown 문서로 만듭니다. 맨 위에 출처 정보를 붙입니다. */
export function entryToMarkdown(entry, section) {
  const id = indexId(entry.id);
  const { modified } = gitDates(entry.filePath);
  const meta = [
    `- URL: ${pageUrl(id)}`,
    section?.area ? `- 영역: ${section.area}` : undefined,
    section?.kind === 'collection' ? `- 컬렉션: ${section.title} (${section.topic})` : undefined,
    modified ? `- 마지막 수정: ${modified.toISOString().slice(0, 10)}` : undefined,
    `- 글쓴이: ${author.name}(${author.alternateName}), ${author.jobTitle} at ${author.worksFor}`,
  ].filter(Boolean);
  return [
    `# ${entry.data.title}`,
    entry.data.description ? `> ${entry.data.description}` : undefined,
    meta.join('\n'),
    absolutize(entry.body ?? '', entry).trim(),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** 여러 섹션의 모든 페이지를 한 파일로 묶습니다. */
export function bundle(sections, heading) {
  const parts = [heading];
  for (const section of sections) {
    for (const entry of [section.index, ...section.articles]) {
      if (entry.filePath.endsWith('.md')) parts.push(entryToMarkdown(entry, section));
    }
  }
  return parts.join('\n\n---\n\n') + '\n';
}

export const textResponse = (body, type = 'text/plain') =>
  new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8` } });
