// 홈의 "다음에 쓸 글" 목록입니다. 아직 발행하지 않은 주제를 쓰려는 순서대로 둡니다.
//
// - 순서와 제목은 planning/ROADMAP.md의 진행 단계와 TO-DO를 따릅니다. ROADMAP을 바꾸면 여기도 같이 바꿉니다.
// - 글을 발행하면 그 주제를 이 목록에서 뺍니다. 그룹의 주제가 모두 빠지면 그룹도 지웁니다.
// - axis는 홈 컬렉션 카드와 같은 문제 축 이름입니다.
// - collection은 이미 공개한 컬렉션에 글을 더할 때만 그 폴더(src/site-collections.mjs의 dir)를 씁니다.
//   새 컬렉션이면 비워 두고 name에 컬렉션 이름을 씁니다.
// - 날짜나 완료 시점은 적지 않습니다. 보류한 주제(ROADMAP의 `보류`)도 넣지 않습니다.
export const upcomingTopics = [
  {
    axis: '탐지와 알림',
    collection: 'ml/anomaly-detection',
    topics: ['탐지 결과를 triage와 후속 조치로 연결하기', 'job이 수백 개를 넘을 때의 운영'],
  },
  {
    axis: '탐지와 알림',
    name: 'Alerting 설계',
    topics: ['alert가 오지 않으면 정상이라고 믿을 수 있게 만드는 alerting 설계'],
  },
  {
    axis: '검색',
    name: '검색 품질 측정과 개선',
    topics: ['semantic search를 도입하기 전에 측정할 것', 'embedding, LLM 제공자가 바뀌어도 버티는 검색 설계'],
  },
];
