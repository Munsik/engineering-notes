// 새 글 알림용 RSS를 언어별로 만듭니다. /rss.xml(한국어), /en/rss.xml(영어 번역).
// 공개된 컬렉션(site-areas.mjs)의 글만 넣습니다. 날짜는 git에서 처음 추가된 시점이고, 영어는 번역을 공개한 시점입니다.
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { collectionText, siteCollections } from '../site-areas.mjs';
import { siteUrl } from '../site-seo.mjs';
import { gitDates } from './git-dates.mjs';
import { localizedId } from './i18n.mjs';

const text = {
  ko: { description: 'Elastic Search, Observability, Security를 프로덕션에 올릴 때 필요한 판단 기준과 운영 경험', language: 'ko' },
  en: { description: 'Practitioner notes on designing and running Elastic Search, Observability and Security in production', language: 'en' },
};

export async function feed(locale) {
  const docs = await getCollection('docs', ({ data }) => !data.draft);
  const indexId = (id) => id.replace(/(^|\/)index$/, '');
  const loc = (dir) => localizedId(dir, locale);
  const has = (dir) => docs.some((d) => indexId(d.id) === loc(dir));
  const collections = siteCollections.filter(({ dir }) => has(dir));
  const items = docs
    .map((doc) => {
      const id = indexId(doc.id);
      const collection = collections.find(({ dir }) => id.startsWith(`${loc(dir)}/`));
      if (!collection) return undefined;
      const { published: pubDate } = gitDates(doc.filePath);
      return {
        title: doc.data.title,
        description: doc.data.description,
        link: new URL(`${id}/`, siteUrl).href,
        pubDate: pubDate ?? new Date(),
        categories: [docs.find((d) => indexId(d.id) === loc(collection.area))?.data.title, collectionText(collection, locale).topic].filter(Boolean),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.pubDate - a.pubDate);

  return rss({
    title: 'Engineering Notes',
    description: text[locale].description,
    site: new URL(locale === 'en' ? 'en/' : '', siteUrl).href,
    items,
    customData: `<language>${text[locale].language}</language>`,
  });
}
