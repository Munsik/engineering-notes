// 검색엔진과 AI agent에 보여 줄 사이트 정보입니다.
// astro.config.mjs, src/route-middleware.ts, src/pages/rss.xml.js가 이 파일을 함께 읽습니다.

export const siteUrl = 'https://munsik.github.io/engineering-notes/';

// 글쓴이. JSON-LD의 author와 About 페이지(ProfilePage)에 들어갑니다.
// About 페이지에 보이는 내용과 같아야 합니다. 바꿀 때는 about/index.md도 같이 봅니다.
export const author = {
  name: 'Munsik Kim',
  alternateName: '김문식',
  jobTitle: 'Principal Solutions Architect',
  worksFor: 'Elastic',
  url: `${siteUrl}about/`,
  sameAs: ['https://github.com/Munsik', 'https://www.linkedin.com/in/munsik-kim-69a9ab144'],
};

// 링크를 공유할 때 미리보기에 쓰는 기본 이미지(1200x630)입니다. public/ 아래에 있습니다.
export const defaultOgImage = {
  path: 'og-default.png',
  alt: 'Engineering Notes. Elastic Search, Observability, Security를 프로덕션에 올릴 때의 판단 기준',
};

// 검색엔진 소유권 확인 값입니다. 각 서비스에서 받은 "HTML 태그" 방식의 content 값만 넣습니다.
// 빈 값이면 meta 태그를 만들지 않습니다.
// - google: Google Search Console, URL 접두어 속성 https://munsik.github.io/engineering-notes/
// - naver: 네이버 서치어드바이저. 호스트 단위(https://munsik.github.io)로만 등록되므로 이 사이트에 넣어도 확인되지 않습니다(planning 0-5 참고)
// - bing: Bing Webmaster Tools (Google Search Console에서 가져오기를 쓰면 비워 둬도 됩니다)
export const siteVerification = {
  google: '2pl5m_SjU5RhIo0jw9i_N8PWLIQ3N9_WcV-Vv1PSINU',
  naver: '',
  bing: '',
};
