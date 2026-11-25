# 2. 데이터를 어떻게 안정적으로 들여올 것인가

데이터가 제대로 들어오지 않으면 그 뒤의 모든 기능이 의미가 없습니다.
도입 초기에 가장 많이 막히는 단계를 다룹니다.

- 예정 폴더: `src/content/docs/ingest/`
- 예정 labs: `labs/ingest/`

---

## 2-1. 파싱은 어디서 할 것인가

상태: `미착수`
예정 파일: `ingest/01-where-to-parse.md`, `labs/ingest/where-to-parse/`

### 이 글이 답하는 질문

- Logstash가 꼭 필요한가. ingest pipeline만으로 충분한 경우는 언제인가
- integration이 제공하는 파싱이 우리 로그와 안 맞으면 어떻게 고치나. 업그레이드해도 수정이 남게 하려면
- 파싱이 실패한 문서는 어디로 가고, 어떻게 알아채나
- 날짜, 다중 행, 비정형 로그에서 자주 깨지는 지점은 어디인가

### 독자와 전제

- 수집 파이프라인을 설계하는 도입 담당자, 파싱 오류를 다루는 운영자
- 기준: Elastic Agent(Fleet 관리), Elasticsearch ingest pipeline, Logstash 9.x

### 범위

다룸:

- Agent integration, ingest pipeline, Logstash의 역할 구분과 선택 기준
- 같은 grok 패턴을 ingest pipeline과 Logstash에서 돌렸을 때의 처리량 비교(직접 측정)
- `@custom` pipeline으로 integration 파싱을 보완하는 방법
- `on_failure`, `ignore_missing`, failure store로 실패를 다루는 방법
- 날짜 형식, 연도 없는 syslog timestamp, 다중 행 처리의 함정

다루지 않음:

- Kafka 등 메시지 큐 운영 상세

### 목차 초안

1. 업무 문제: "로그는 들어오는데 필드가 비어 있다"
2. 세 가지 위치의 역할과 비용
3. 설계 결정: 어디서 무엇을 할지 나누는 기준
4. 구현: `@custom` pipeline 예시, 실패 처리 패턴
5. 검증: 처리량 실측, 실패 문서 추적 실습
6. 운영: integration 업그레이드 시 확인할 것, 파싱 실패 모니터링
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 데이터: 공개 형식의 synthetic 웹 서버 로그 100만~1,000만 줄
- 실험 A, 처리량:
  - 같은 grok 패턴, 같은 하드웨어. 입력 → 파싱 → 버림 구성으로 저장 비용을 제외
  - ingest pipeline: `_simulate`가 아니라 실제 bulk로 측정, ingest 노드 CPU 기록
  - Logstash: pipeline worker 수를 바꿔 가며 측정
  - grok 대신 dissect를 쓴 경우도 비교
- 실험 B, 실패 처리:
  - 일부러 잘못된 날짜와 누락 필드를 섞고, `on_failure` 유무와 failure store 사용 시 결과 비교
- 산출물: pipeline 정의, Logstash 설정, 측정 결과

### 공식 출처

