// 사이트의 언어 규칙입니다. 한국어가 원본이고 루트에, 영어 번역은 /en/ 아래에 둡니다.
//
// - 페이지 id: 한국어 'data/01-segments', 영어 'en/data/01-segments'. 홈은 '' 와 'en'입니다.
// - site-areas.mjs의 dir는 언어와 상관없는 기본 id(한국어 id)입니다. 영어 페이지는 앞에 'en/'만 붙습니다.
// - 영어 글은 같은 경로의 한국어 글을 번역한 것이고, frontmatter translatedFrom에 번역할 때의 commit을 적습니다.
//   한국어 원본이 그 뒤에 바뀌면 scripts/check-translations.mjs와 글 위 안내가 알려 줍니다.
// - 번역이 없는 영어 주소는 Starlight가 한국어 내용으로 채운 fallback 페이지입니다.
//   src/route-middleware.ts가 이 페이지를 검색엔진과 sidebar에서 빼고, 한국어 원본을 canonical로 지정합니다.

export const defaultLocale = 'ko';
export const locales = ['ko', 'en'];
export const langOf = { ko: 'ko', en: 'en' };

const EN = 'en';

/** 페이지 id의 언어 */
export const localeOfId = (id = '') => (id === EN || id.startsWith(`${EN}/`) ? 'en' : 'ko');

/** 'en/data/01-segments' -> 'data/01-segments', 'en' -> '' */
export const baseIdOf = (id = '') => (id === EN ? '' : id.startsWith(`${EN}/`) ? id.slice(EN.length + 1) : id);

/** 기본 id에 언어를 붙입니다. ('data', 'en') -> 'en/data', ('', 'en') -> 'en' */
export const localizedId = (baseId, locale) => (locale === 'en' ? (baseId ? `${EN}/${baseId}` : EN) : baseId);

/** Starlight route의 locale 값(undefined | 'en')을 'ko' | 'en'으로 바꿉니다. */
export const toLocale = (routeLocale) => (routeLocale === 'en' ? 'en' : 'ko');

// 직접 만든 컴포넌트와 파일에 쓰는 UI 문자열입니다. Starlight 기본 UI 문자열은 Starlight가 번역합니다.
const strings = {
  ko: {
    areaNav: '영역',
    trailNav: '위치',
    areaOverview: '영역 개요',
    overview: '개요',
    collectionGo: '컬렉션 보기',
    articleCount: '글 {n}편',
    latest: '최근 공개',
    upcomingNew: '새 컬렉션',
    upcomingExisting: '기존 컬렉션에 추가',
    copy: '복사',
    copied: '복사됨',
    copyFailed: '복사 실패',
    staleTranslation: '',
  },
  en: {
    areaNav: 'Areas',
    trailNav: 'Location',
    areaOverview: 'Area overview',
    overview: 'Overview',
    collectionGo: 'View collection',
    articleCount: '{n} articles',
    latest: 'Latest',
    upcomingNew: 'New collection',
    upcomingExisting: 'Adds to an existing collection',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    staleTranslation: 'The Korean original has been updated since this translation. Some details may differ until the translation is refreshed.',
  },
};

export const t = (locale, key, vars = {}) =>
  (strings[locale]?.[key] ?? strings.ko[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
