import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // 검색 결과 화면(Pagefind) 문구처럼 Starlight에 한국어 번역이 없는 UI 문자열입니다(src/content/i18n/ko.json).
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
