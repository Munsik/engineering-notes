// 글마다 Markdown 원문을 같은 주소 끝에 .md를 붙여 제공합니다.
// 예: /data/01-segments/ -> /data/01-segments.md
// HTML 페이지의 <link rel="alternate" type="text/markdown">가 이 주소를 가리킵니다(src/route-middleware.ts).
import { entryToMarkdown, indexId, siteSections, textResponse } from '../lib/agent-markdown.mjs';

export async function getStaticPaths() {
  const sections = await siteSections();
  return sections.flatMap((section) =>
    [section.index, ...section.articles]
      .filter((entry) => entry.filePath.endsWith('.md'))
      .map((entry) => ({ params: { slug: indexId(entry.id) }, props: { entry, section } })),
  );
}

export function GET({ props }) {
  return textResponse(entryToMarkdown(props.entry, props.section), 'text/markdown');
}
