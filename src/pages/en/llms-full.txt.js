// 영어 번역 전체를 한 파일로 묶은 Markdown입니다. 한국어 전체 원문은 /llms-full.txt에 있습니다.
import { bundle, siteSections, textResponse } from '../../lib/agent-markdown.mjs';

export async function GET() {
  const sections = await siteSections('en');
  return textResponse(bundle(sections, '# Engineering Notes: full text (English translation)'));
}