- [Ingest pipelines](https://www.elastic.co/docs/manage-data/ingest/transform-enrich/ingest-pipelines)
- [Failure store](https://www.elastic.co/docs/manage-data/data-store/data-streams/failure-store)
- [Using Logstash with Elastic integrations](https://www.elastic.co/docs/reference/logstash/using-logstash-with-elastic-integrations)
- [Reference architecture: Logstash to Elasticsearch](https://www.elastic.co/docs/manage-data/ingest/ingest-reference-architectures/ls-for-input)
- [Enable logsdb for integrations](https://www.elastic.co/docs/manage-data/data-store/data-streams/logs-data-stream-integrations) (`@custom` component template 예시 참고)

### 확인할 사실

- [ ] failure store의 버전별 상태(GA 여부)와 기본 동작
- [ ] integration pipeline에서 `@custom` pipeline이 호출되는 위치와 이름 규칙
- [ ] Logstash에서 integration pipeline을 실행하는 기능(filter-elastic_integration)의 요구 조건
- [ ] ingest pipeline의 dissect, grok 처리 성능에 대한 공식 문서 언급이 있는지

### 작업 항목

- [ ] 실험 A, B 실행
- [ ] 선택 기준 표 작성
- [ ] 자주 깨지는 파싱 패턴 3~5개를 재현 예시와 함께 정리
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 2-2. 수백~수만 대 Agent를 어떻게 운영할 것인가

상태: `미착수`
예정 파일: `ingest/02-fleet-at-scale.md`, `labs/ingest/fleet-at-scale/`

### 이 글이 답하는 질문

- 정책을 바꿨더니 agent가 offline이 됐다. 변경을 어떻게 단계적으로 적용하나
- Fleet Server 인증서나 CA를 교체할 때 agent가 끊기지 않게 하려면
- OS, 역할, 네트워크 환경이 다른 호스트를 정책 하나로 묶어도 되나
- agent 업그레이드는 몇 대씩, 어떤 순서로 하나
- 네트워크가 끊긴 동안의 로그는 얼마나 보존되나

### 독자와 전제

- Fleet로 agent를 관리하는 운영자, 대규모 endpoint 배포를 앞둔 도입 담당자
- 기준: Fleet, Fleet Server, Elastic Agent 9.x. self-managed Fleet Server 위주

### 범위

다룸:

- 정책 설계: 이기종 호스트 분리 기준, 공통 설정과 개별 설정 나누기
- 변경 적용 순서: 테스트 정책 → 소수 canary → 단계적 확대
- 인증서와 CA 교체 절차와 공식 문서의 제약(재시작 필요 등)
- agent 업그레이드: 배치 단위, rollout 기간 설정, 실패 시 되돌리기
- Fleet Server 가용성 구성
- output queue와 offline 시 데이터 보존 범위

다루지 않음:

- 특정 버전의 known issue 상세(공식 known issues 페이지 링크만)

### 목차 초안

1. 업무 문제: "변경 한 번에 수천 대가 동시에 영향을 받는다"
2. Fleet 구조: 정책, revision, check-in
3. 설계 결정: 정책 분리 기준, 변경 단계
4. 구현: 인증서 교체 절차, 단계적 업그레이드 절차
5. 검증: labs에서 절차 재현
6. 운영: offline agent 진단 순서, known issues 확인 습관, 모니터링 지표
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 환경: Elasticsearch, Kibana, Fleet Server, agent 3~5대 docker compose
- 실험:
  - 공식 문서 절차대로 CA 교체를 수행하고, 절차를 빠뜨렸을 때 agent 상태 변화 기록
  - 업그레이드를 배치와 rollout 기간으로 나눠 수행
  - Elasticsearch 연결을 일정 시간 끊었다가 복구하고, 그동안 생성한 이벤트가 얼마나 도착하는지 확인
- 산출물: compose 파일, 절차 기록, 결과

### 공식 출처

- [Rotate SSL/TLS CA certificates](https://www.elastic.co/docs/reference/fleet/certificates-rotation)
- [Upgrade Elastic Agents](https://www.elastic.co/docs/reference/fleet/upgrade-elastic-agent)
- [Configure SSL/TLS for self-managed Fleet Servers](https://www.elastic.co/docs/reference/fleet/secure-connections)
- [Deploy on-premises and self-managed Fleet Server](https://www.elastic.co/docs/reference/fleet/add-fleet-server-on-prem)
- [Elasticsearch output](https://www.elastic.co/docs/reference/fleet/elasticsearch-output)
- [Fleet Server known issues](https://www.elastic.co/docs/release-notes/fleet-server/known-issues)

### 확인할 사실

- [ ] CA 교체 시 agent 재시작이 필요한 조건(공식 문서의 Limitations 절)
- [ ] 업그레이드 API의 rollout 기간, 배치 관련 옵션
- [ ] output queue(memory, disk) 설정 항목과 기본값, Fleet 정책에서 설정 가능한 범위
- [ ] Fleet Server 확장과 이중화에 대한 공식 권장
- [ ] agent 상태(healthy, unhealthy, offline) 판정 기준

### 작업 항목

- [ ] Fleet labs 환경 구성
- [ ] 세 가지 실험 실행과 기록
- [ ] 변경 적용 체크리스트 작성
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)
