# 4. 버전과 플랫폼을 바꿀 때

한 번 하면 몇 년간 다시 하지 않는 일이라 조직 안에 경험이 잘 쌓이지 않습니다.
개인 경험 기반 글의 가치가 큰 영역입니다.

- 예정 폴더: `src/content/docs/change/`
- 예정 labs: `labs/change/`

---

## 4-1. 메이저 업그레이드는 되돌릴 수 없다는 전제로 어떻게 계획하는가

상태: `미착수`
예정 파일: `change/01-major-upgrade.md`, `labs/change/major-upgrade/`

### 이 글이 답하는 질문

- 업그레이드 후 문제가 생기면 이전 버전으로 돌아갈 수 있나
- 돌아갈 수 없다면, 규제나 내부 정책상 롤백 계획이 필요할 때 무엇을 준비하나
- Beats, Logstash, Agent 버전이 섞여 있을 때 순서는 어떻게 정하나
- 7.x 시절에 만든 인덱스가 남아 있으면 무엇을 먼저 해야 하나
- 업그레이드 전 점검은 무엇을 기준으로 하나

### 독자와 전제

- 8.x에서 9.x로 올리는 운영자, 업그레이드 계획을 승인받아야 하는 담당자
- 기준: 8.19에서 9.x 최신으로, self-managed 위주. ECE와 ECK는 차이점만

### 범위

다룸:

- 공식 준비 절차: Upgrade Assistant, deprecation 로그, 호환되지 않는 인덱스 처리
- 이전 버전으로 되돌릴 수 없는 이유와 공식 문서 근거
- 롤백 대안 비교: 병행 클러스터 운영, 수집 원천 재처리, 메시지 큐 offset 재처리. 각각의 비용과 데이터 공백
- 구성 요소별 업그레이드 순서와 버전 호환
- agent 업그레이드는 2-2로 연결

다루지 않음:

- 특정 patch 버전의 결함 내용 (공식 known issues 링크만)

### 목차 초안

1. 업무 문제: "롤백 계획 없이는 승인이 안 난다"
2. 되돌릴 수 없는 이유
3. 설계 결정: 롤백 대안 비교 표
4. 구현: 준비 체크리스트, 단계별 절차
5. 검증: labs에서 rolling upgrade 수행 기록
6. 운영: 업그레이드 당일 확인 항목, 업그레이드 후 관찰 기간
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 환경: 8.19 3노드 클러스터, 7.x에서 만든 것과 같은 조건의 인덱스 포함(가능하면 7.17에서 생성 후 8.19로 올린 인덱스)
- 절차: Upgrade Assistant 점검 → 호환성 문제 해결(reindex 또는 read-only 처리) → snapshot → rolling upgrade → 검증
- 기록: 단계별 소요 시간, 발견된 경고, 해결 방법
- 산출물: 절차 스크립트, 점검 결과 예시

### 공식 출처

