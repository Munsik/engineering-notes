// 컬렉션 하나의 글을 순서대로 묶은 Markdown입니다. 예: /data/llms-full.txt
import { bundle, siteSections, textResponse } from '../../lib/agent-markdown.mjs';

export async function getStaticPaths() {
  const sections = await siteSections();
  return sections
    .filter((s) => s.topic)
    .map((section) => ({ params: { collection: section.dir }, props: { section } }));
}

export function GET({ props }) {
  const { section } = props;
  return textResponse(bundle([section], `# ${section.title}: 컬렉션 전체 원문 (${section.topic})`));
}
