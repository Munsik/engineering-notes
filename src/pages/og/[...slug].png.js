// 페이지마다 공유 미리보기 이미지를 만듭니다. 예: /og/data/01-segments.png
// src/route-middleware.ts가 og:image와 twitter:image를 이 주소로 바꿉니다. 홈은 public/og-default.png를 씁니다.
import { indexId, siteSections } from '../../lib/agent-markdown.mjs';
import { renderOgImage } from '../../lib/og-image.mjs';

export async function getStaticPaths() {
  const sections = await siteSections();
  return sections.flatMap((section) =>
    [section.index, ...section.articles].map((entry) => {
      const id = indexId(entry.id);
      const isIndex = entry === section.index;
      // 글: "영역 › 컬렉션", 컬렉션 개요: 영역, 영역 개요와 About: 위치 표시 없음
      const eyebrow =
        section.kind === 'collection' ? (isIndex ? section.area : `${section.area} › ${section.title}`) : undefined;
      return { params: { slug: id }, props: { title: entry.data.title, eyebrow } };
    }),
  );
}

export async function GET({ props }) {
  const png = await renderOgImage(props);
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