- [Prepare to upgrade](https://www.elastic.co/docs/deploy-manage/upgrade/prepare-to-upgrade)
- [Upgrade from 7.17](https://www.elastic.co/docs/deploy-manage/upgrade/deployment-or-cluster/upgrade-717)
- [Upgrade your deployment on ECE](https://www.elastic.co/docs/deploy-manage/upgrade/deployment-or-cluster/upgrade-on-ece)
- [Reindex data stream API](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reindex-data-stream)
- [Snapshot and restore](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore) (snapshot 버전 호환 절)
- [Elasticsearch known issues](https://www.elastic.co/docs/release-notes/elasticsearch/known-issues)

### 확인할 사실

- [ ] snapshot을 이전 버전 클러스터에 복원할 수 없다는 공식 문구 위치
- [ ] 9.x가 읽을 수 있는 인덱스 생성 버전 범위와 read-only 호환 옵션
- [ ] 구성 요소 버전 호환에 대한 공식 문서(Beats, Logstash, Agent와 Elasticsearch)
- [ ] 8.x 최소 업그레이드 시작 버전
- [ ] CCR로 롤백용 클러스터를 유지할 수 있는지에 대한 공식 문서의 버전 호환 조건

### 작업 항목

- [ ] labs 업그레이드 시나리오 구성과 실행
- [ ] 롤백 대안 비교 표 작성
- [ ] 준비 체크리스트 작성
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 4-2. 보안 공지가 나왔을 때 무엇을 확인하고 어느 버전으로 가는가

상태: `미착수`
예정 파일: `change/02-security-advisory-response.md`, `labs/change/version-inventory/`

### 이 글이 답하는 질문

- 보안 공지가 나왔을 때 어디를 보고, 우리 환경이 해당되는지 어떻게 판단하나
- Elasticsearch에 번들된 JDK의 취약점은 어떻게 판단하나
- 어느 patch 버전으로 갈지 무엇을 기준으로 고르나
- 보안 조직에 무엇을 근거로 설명하나

### 독자와 전제

- 보안 조직과 운영 조직 사이에서 대응을 맡는 담당자. 규제 산업에서 특히 자주 필요
- 기준: Elastic Stack 9.x

### 범위

다룸:

- 공식 보안 공지 확인 경로와 공지 읽는 법(영향 버전, 수정 버전, 완화책)
- 구성 요소별 버전 인벤토리 만드는 법(Elasticsearch, Kibana, Agent, Logstash, 번들 JDK)
- patch 버전 선택: release notes와 known issues를 함께 확인하는 절차
- 보안 조직 보고용 정리 양식

다루지 않음:

- 개별 취약점의 기술 분석
- 공개되지 않은 대응 일정

### 목차 초안

1. 업무 문제: "공지가 나오면 보안팀이 당일 영향도를 요구한다"
2. 공식 정보가 나오는 곳
3. 설계 결정: 영향 판단 순서, 버전 선택 기준
4. 구현: 버전 인벤토리 스크립트, 보고 양식
5. 운영: 정기 점검 주기, 공지 구독
6. 판단 기준 요약 (해석)

### labs 실험 설계

- 버전 인벤토리 스크립트: `_nodes`(버전, JVM 정보), Kibana status API, Fleet agents API로 구성 요소별 버전을 모아 표로 출력
- 산출물: 스크립트, 출력 예시

### 공식 출처

- [Product security](https://www.elastic.co/product-security)
- [Elasticsearch release notes](https://www.elastic.co/docs/release-notes/elasticsearch)
- [Elasticsearch known issues](https://www.elastic.co/docs/release-notes/elasticsearch/known-issues)
- [Fleet Server known issues](https://www.elastic.co/docs/release-notes/fleet-server/known-issues)

### 확인할 사실

- [ ] 보안 공지 게시 위치와 구독 방법
- [ ] 번들 JDK 대신 별도 JDK를 쓸 때의 공식 지원 조건
- [ ] `_nodes` API에서 JVM 버전을 확인하는 필드
- [ ] 제품별 유지보수 기간에 대한 공개 정책 페이지

### 작업 항목

- [ ] 인벤토리 스크립트 작성과 테스트
- [ ] 보고 양식 작성
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 4-3. 다른 플랫폼이나 구버전 데이터를 어떻게 옮겨 오는가

상태: `미착수`
예정 파일: `change/03-data-migration.md`, `labs/change/data-migration/`

### 이 글이 답하는 질문

- 다른 검색 플랫폼(OpenSearch 등)이나 오래된 Elasticsearch의 데이터를 어떻게 옮기나
- reindex from remote, snapshot, 재수집 중 무엇을 고르나
- 옮긴 데이터가 맞는지 어떻게 검증하나
- 전환(cutover)은 어떤 순서로 하나

### 독자와 전제

- 플랫폼 전환이나 구버전 정리를 맡은 담당자
- 기준: Elasticsearch 9.x를 대상으로 하는 이관

### 범위

다룸:

- 이관 방식 비교: reindex from remote, snapshot 복원(호환 범위 안에서), 원천 재수집
- 매핑과 수명주기 정책을 옮길 때 확인할 것
- 검증: 문서 수, 표본 문서 비교, 집계 결과 비교
- 전환 순서와 병행 운영 기간

다루지 않음:

- 다른 플랫폼에 대한 평가나 비교 주장 (공개 자료로 확인 가능한 호환성 차이만 사실로 서술)
- 비공개 이관 도구

### 목차 초안

1. 업무 문제: "데이터는 옮겼는데 결과가 다르게 나온다"
2. 이관 방식 비교 표
3. 설계 결정: 방식 선택 기준, 병행 기간
4. 구현: reindex from remote 예시, 검증 스크립트
5. 검증: labs에서 이관과 검증 수행
6. 운영: 전환 체크리스트
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 원천: 오픈소스 검색 엔진 컨테이너 또는 7.17 Elasticsearch에 synthetic 데이터 적재
- 대상: Elasticsearch 9.x
- reindex from remote 수행, 매핑 차이 처리, 검증 스크립트로 비교
- 산출물: 이관 스크립트, 검증 스크립트, 결과

### 공식 출처

- [Reindex indices examples (remote 포함)](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reindex-indices)
- [Reindex from a self-managed cluster using a private CA](https://www.elastic.co/docs/manage-data/migrate/migrate-from-a-self-managed-cluster-with-a-self-signed-certificate-using-remote-reindex)
- [Reindex data stream API](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reindex-data-stream)
- [Snapshot and restore](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore)

### 확인할 사실

- [ ] reindex from remote의 원천 버전 지원 범위와 허용 목록 설정
- [ ] 다른 플랫폼에서 이관하는 공식 가이드나 Labs 글 존재 여부
- [ ] snapshot 복원 가능 버전 범위
- [ ] reindex 처리량을 높이는 공식 옵션(slices 등)

### 작업 항목

- [ ] 원천 환경 구성과 이관 실험 실행
- [ ] 검증 스크립트 작성
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)
