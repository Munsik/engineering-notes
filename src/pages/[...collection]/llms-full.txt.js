// 컬렉션 하나의 글을 순서대로 묶은 Markdown입니다. 예: /data/llms-full.txt
import { bundle, siteSections, textResponse } from '../../lib/agent-markdown.mjs';

export async function getStaticPaths() {
  // 영어 번역이 있는 컬렉션은 /en/<컬렉션>/llms-full.txt에도 만듭니다.
  const sections = [...(await siteSections('ko')), ...(await siteSections('en'))];
  return sections
    .filter((s) => s.kind === 'collection')
    .map((section) => ({ params: { collection: section.dir }, props: { section } }));
}

export function GET({ props }) {
  const { section } = props;
  const heading =
    section.locale === 'en'
      ? `# ${section.title}: full collection text (${section.area}, ${section.topic})`
      : `# ${section.title}: 컬렉션 전체 원문 (${section.area}, ${section.topic})`;
  return textResponse(bundle([section], heading));
}
