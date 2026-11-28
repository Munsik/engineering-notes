// AI agent와 LLM이 사이트를 처음 볼 때 읽는 안내 파일입니다(llmstxt.org 형식).
// 컬렉션별로 글 목록과 한 줄 설명, Markdown 원문 주소를 보여 줍니다.
import { markdownUrl, pageUrl, siteSections, textResponse, indexId } from '../lib/agent-markdown.mjs';
import { author, siteUrl } from '../site-seo.mjs';

export async function GET() {
  const sections = await siteSections('ko');
  const enSections = await siteSections('en');
  const out = [
    '# Engineering Notes',
    '> Elastic Search, Observability, Security를 엔터프라이즈 프로덕션에 올릴 때 필요한 판단 기준과 운영 경험을 정리한 기술 노트입니다. ' +
      'Practitioner notes on designing and running Elasticsearch, Kibana and Elastic solutions in production.',
    [
      '- 글은 한국어로 쓰고, 기술 용어와 API 이름은 영어 원어 그대로 둡니다. Content is written in Korean; technical terms stay in English.',
      '- 영어 번역이 있는 글은 같은 경로 앞에 /en/을 붙인 주소에 있습니다. 목록은 맨 아래 English translation 절에 있습니다. English translations live under /en/ and are listed in the English translation section below.',
      '- 글마다 맨 위에 기준 버전과 공식 문서를 다시 확인한 날짜가 있습니다. 공식 문서로 확인한 사실에는 출처 링크가 있고, 출처가 없는 판단과 권장은 글쓴이의 현장 경험입니다. 확인하지 못한 내용은 "확인 필요"로 표시합니다.',
      '- 실측 수치는 실제로 돌린 lab 결과이고, 재현용 코드와 원본 결과는 GitHub 저장소의 labs/ 폴더에 있습니다.',
      `- 글쓴이: ${author.name}(${author.alternateName}), ${author.jobTitle} at ${author.worksFor}. 개인의 경험과 의견을 바탕으로 썼습니다.`,
      '- 모든 글은 주소 끝의 "/"를 ".md"로 바꾸면 Markdown 원문을 받을 수 있습니다. 아래 목록의 (Markdown) 링크가 그 주소입니다.',
      `- 사이트 전체 원문: ${new URL('llms-full.txt', siteUrl).href}`,
    ].join('\n'),
  ];
  for (const section of sections) {
    const heading =
      section.kind === 'area' ? `${section.title} 영역` : section.kind === 'collection' ? `${section.title} (${section.area})` : section.title;
    const lines = [`## ${heading}`];
    if (section.kind === 'collection') {
      lines.push(`${section.description}`);
      lines.push(`컬렉션 전체 원문: ${new URL(`${section.dir}/llms-full.txt`, siteUrl).href}`);
    }
    const entries = [section.index, ...section.articles];
    lines.push(
      entries
        .map((e) => {
          const id = indexId(e.id);
          return `- [${e.data.title}](${pageUrl(id)}) ([Markdown](${markdownUrl(id)})): ${e.data.description ?? ''}`;
        })
        .join('\n'),
    );
    out.push(lines.join('\n\n'));
  }
  if (enSections.length) {
    out.push(
      [
        '## English translation',
        'Translations of the Korean originals. Each page links back to its source; the Korean page is authoritative if they differ.',
        `Full English text: ${new URL('en/llms-full.txt', siteUrl).href}`,
      ].join('\n\n'),
    );
    for (const section of enSections) {
      const heading = section.kind === 'area' ? `${section.title} area (English)` : section.kind === 'collection' ? `${section.title} (${section.area}, English)` : `${section.title} (English)`;
      const lines = [`### ${heading}`];
      if (section.kind === 'collection') {
        lines.push(section.description);
        lines.push(`Full collection text: ${new URL(`${section.dir}/llms-full.txt`, siteUrl).href}`);
      }
      lines.push(
        [section.index, ...section.articles]
          .map((e) => {
            const id = indexId(e.id);
            return `- [${e.data.title}](${pageUrl(id)}) ([Markdown](${markdownUrl(id)})): ${e.data.description ?? ''}`;
          })
          .join('\n'),
      );
      out.push(lines.join('\n\n'));
    }
  }
  out.push(
    [
      '## Optional',
      '- [실습 코드와 실측 결과 (GitHub)](https://github.com/Munsik/engineering-notes/tree/main/labs): 글에 쓴 Dev Tools 요청, 데이터 생성 코드, 원본 측정 결과',
      `- [RSS](${new URL('rss.xml', siteUrl).href}): 새 글 피드`,
    ].join('\n'),
  );
  return textResponse(out.join('\n\n') + '\n');
}
