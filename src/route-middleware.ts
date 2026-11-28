// 페이지마다 sidebar를 그 페이지가 속한 영역으로 좁히고, 검색엔진과 AI agent가 읽는 정보를 붙입니다.
// - sidebar: astro.config.mjs는 영역마다 그룹을 하나씩 만듭니다. 여기서 지금 페이지가 속한 영역(또는 About)
//   그룹의 내용만 남깁니다. 다른 영역으로는 sidebar 맨 위 영역 목록(src/components/Sidebar.astro)으로 이동합니다.
// - <title>: 컬렉션 글은 "글 제목 | 컬렉션 topic"으로 만듭니다(site-areas.mjs의 topic).
// - 공유 미리보기: og:image, twitter:image, og:title
// - 글 날짜: article:published_time, article:modified_time (git 이력 기준)
// - Markdown 원문: <link rel="alternate" type="text/markdown">로 같은 글의 .md 주소를 알려 줍니다.
// - JSON-LD: 홈은 WebSite, 영역과 컬렉션 개요는 CollectionPage, 글은 TechArticle, About은 ProfilePage.
//   모든 하위 페이지에 BreadcrumbList(홈 > 영역 > 컬렉션 > 글)를 붙입니다.
// JSON-LD에는 화면에 보이는 내용만 넣습니다(제목, 설명, 날짜, 글쓴이, 컬렉션 구성).
//
// 언어(src/lib/i18n.mjs)
// - 영어 페이지는 같은 규칙을 영어 문서와 영어 topic으로 적용합니다.
// - 번역이 없는 영어 주소(fallback)는 검색엔진에서 빼고(noindex, canonical은 한국어 원본), 검색 색인에서도 뺍니다.
// - 영어 sidebar에는 번역된 글만 남깁니다.
// - hreflang은 실제로 번역이 있는 페이지끼리만 연결합니다.
import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data';
import { getCollection } from 'astro:content';
import { collectionText, findArea, findCollection, findExtra } from './site-areas.mjs';
import { author, defaultOgImage, siteUrl } from './site-seo.mjs';
import { gitDates } from './lib/git-dates.mjs';
import { markdownUrl } from './lib/agent-markdown.mjs';
import { baseIdOf, langOf, localizedId, toLocale } from './lib/i18n.mjs';

type HeadEntry = StarlightRouteData['head'][number];
type SidebarEntry = StarlightRouteData['sidebar'][number];

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const pageUrl = (id: string) => new URL(id ? `${id}/` : '', siteUrl).href;
const indexId = (id: string) => id.replace(/(^|\/)index$/, '');
const ogImageUrl = new URL(defaultOgImage.path, siteUrl).href;
const homeTitleSuffix = {
  ko: 'Elastic Search, Observability, Security 프로덕션 판단 기준',
  en: 'Production decisions for Elastic Search, Observability and Security',
};

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

