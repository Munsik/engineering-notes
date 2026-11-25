# 3. 클러스터가 죽지 않게, 죽어도 돌아오게

운영 중 장애를 겪는 사람에게 가장 필요한 내용입니다. self-managed 비중이 높은 환경을 기본으로 씁니다.
3-1과 3-2는 1단계 labs 환경을 재사용합니다.

- 예정 폴더: `src/content/docs/operations/`
- 예정 labs: `labs/operations/`

---

## 3-1. 노드가 왜 죽었는지 어떻게 좁혀 가는가

상태: `미착수`
예정 파일: `operations/01-node-failure-triage.md`, `labs/operations/node-failure-triage/`

### 이 글이 답하는 질문

- heap이 가득 차서 노드가 재시작됐다. 원인을 어떻게 좁히나
- circuit breaker 오류(429)와 OutOfMemoryError는 무엇이 다른가
- heap은 안정적인데 OS 메모리가 계속 줄어든다. 무엇을 봐야 하나
- self-managed에서 OS 설정은 무엇을 확인해야 하나. 공식 권고가 있는 것과 없는 것은

### 독자와 전제

- self-managed 클러스터 운영자, 장애 원인 분석을 맡은 담당자
- 기준: Elasticsearch 9.x, Linux

### 범위

다룸:

- 증상별 분기: 429와 circuit breaker / GC 과다 / OOM / OS의 프로세스 종료
- 원인 좁히기 순서: `_nodes/stats`(jvm, breaker, thread_pool, indices), hot threads, tasks, GC 로그
- 자주 보이는 원인 유형: 큰 aggregation, 큰 bulk, 많은 shard와 큰 cluster state, merge 적체
- OS 설정: 공식 문서의 important system configuration 항목, 백신 예외(공식 문구 범위), memory lock, cgroup 한도
- 공식 문서에서 확인되지 않는 OS 튜닝은 "확인 필요"로 분리

다루지 않음:

- heap dump 상세 분석 기법 (도구 소개 수준까지만)

### 목차 초안

1. 업무 문제: "노드가 재시작됐는데 로그에 단서가 없다"
2. 메모리 구조: heap, off-heap, OS page cache
3. 증상별 분기 흐름도 (mermaid)
4. 구현: 진단 명령 모음과 읽는 법
5. 검증: labs에서 각 증상 재현과 진단
6. 운영: 평소 지켜볼 지표와 임계값, OS 설정 체크리스트
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 환경: heap을 작게 잡은 노드(예: 1GB) 1~3대
- 재현:
  - 고 cardinality terms aggregation으로 request breaker 발생
  - 큰 bulk 요청과 동시 요청으로 indexing pressure와 거부 발생
  - shard와 매핑을 늘려 cluster state가 커질 때 master heap 변화 관찰
- 각 경우에 진단 명령을 실행해 어떤 지표가 먼저 움직이는지 기록
- 산출물: 재현 스크립트, 지표 기록, 진단 명령 모음

### 공식 출처

