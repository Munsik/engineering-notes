// 링크를 공유할 때 보이는 미리보기 이미지(1200x630)를 페이지마다 만듭니다.
// - 글 제목과 위치(영역 › 컬렉션)를 넣어, LinkedIn이나 메신저에서 어떤 글인지 바로 알 수 있게 합니다.
// - 디자인은 public/og-default.png와 같은 계열입니다(어두운 배경, 로고, 하늘색 강조).
// - 글꼴은 npm 패키지 pretendard의 TTF를 빌드할 때만 읽습니다. 사이트 방문자는 이 글꼴을 받지 않습니다.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(join(process.cwd(), 'package.json'));
const fontDir = require.resolve('pretendard/package.json').replace(/package\.json$/, 'dist/public/static/alternative/');
const fonts = [
  { name: 'Pretendard', data: readFileSync(`${fontDir}Pretendard-Regular.ttf`), weight: 400, style: 'normal' },
  { name: 'Pretendard', data: readFileSync(`${fontDir}Pretendard-Bold.ttf`), weight: 700, style: 'normal' },
];
// 빌드 중에는 이 파일이 다른 위치로 묶이므로, 경로는 프로젝트 루트(process.cwd()) 기준으로 찾습니다.
const logo = `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), 'public/favicon.svg')).toString('base64')}`;

const el = (type, style, children) => ({ type, props: { style, children } });

// 제목 길이에 따라 글자 크기를 줄여 3줄 안에 들어가게 합니다.
const titleSize = (title) => (title.length <= 22 ? 68 : title.length <= 40 ? 58 : 50);

/** @param {{ title: string, eyebrow?: string }} page */
export async function renderOgImage({ title, eyebrow }) {
  const tree = el(
    'div',
    {
      width: 1200,
      height: 630,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '72px 84px 56px',
      backgroundColor: '#111827',
      backgroundImage:
        'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
      backgroundSize: '40px 40px',
      fontFamily: 'Pretendard',
      color: '#f9fafb',
    },
    [
      el('div', { display: 'flex', alignItems: 'center', gap: 20 }, [
        { type: 'img', props: { src: logo, width: 64, height: 64, style: { borderRadius: 14 } } },
        el('div', { fontSize: 34, fontWeight: 700 }, 'Engineering Notes'),
      ]),
      el(
        'div',
        { display: 'flex', flexDirection: 'column', width: 1032, gap: 22 },
        [
          eyebrow ? el('div', { fontSize: 30, color: '#38bdf8' }, eyebrow) : null,
          el(
            'div',
            { display: 'flex', width: 1032, fontSize: titleSize(title), fontWeight: 700, lineHeight: 1.25, wordBreak: 'keep-all' },
            title,
          ),
        ].filter(Boolean),
      ),
      el('div', { display: 'flex', width: 1032, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: '#374151', paddingTop: 26, justifyContent: 'space-between', fontSize: 26 }, [
        el('div', { color: '#38bdf8' }, 'munsik.github.io/engineering-notes'),
        el('div', { color: '#9ca3af' }, 'Munsik Kim · Principal SA, Elastic'),
      ]),
    ],
  );
  const svg = await satori(tree, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
