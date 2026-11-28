// 사이트의 공개 구조입니다. sidebar, 홈, 글 위의 위치 표시, <title>, JSON-LD, llms.txt가 모두 이 목록을 따릅니다.
//
// 구조는 세 단계로 고정합니다: 영역 > 컬렉션 > 글.
// - 영역(area)은 다루는 기술의 경계입니다. 예: Elastic Stack.
//   영역마다 개요 페이지(<dir>/index.md)가 있고, 그 title과 description이 sidebar와 홈에 그대로 쓰입니다.
// - 컬렉션은 그 영역 안에서 업무 문제 하나를 여러 글로 나눠 다룹니다. 이름과 설명은 컬렉션 index.md에서 읽습니다.
// - 컬렉션 안에 하위 그룹을 만들지 않습니다.
//
// 바꿀 때
// - 새 컬렉션: 컬렉션 index.md를 발행하고 해당 영역의 collections에 한 줄을 넣습니다.
//   순서는 planning/ROADMAP.md의 문제 축 순서이고, sidebar와 홈 카드가 같은 순서로 나옵니다.
// - 새 영역: 아래 맨 끝의 예시처럼 블록 하나를 추가하고 <dir>/index.md를 씁니다.
//   새 영역의 컬렉션은 URL이 섞이지 않게 영역 폴더 아래(<dir>/<collection>/)에 둡니다.
//   Elastic Stack의 컬렉션만 영역 도입 전에 공개해서 영역 폴더 밖에 있습니다(URL 유지, 2026-11-28 결정).
// - 다른 파일(astro.config.mjs, 홈 index.mdx, 컴포넌트)은 고치지 않습니다.
// - 영역이나 컬렉션의 index.md가 draft면 production build에서 sidebar와 홈에서 자동으로 빠집니다.
//   영역을 draft로 둘 때는 그 영역의 컬렉션 index.md와 글도 draft로 둡니다. 그래야 RSS와 검색에도 나오지 않습니다.
//
// 필드
// - axis: 홈 카드 위에 붙는 문제 축 이름(ROADMAP의 괄호 안 이름)
// - topic: 검색 결과에 보이는 <title> 뒤에 붙는 주제 이름. 글 제목만으로는 무슨 제품 이야기인지 모르므로
//   제품과 주제를 함께 씁니다. 예: "Job 설계 | Elasticsearch ML anomaly detection"
export const siteAreas = [
  {
    dir: 'elastic',
    collections: [
      { dir: 'data', axis: '설계', topic: 'Elasticsearch 데이터 설계' },
      { dir: 'ingest', axis: '수집', topic: 'Elastic 데이터 수집' },
      { dir: 'operations', axis: '운영', topic: 'Elasticsearch 안정성 운영' },
      { dir: 'change', axis: '변화 관리', topic: 'Elastic 변화 관리' },
      { dir: 'ml/anomaly-detection', axis: '탐지와 알림', topic: 'Elasticsearch ML anomaly detection' },
    ],
  },
  // 다음 영역 자리입니다. 주제가 정해지면 주석을 풀고 <dir>/index.md를 draft로 먼저 만듭니다.
  // {
  //   dir: 'next-area',
  //   collections: [{ dir: 'next-area/first-collection', axis: '문제 축', topic: '제품 + 주제' }],
  // },
];

// 영역 밖에 있는 공통 페이지입니다. sidebar 맨 위 목록에서 영역 다음에 나옵니다.
export const siteExtras = [{ dir: 'about', label: 'About' }];

// 모든 컬렉션을 한 줄로 편 목록입니다. 각 항목에 소속 영역의 dir(area)이 붙습니다.
export const siteCollections = siteAreas.flatMap((area) =>
  area.collections.map((collection) => ({ ...collection, area: area.dir })),
);

// 페이지 id(예: 'ingest/03-no-gap-ingest', 'elastic')가 속한 영역과 컬렉션을 찾습니다.
const inDir = (id, dir) => id === dir || id.startsWith(`${dir}/`);
export const findCollection = (id) =>
  siteCollections
    .filter(({ dir }) => inDir(id, dir))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
export const findArea = (id) => {
  const collection = findCollection(id);
  if (collection) return siteAreas.find(({ dir }) => dir === collection.area);
  return siteAreas.find(({ dir }) => inDir(id, dir));
};
export const findExtra = (id) => siteExtras.find(({ dir }) => inDir(id, dir));