const setTitle = (head: HeadEntry[], content: string) => {
  const titleTag = head.find((h) => h.tag === 'title');
  if (titleTag) titleTag.content = content;
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
  const docs = await publishedDocs();
  const translatedIds = new Set(docs.map((d) => indexId(d.id)));

  // id는 주소 기준입니다(영어 fallback 페이지도 'en/...'). baseId는 언어를 뺀 id로 site-areas.mjs 조회에 씁니다.
  const locale = toLocale(route.locale);
  const id = indexId(route.id);
  const baseId = baseIdOf(id);
  const url = pageUrl(id);
  const loc = (dir: string) => localizedId(dir, locale);
  const docOf = (dir: string) => docs.find((d) => indexId(d.id) === loc(dir));

  // A. 번역이 없는 영어 주소: 검색엔진과 검색 색인에서 빼고 한국어 원본을 canonical로 둡니다.
  if (route.isFallback) {
    const koUrl = pageUrl(baseId);
    route.head = head.filter((h) => !(h.tag === 'link' && h.attrs?.rel === 'alternate' && h.attrs?.hreflang));
    const canonical = route.head.find((h) => h.tag === 'link' && h.attrs?.rel === 'canonical');
    if (canonical) canonical.attrs = { ...canonical.attrs, href: koUrl };
    route.head = route.head.filter((h) => !(h.tag === 'meta' && h.attrs?.name === 'robots'));
    route.head.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, follow' } });
    route.entry = { ...entry, data: { ...entry.data, pagefind: false } };
  } else {
    // B. hreflang: 다른 언어판이 실제로 있을 때만 남깁니다.
    const hasEnglish = translatedIds.has(localizedId(baseId, 'en'));
    if (!hasEnglish) {
      route.head = head.filter((h) => !(h.tag === 'link' && h.attrs?.rel === 'alternate' && h.attrs?.hreflang));
    }
  }
  const pageHead = route.head;

  const { title, description } = route.entry.data;
  const collection = findCollection(baseId);
  const text = collection ? collectionText(collection, locale) : undefined;
  const collectionEntry = collection && docOf(collection.dir);
  const isCollectionIndex = !!collection && baseId === collection.dir;
  const isArticle = !!collection && !isCollectionIndex;
  const area = findArea(baseId);
  const areaEntry = area && docOf(area.dir);
  const isAreaIndex = !!area && baseId === area.dir;

  // 0. sidebar를 지금 영역(또는 About)으로 좁힙니다. 그룹은 개요 페이지 링크가 들어 있는 것으로 찾습니다.
  const sectionDir = area?.dir ?? findExtra(baseId)?.dir;
  if (sectionDir) {
    const target = `${base}/${loc(sectionDir)}/`;
    const hasLink = (e: SidebarEntry): boolean => (e.type === 'link' ? e.href === target : e.entries.some(hasLink));
    const group = route.sidebar.find((e) => e.type === 'group' && hasLink(e));
    if (group && group.type === 'group') route.sidebar = group.entries;
  }
  // 영어 sidebar에는 번역된 글만 남기고, 비게 된 그룹은 지웁니다.
  if (locale === 'en') {
    const translatedHref = new Set([...translatedIds].map((d) => `${base}/${d}/`));
    const prune = (entries: SidebarEntry[]): SidebarEntry[] =>
      entries
        .map((e) => (e.type === 'group' ? { ...e, entries: prune(e.entries) } : e))
        .filter((e) => (e.type === 'link' ? translatedHref.has(e.href) : e.entries.length > 0));
    route.sidebar = prune(route.sidebar);
  }

  // 1. <title>과 og:title. 컬렉션 글은 topic을, 컬렉션 개요는 영역 이름을, 홈은 사이트가 다루는 범위를 붙입니다.
  if (!baseId) setTitle(pageHead, `${route.siteTitle} | ${homeTitleSuffix[locale]}`);
  // 컬렉션 개요는 소속 영역 이름을 붙입니다. 예: "수집 | Elastic Stack"
  if (isCollectionIndex && areaEntry) {
    const fullTitle = `${title} | ${areaEntry.data.title}`;
    setTitle(pageHead, fullTitle);
    setMeta(pageHead, 'property', 'og:title', fullTitle);
  }
  if (isArticle && text) {
    const fullTitle = `${title} | ${text.topic}`;
    setTitle(pageHead, fullTitle);
    setMeta(pageHead, 'property', 'og:title', fullTitle);
  }

  // 2. 공유 미리보기 이미지. 영역, 컬렉션, About 페이지는 제목이 들어간 이미지(src/pages/og/)를, 홈은 기본 이미지를 씁니다.
  const inSite = !!area || !!findExtra(baseId);
  const hasOwnImage = !!baseId && inSite && !route.isFallback;
  const imageUrl = hasOwnImage ? new URL(`og/${id}.png`, siteUrl).href : ogImageUrl;
  setMeta(pageHead, 'property', 'og:image', imageUrl);
  setMeta(pageHead, 'property', 'og:image:width', '1200');
  setMeta(pageHead, 'property', 'og:image:height', '630');
  setMeta(pageHead, 'property', 'og:image:alt', hasOwnImage ? title : defaultOgImage.alt);
  setMeta(pageHead, 'name', 'twitter:image', imageUrl);
  setMeta(pageHead, 'name', 'author', author.name);

  if (route.isFallback) return;

  // 3. Markdown 원문 주소. 공개 컬렉션과 About의 .md 글만 있습니다. 홈은 llms.txt를 가리킵니다.
  if (!baseId || (inSite && entry.filePath.endsWith('.md'))) {
    pageHead.push({
      tag: 'link',
      attrs: { rel: 'alternate', type: 'text/markdown', href: baseId ? markdownUrl(id) : new URL('llms.txt', siteUrl).href },
    });
  }

  // 4. 날짜
  const dates = gitDates(entry.filePath);
  const published = dates.published?.toISOString();
  const modified = (route.lastUpdated ?? dates.modified)?.toISOString();
  if (isArticle) {
    if (published) setMeta(pageHead, 'property', 'article:published_time', published);
    if (modified) setMeta(pageHead, 'property', 'article:modified_time', modified);
  }

  // 5. JSON-LD
  const inLanguage = langOf[locale];
  const home = { name: route.siteTitle, url: pageUrl(loc('')) };
  const areaCrumb = area && areaEntry ? [{ name: areaEntry.data.title, url: pageUrl(loc(area.dir)) }] : [];
  if (!baseId) {
    pageHead.push(
      jsonLd({
        '@type': 'WebSite',
        name: route.siteTitle,
        url: home.url,
        description,
        inLanguage,
        author: person,
        publisher: person,
      }),
    );
    return;
  }

  if (isAreaIndex) {
    const collections = area.collections.map((c) => docOf(c.dir)).filter((d) => d !== undefined);
    pageHead.push(
      jsonLd({
        '@type': 'CollectionPage',
        name: title,
        description,
        url,
        inLanguage,
        author: person,
        dateModified: modified,
        isPartOf: { '@type': 'WebSite', ...home },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: collections.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.data.title,
            url: pageUrl(indexId(c.id)),
          })),
        },
      }),
      jsonLd(breadcrumb([home, { name: title, url }])),
    );
    return;
  }

  if (isCollectionIndex && text) {
    const prefix = `${loc(collection.dir)}/`;
    const articles = docs
      .filter((d) => d.id.startsWith(prefix) && indexId(d.id) !== loc(collection.dir))
      .sort((a, b) => (a.data.sidebar?.order ?? 0) - (b.data.sidebar?.order ?? 0));
    pageHead.push(
      jsonLd({
        '@type': 'CollectionPage',
        name: title,
        description,
        url,
        inLanguage,
        about: text.topic,
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
      jsonLd(breadcrumb([home, ...areaCrumb, { name: title, url }])),
    );
    return;
  }

  if (isArticle && text) {
    const collectionTitle = collectionEntry?.data.title ?? text.topic;
    const collectionUrl = pageUrl(loc(collection.dir));
    pageHead.push(
      jsonLd({
        '@type': 'TechArticle',
        headline: title,
        description,
        url,
        mainEntityOfPage: url,
        inLanguage,
        about: text.topic,
        image: imageUrl,
        datePublished: published,
        dateModified: modified,
        author: person,
        publisher: person,
        isPartOf: { '@type': 'CollectionPage', name: collectionTitle, url: collectionUrl },
      }),
      jsonLd(breadcrumb([home, ...areaCrumb, { name: collectionTitle, url: collectionUrl }, { name: title, url }])),
    );
    return;
  }

  // 컬렉션 밖 페이지(About 등)
  if (baseId === 'about') {
    pageHead.push(
      jsonLd({
        '@type': 'ProfilePage',
        name: title,
        url,
        inLanguage,
        dateModified: modified,
        mainEntity: person,
      }),
    );
  }
  pageHead.push(jsonLd(breadcrumb([home, { name: title, url }])));
});
