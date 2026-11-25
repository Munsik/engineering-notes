// 사이트의 모든 공개 글을 한 파일로 묶은 Markdown입니다. 형식은 src/lib/agent-markdown.mjs를 따릅니다.
import { bundle, siteSections, textResponse } from '../lib/agent-markdown.mjs';

export async function GET() {
  const sections = await siteSections();
  return textResponse(bundle(sections, '# Engineering Notes: 전체 원문'));
}