- [High JVM memory pressure](https://www.elastic.co/docs/troubleshoot/elasticsearch/high-jvm-memory-pressure)
- [Circuit breaker errors](https://www.elastic.co/docs/troubleshoot/elasticsearch/circuit-breaker-errors)
- [Rejected requests](https://www.elastic.co/docs/troubleshoot/elasticsearch/rejected-requests)
- [Important settings configuration](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/important-settings-configuration)
- [Important system configuration](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/important-system-configuration)
- [Capture diagnostics](https://www.elastic.co/docs/troubleshoot/elasticsearch/diagnostic)

### 확인할 사실

- [ ] circuit breaker 종류와 기본 한도(parent, request, fielddata, in-flight)
- [ ] heap 크기 권장(물리 메모리 대비, compressed oops 경계)과 자동 설정 동작
- [ ] 백신 예외에 대한 공식 문구의 정확한 범위(데이터 디렉터리 외 경로 언급 여부)
- [ ] THP, glibc arena 관련 공식 권고 유무. 없으면 "확인 필요"로만 언급하거나 다루지 않음
- [ ] OOM 시 heap dump 생성 기본 동작과 경로

### 작업 항목

- [ ] 재현 스크립트 작성과 실행
- [ ] 증상별 분기 흐름도 작성
- [ ] OS 설정 체크리스트를 공식 근거 유무로 나눠 작성
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 3-2. 노드 하나를 잃어도 데이터를 잃지 않으려면

상태: `미착수`
예정 파일: `operations/02-recoverability.md`, `labs/operations/recoverability/`

### 이 글이 답하는 질문

- 비용을 줄이려고 replica를 0으로 두면 무엇을 감수하는가
- 노드가 사라져 cluster가 RED가 됐다. 무엇부터 확인하나
- 마지막 snapshot 이후 들어온 데이터는 어떻게 되나
- rolling restart가 몇 시간씩 걸리는 이유는 무엇인가

### 독자와 전제

- 가용성과 비용 사이에서 결정해야 하는 운영자
- 기준: Elasticsearch 9.x, self-managed와 ECH

### 범위

다룸:

- replica, zone 배치, snapshot 주기로 정하는 복구 목표
- replica 0 운영의 비용 절감과 위험 비교
- RED 진단 순서: health report, allocation explain, 사본 유무 판단
- 사본이 없을 때의 선택지와 각각의 데이터 손실 범위(공식 문서 기준)
- rolling restart와 recovery 속도에 영향을 주는 요소

다루지 않음:

- 저수준 shard 복구 도구 사용법 (위험성만 언급)

### 목차 초안

1. 업무 문제: "노드 한 대가 죽었는데 데이터 일부가 사라졌다"
2. 복구 가능성을 정하는 세 가지: 사본, 위치, snapshot
3. 설계 결정: tier별 replica 정책, snapshot 주기
4. 구현: SLM 정책, 할당 설정 예시
5. 검증: labs에서 노드 제거와 복구 시나리오
6. 운영: RED 대응 순서, rolling restart 절차
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 환경: 3노드, SLM 정책
- 시나리오:
  - replica 0과 1인 index를 각각 두고 노드 하나를 강제 종료. health, allocation explain 결과 기록
  - snapshot 이후 추가 적재한 데이터가 복원 후 어떻게 되는지 확인
  - 공식 절차대로 rolling restart를 하며 shard 크기에 따른 소요 시간 비교
- 산출물: 시나리오 스크립트, 결과

### 공식 출처

- [Design for resilience](https://www.elastic.co/docs/deploy-manage/production-guidance/availability-and-resilience)
- [Red or yellow cluster health status](https://www.elastic.co/docs/troubleshoot/elasticsearch/red-yellow-cluster-status)
- [Diagnose unassigned shards](https://www.elastic.co/docs/troubleshoot/elasticsearch/diagnose-unassigned-shards)
- [Using the cluster allocation API for troubleshooting](https://www.elastic.co/docs/troubleshoot/elasticsearch/cluster-allocation-api-examples)
- [Snapshot and restore](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore)
- [Health report API](https://www.elastic.co/docs/api/elasticsearch/operation/operation-health-report)

### 확인할 사실

- [ ] 공식 문서의 최소 production 구성 권장(노드 수, zone 수, replica)
- [ ] 노드 이탈 시 replica 재할당 지연 설정과 기본값
- [ ] rolling restart 공식 절차(할당 설정 변경 여부 포함)
- [ ] 사본이 없을 때 공식 문서가 안내하는 선택지와 데이터 손실 범위
- [ ] ILM searchable snapshot 단계에서 임시 index의 replica 동작(공식 문서에 있는 경우만)

### 작업 항목

- [ ] 시나리오 스크립트 작성과 실행
- [ ] replica 정책 비교 표 작성
- [ ] RED 대응 순서를 흐름도로 작성
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 3-3. 비싼 query로부터 클러스터를 어떻게 보호하는가

상태: `미착수`
예정 파일: `operations/03-query-guardrails.md`, `labs/operations/query-guardrails/`

### 이 글이 답하는 질문

- 누군가 `*`처럼 넓은 대상을 검색해 클러스터 전체가 느려진다. 미리 막을 수 있나
- `search.allow_expensive_queries`, shard 수 제한은 무엇을 막고 무엇은 못 막나. ES|QL에도 적용되나
- 느린 query를 어떻게 찾아내나
- 애플리케이션 재시도가 장애를 키우는 패턴은 어떻게 막나

### 독자와 전제

- 여러 팀이 같은 클러스터를 쓰는 환경의 운영자
- 기준: Elasticsearch 9.x

### 범위

다룸:

- 보호 수단별 적용 범위 표: 설정, 대상 query 언어, 부작용
- query log와 slow log로 범인 찾기
- task 확인과 취소, search timeout
- index pattern과 tier 설계로 비용을 줄이는 방법(1-3과 연결)
- 애플리케이션 쪽 재시도와 timeout 설계

다루지 않음:

- 사용자별 리소스 격리의 내부 구현

### 목차 초안

1. 업무 문제: "한 사람의 query가 모두의 검색을 멈춘다"
2. 비싼 query의 유형
3. 보호 수단 비교 표
4. 구현: 설정 예시, 로그 설정, 취소 절차
5. 검증: labs에서 넓은 query와 좁은 query 비교, 설정별 차단 결과
6. 운영: 모니터링, 재시도 폭주 대응
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 데이터: 1-1, 1-3에서 만든 다수의 data stream
- 실험:
  - 넓은 index pattern과 좁은 pattern, tier 제외 조건을 각각 Query DSL과 ES|QL로 실행해 지연과 search thread pool 비교
  - 보호 설정을 하나씩 켜며 어떤 query가 거부되는지 기록
  - 동시 요청과 짧은 timeout + 즉시 재시도 클라이언트로 queue 증가 재현
- 산출물: query 세트, 설정, 결과

### 공식 출처

- [Query DSL (search.allow_expensive_queries)](https://www.elastic.co/docs/reference/query-languages/querydsl)
- [Search shard routing (action.search.shard_count.limit)](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-shard-routing)
- [Query logging](https://www.elastic.co/docs/deploy-manage/monitor/logging-configuration/query-logs)
- [Slow query and index logging](https://www.elastic.co/docs/deploy-manage/monitor/logging-configuration/slow-logs)
- [ES|QL limitations](https://www.elastic.co/docs/reference/query-languages/esql/limitations)
- [Rejected requests](https://www.elastic.co/docs/troubleshoot/elasticsearch/rejected-requests)

### 확인할 사실

- [ ] `search.allow_expensive_queries`가 영향을 주는 query 종류와 ES|QL 적용 여부
- [ ] `action.search.shard_count.limit`이 ES|QL에도 적용되는지
- [ ] query logging 기능의 버전별 상태와 지원 query 언어
- [ ] ES|QL의 결과 행 수, 메모리 관련 기본 한도
- [ ] task 취소가 즉시 자원을 돌려주는지에 대한 공식 설명

### 작업 항목

- [ ] query 세트와 실험 스크립트 작성, 실행
- [ ] 보호 수단 비교 표 작성
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 3-4. 진단 파일을 밖으로 낼 수 없을 때 어떻게 점검하는가

상태: `미착수`
예정 파일: `operations/04-airgapped-health-check.md`, `labs/operations/airgapped-health-check/`

### 이 글이 답하는 질문

- 보안 정책상 진단 파일을 외부로 보낼 수 없다. 내부에서 무엇을 점검하면 되나
- 어떤 API 결과를 어떤 기준으로 읽어야 하나
- 점검 결과를 텍스트로만 공유할 수 있을 때 어떻게 정리하나

### 독자와 전제

- 폐쇄망 환경의 운영자와 현장 파트너 엔지니어
- 기준: Elasticsearch 9.x self-managed

### 범위

다룸:

- 공식 진단 도구를 로컬에서 실행하는 방법
- health report API와 cat API 기반 점검 목록, 항목별 판단 기준
- 점검 결과를 텍스트(markdown)로 요약하는 방법
- 공개 저장소의 analyzer 도구 소개: [Munsik/airgapped-es-diag-analyzer](https://github.com/Munsik/airgapped-es-diag-analyzer)

다루지 않음:

- 사내 전용 분석 도구

### 목차 초안

1. 업무 문제: "파일을 못 내보내니 원인 분석이 몇 주씩 걸린다"
2. 점검 범위: 클러스터, 노드, 인덱스, shard, 설정
3. 점검 목록과 판단 기준 표 (공식 기준과 해석 구분)
4. 구현: 진단 도구 실행, analyzer 사용법
5. 검증: labs에서 일부러 문제를 만든 클러스터를 점검
6. 운영: 정기 점검 주기와 기록 방법
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 환경: 일부러 문제를 넣은 클러스터(unassigned shard, 높은 heap, 디스크 watermark 근접, 많은 shard)
- 공식 진단 도구로 수집하고 analyzer로 요약, 각 문제가 결과에 어떻게 나타나는지 확인
- 산출물: 문제 주입 스크립트, 점검 결과 예시

### 공식 출처

- [Capture diagnostics](https://www.elastic.co/docs/troubleshoot/elasticsearch/diagnostic)
- [Health report API](https://www.elastic.co/docs/api/elasticsearch/operation/operation-health-report)
- GitHub: [elastic/support-diagnostics](https://github.com/elastic/support-diagnostics)

### 확인할 사실

- [ ] 공식 진단 도구의 수집 항목과 민감 정보 처리 방식
- [ ] health report의 indicator 목록과 각 상태 의미
- [ ] 디스크 watermark 기본값
- [ ] analyzer의 판단 기준 중 공식 근거가 있는 항목과 해석인 항목 구분

### 작업 항목

- [ ] analyzer 저장소의 판단 기준을 공식 문서와 대조해 근거 표기
- [ ] 문제 주입 스크립트 작성과 점검 실행
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)
