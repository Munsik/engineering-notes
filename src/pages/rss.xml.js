// 새 글 알림용 RSS입니다. 네이버 서치어드바이저의 RSS 제출과 피드 구독기가 읽습니다.
// 공개된 컬렉션(site-areas.mjs)의 글만 넣고, 날짜는 git에서 처음 추가된 시점입니다.
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { siteCollections } from '../site-areas.mjs';
import { siteUrl } from '../site-seo.mjs';
import { gitDates } from '../lib/git-dates.mjs';

export async function GET() {
  const docs = await getCollection('docs', ({ data }) => !data.draft);
  const indexId = (id) => id.replace(/(^|\/)index$/, '');
  const published = new Set(
    siteCollections.map(({ dir }) => dir).filter((dir) => docs.some((d) => indexId(d.id) === dir)),
  );
  const items = docs
    .map((doc) => {
      const id = indexId(doc.id);
      const collection = siteCollections.find(({ dir }) => id.startsWith(`${dir}/`) && published.has(dir));
      if (!collection) return undefined;
      const { published: pubDate } = gitDates(doc.filePath);
      return {
        title: doc.data.title,
        description: doc.data.description,
        link: new URL(`${id}/`, siteUrl).href,
        pubDate: pubDate ?? new Date(),
        categories: [docs.find((d) => indexId(d.id) === collection.area)?.data.title, collection.topic].filter(Boolean),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.pubDate - a.pubDate);

  return rss({
    title: 'Engineering Notes',
    description: 'Elastic Search, Observability, Security를 프로덕션에 올릴 때 필요한 판단 기준과 운영 경험',
    site: siteUrl,
    items,
    customData: '<language>ko</language>',
  });
}
