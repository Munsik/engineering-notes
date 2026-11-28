import { defineMiddleware } from 'astro:middleware';

// 영어 fallback 페이지(/en/ 아래에서 한국어 본문을 보여 주는 페이지)의 링크를 고칩니다.
// 본문 안의 상대 링크는 /en/ 기준으로 풀리는데, 대상이 영어로 번역된 글이면 heading이 영어라서
// 한국어 anchor(#...)가 맞지 않습니다. 그래서 anchor가 있는 링크는 한국어 원문 주소로 바꿉니다.
// anchor가 없는 링크는 그대로 둡니다. 번역이 있으면 영어 글로, 없으면 다른 fallback 페이지로 갑니다.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const enPrefix = `${base}/en/`;

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (!context.url.pathname.startsWith(enPrefix)) return response;
  if (!response.headers.get('content-type')?.includes('text/html')) return response;
  // Starlight 페이지가 아니면(llms.txt, rss.xml 등) starlightRoute를 읽을 때 오류가 납니다.
  let isFallback = false;
  try {
    isFallback = !!context.locals.starlightRoute?.isFallback;
  } catch {
    return response;
  }
  if (!isFallback) return response;

  const page = new URL(context.url.pathname.replace(/\/?$/, '/'), 'https://site.invalid');
  const html = await response.text();
  const out = html.replace(/href="(\.{1,2}\/[^"#]*#[^"]+)"/g, (match, href) => {
    const target = new URL(href, page);
    if (!target.pathname.startsWith(enPrefix)) return match;
    const ko = `${base}/${target.pathname.slice(enPrefix.length)}`;
    return `href="${ko}${target.hash}" hreflang="ko"`;
  });
  return new Response(out, { status: response.status, headers: response.headers });
});
