// 사이트에 공개하는 컬렉션 목록입니다. sidebar와 홈의 컬렉션 카드가 모두 이 목록을 따릅니다.
//
// - 새 컬렉션을 공개할 때는 여기에 한 줄을 추가합니다. 다른 파일은 고치지 않습니다.
// - 순서는 planning/ROADMAP.md의 문제 축 순서입니다. sidebar와 홈 카드가 같은 순서로 나옵니다.
// - 컬렉션 이름과 설명은 각 컬렉션 index.md의 title, description을 그대로 씁니다.
// - axis는 홈 카드 위에 붙는 문제 축 이름입니다(ROADMAP의 괄호 안 이름).
// - topic은 검색 결과에 보이는 페이지 제목(<title>) 뒤에 붙는 주제 이름입니다.
//   "Job 설계"처럼 글 제목만으로는 무슨 제품 이야기인지 모르므로, 제품과 주제를 함께 씁니다.
//   예: "Job 설계 | Elasticsearch ML anomaly detection". 화면의 제목(H1)과 sidebar는 바뀌지 않습니다.
// - index.md가 draft인 컬렉션은 build할 때 sidebar와 홈에서 자동으로 빠집니다.
export const siteCollections = [
  { dir: 'data', axis: '설계', topic: 'Elasticsearch 데이터 설계' },
  { dir: 'ingest', axis: '수집', topic: 'Elastic 데이터 수집' },
  { dir: 'operations', axis: '운영', topic: 'Elasticsearch 안정성 운영' },
  { dir: 'change', axis: '변화 관리', topic: 'Elastic 변화 관리' },
  { dir: 'ml/anomaly-detection', axis: '탐지와 알림', topic: 'Elasticsearch ML anomaly detection' },
];
