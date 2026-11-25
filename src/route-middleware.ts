// 페이지마다 검색엔진과 AI agent가 읽는 정보를 붙입니다.
// - <title>: 컬렉션 글은 "글 제목 | 컬렉션 topic"으로 만듭니다(site-collections.mjs의 topic).
// - 공유 미리보기: og:image, twitter:image, og:title
// - 글 날짜: article:published_time, article:modified_time (git 이력 기준)
// - Markdown 원문: <link rel="alternate" type="text/markdown">로 같은 글의 .md 주소를 알려 줍니다.
// - JSON-LD: 홈은 WebSite, 컬렉션 개요는 CollectionPage, 글은 TechArticle, About은 ProfilePage.
//   모든 하위 페이지에 BreadcrumbList를 붙입니다.
// JSON-LD에는 화면에 보이는 내용만 넣습니다(제목, 설명, 날짜, 글쓴이, 컬렉션 구성).
import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data';
import { getCollection } from 'astro:content';
import { siteCollections } from './site-collections.mjs';
import { author, defaultOgImage, siteUrl } from './site-seo.mjs';
import { gitDates } from './lib/git-dates.mjs';
import { markdownUrl } from './lib/agent-markdown.mjs';

type HeadEntry = StarlightRouteData['head'][number];

const pageUrl = (id: string) => new URL(id ? `${id}/` : '', siteUrl).href;
const indexId = (id: string) => id.replace(/(^|\/)index$/, '');
const ogImageUrl = new URL(defaultOgImage.path, siteUrl).href;
const homeTitleSuffix = 'Elastic Search, Observability, Security 프로덕션 판단 기준';

const person = {
  '@type': 'Person',
  name: author.name,
  alternateName: author.alternateName,
  jobTitle: author.jobTitle,
  worksFor: { '@type': 'Organization', name: author.worksFor },
  url: author.url,
  sameAs: author.sameAs,
};

let docsCache: Awaited<ReturnType<typeof getCollection<'docs'>>> | undefined;
const publishedDocs = async () =>
  (docsCache ??= await getCollection('docs', ({ data }) => import.meta.env.DEV || !data.draft));

const setMeta = (head: HeadEntry[], key: 'name' | 'property', value: string, content: string) => {
  const found = head.find((h) => h.tag === 'meta' && h.attrs?.[key] === value);
  if (found) found.attrs = { ...found.attrs, content };
  else head.push({ tag: 'meta', attrs: { [key]: value, content } });
};

const jsonLd = (data: object): HeadEntry => ({
  tag: 'script',
  attrs: { type: 'application/ld+json' },
  content: JSON.stringify({ '@context': 'https://schema.org', ...data }),
});

const breadcrumb = (items: { name: string; url: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: item.url })),
});

export const onRequest = defineRouteMiddleware(async (context) => {
  const route = context.locals.starlightRoute;
  const { entry, head } = route;
  const id = indexId(entry.id);
  const url = pageUrl(id);
  const { title, description } = entry.data;
  const docs = await publishedDocs();

  const collection = siteCollections.find(({ dir }) => id === dir || id.startsWith(`${dir}/`));
  const collectionEntry = collection && docs.find((d) => indexId(d.id) === collection.dir);
  const isCollectionIndex = !!collection && id === collection.dir;
  const isArticle = !!collection && !isCollectionIndex;

  // 1. <title>과 og:title. 컬렉션 글은 topic을 붙이고, 홈은 사이트가 다루는 범위를 붙입니다.
  if (!id) {
    const titleTag = head.find((h) => h.tag === 'title');
    if (titleTag) titleTag.content = `${route.siteTitle} | ${homeTitleSuffix}`;
  }
  if (isArticle) {
    const fullTitle = `${title} | ${collection.topic}`;
    const titleTag = head.find((h) => h.tag === 'title');
    if (titleTag) titleTag.content = fullTitle;
    setMeta(head, 'property', 'og:title', fullTitle);
  }

  // 2. 공유 미리보기 이미지
  setMeta(head, 'property', 'og:image', ogImageUrl);
  setMeta(head, 'property', 'og:image:width', '1200');
  setMeta(head, 'property', 'og:image:height', '630');
  setMeta(head, 'property', 'og:image:alt', defaultOgImage.alt);
  setMeta(head, 'name', 'twitter:image', ogImageUrl);
  setMeta(head, 'name', 'author', author.name);

  // 3. Markdown 원문 주소. 공개 컬렉션과 About의 .md 글만 있습니다. 홈은 llms.txt를 가리킵니다.
  const inSite = !!collection || id === 'about' || id.startsWith('about/');
  if (!id || (inSite && entry.filePath.endsWith('.md'))) {
    head.push({
      tag: 'link',
      attrs: { rel: 'alternate', type: 'text/markdown', href: id ? markdownUrl(id) : new URL('llms.txt', siteUrl).href },
    });
  }

  // 4. 날짜
  const dates = gitDates(entry.filePath);
  const published = dates.published?.toISOString();
  const modified = (route.lastUpdated ?? dates.modified)?.toISOString();
  if (isArticle) {
    if (published) setMeta(head, 'property', 'article:published_time', published);
    if (modified) setMeta(head, 'property', 'article:modified_time', modified);
  }

  // 5. JSON-LD
  const home = { name: route.siteTitle, url: siteUrl };
  if (!id) {
    head.push(
      jsonLd({
        '@type': 'WebSite',
        name: route.siteTitle,
        url: siteUrl,
        description,
        inLanguage: 'ko',
        author: person,
        publisher: person,
      }),
    );
    return;
  }

  if (isCollectionIndex) {
    const articles = docs
      .filter((d) => d.id.startsWith(`${collection.dir}/`) && indexId(d.id) !== collection.dir)
      .sort((a, b) => (a.data.sidebar?.order ?? 0) - (b.data.sidebar?.order ?? 0));
    head.push(
      jsonLd({
        '@type': 'CollectionPage',
        name: title,
        description,
        url,
        inLanguage: 'ko',
        about: collection.topic,
        author: person,
        dateModified: modified,
        isPartOf: { '@type': 'WebSite', ...home },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: articles.map((a, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: a.data.title,
            url: pageUrl(a.id),
          })),
        },
      }),
      jsonLd(breadcrumb([home, { name: title, url }])),
    );
    return;
  }

  if (isArticle) {
    const collectionTitle = collectionEntry?.data.title ?? collection.topic;
    const collectionUrl = pageUrl(collection.dir);
    head.push(
      jsonLd({
        '@type': 'TechArticle',
        headline: title,
        description,
        url,
        mainEntityOfPage: url,
        inLanguage: 'ko',
        about: collection.topic,
        image: ogImageUrl,
        datePublished: published,
        dateModified: modified,
        author: person,
        publisher: person,
        isPartOf: { '@type': 'CollectionPage', name: collectionTitle, url: collectionUrl },
      }),
      jsonLd(breadcrumb([home, { name: collectionTitle, url: collectionUrl }, { name: title, url }])),
    );
    return;
  }

  // 컬렉션 밖 페이지(About 등)
  if (id === 'about') {
    head.push(
      jsonLd({
        '@type': 'ProfilePage',
        name: title,
        url,
        inLanguage: 'ko',
        dateModified: modified,
        mainEntity: person,
      }),
    );
  }
  head.push(jsonLd(breadcrumb([home, { name: title, url }])));
});
