# 2. 데이터를 어떻게 안정적으로 들여올 것인가

데이터가 제대로 들어오지 않으면 그 뒤의 모든 기능이 의미가 없습니다.
도입 프로젝트마다 빠지지 않는 질문은 세 가지입니다. 무엇으로 받을지, 수집기가 멈춰도 끊기지 않게 하려면 어떻게 할지, 원본을 빠짐없이 받았다는 것을 어떻게 증명할지입니다.
이 컬렉션은 수집기 선택에서 시작해 무중단 구성, UDP syslog, 건수 정합성, 흐름 대시보드, 하드웨어 산정, 대규모 Fleet 운영까지 실무 순서대로 다룹니다.

- 폴더: `src/content/docs/ingest/`
- labs: `labs/ingest/`
- 공통 기준: Elastic Agent(Fleet 관리와 standalone), Logstash, Elasticsearch, Kibana 9.x. self-managed와 Elastic Cloud Hosted 기준. Serverless와 다른 점은 글마다 따로 적는다
- 공통 데이터: 순번(`seq`)과 송신 시각을 넣은 synthetic 로그. 송신 측에서 보낸 건수를 정확히 알 수 있어야 유실과 중복을 셀 수 있다. `labs/_datagen/loggen.py`를 확장하거나 `labs/ingest/_sender/`에 송신기를 둔다

## 진행 메모 (2026-11-26)

- 8편 모두 `draft: true`로 작성. 근거는 공식 문서, elastic/integrations와 Kibana 소스, rsyslog, nginx 공식 문서. 사내 KB, Slack, Drive는 방향 확인에만 쓰고 본문에 인용하지 않음
- 처리량 실측은 하지 않기로 결정. 환경과 데이터마다 결과가 달라 공개 수치로서 의미가 약함. 02의 실험 A와 07의 Logstash 처리량 실험은 "직접 재는 절차"로 대체
- 장애 주입(03, 04) 실측 수치도 넣지 않음. 송신기와 대조 쿼리를 labs에 두고 직접 재는 절차를 적음
- Kibana 화면 캡처는 별도 작업자가 진행: `planning/captures/ingest.md`(C-01에서 C-07). 본문에는 `<!-- CAPTURE: 파일명 | ID -->` 자리표시
- 공개 전 남은 일: 캡처 반영, `labs/ingest/` 쿼리와 설정의 lab 실행 확인, 본문의 "확인 필요" 해소, draft 제거와 index FAQ 점검

## 글 목록과 순서

| 순서 | 파일 | 제목(가제) | 한 줄 요지 |
| --- | --- | --- | --- |
| 01 | `ingest/01-choose-collector.md` | 수집기는 무엇으로 고를 것인가 | Agent, Logstash, EDOT Collector, Beats, Kafka, syslog relay의 역할과 decision tree |
| 02 | `ingest/02-where-to-parse.md` | 파싱은 어디서 할 것인가 | ingest pipeline, Logstash, integration `@custom` pipeline, failure store |
| 03 | `ingest/03-no-gap-ingest.md` | 수집기가 멈춰도 로그가 끊기지 않게 하려면 | Logstash와 Agent는 clustering이 없다는 전제에서 무중단 구성 패턴과 실측 |
| 04 | `ingest/04-syslog-udp.md` | UDP syslog를 유실 없이 받으려면 | UDP의 한계, 버퍼, relay, 부하 분산, drop 계측 |
| 05 | `ingest/05-count-reconciliation.md` | 원본을 빠짐없이 받았다는 것을 어떻게 증명하는가 | 송신 건수와 저장 건수 대조, 중복 제거, 실패 문서 추적 |
| 06 | `ingest/06-flow-dashboard.md` | 수집 흐름을 대시보드로 어떻게 보는가 | Agent, Logstash, Elasticsearch 지표로 만드는 흐름 대시보드와 Streams |
| 07 | `ingest/07-collector-sizing.md` | 수집 계층에 자원은 얼마나 필요한가 | Agent, Logstash, Fleet Server의 CPU, 메모리, 디스크 산정 |
| 08 | `ingest/08-fleet-at-scale.md` | 수백에서 수만 대 Agent를 어떻게 운영할 것인가 | 정책 설계, 단계적 변경과 업그레이드, 인증서 교체 |

01은 나머지 글의 지도 역할을 한다. 03, 04, 05는 같은 송신기와 같은 측정 방법(순번 기반 유실, 중복 계산)을 공유하므로 이어서 쓴다.
기존 계획의 2-1은 02로, 2-2는 08로 옮겼다.

## 공통 labs 환경

- `labs/ingest/compose/`: Elasticsearch 1노드, Kibana, Fleet Server, Logstash 2대, Elastic Agent 2대, HAProxy(TCP, UDP), rsyslog relay. 필요한 글에서만 일부를 켠다
- `labs/ingest/_sender/`: TCP, UDP, HTTP, 파일 쓰기로 순번 붙은 로그를 정해진 속도로 보내는 송신기. 보낸 건수와 순번 범위를 결과 파일로 남긴다
- `labs/ingest/_verify/`: Elasticsearch에서 순번을 집계해 유실 구간, 중복 건수를 계산하는 스크립트와 ES|QL
- 측정 원칙: 같은 하드웨어, 같은 송신 속도로 패턴만 바꾼다. 실측 환경의 vCPU, 메모리를 글마다 밝힌다
- 제약: 이 저장소의 지난 실측은 vCPU 1개 컨테이너에서 했다. 03, 04의 장애 주입은 이 규모로도 의미가 있지만, 07의 처리량 수치는 더 큰 환경에서 다시 재야 한다(확인 필요)

---

## 2-1. 수집기는 무엇으로 고를 것인가

상태: `초안` (draft, 2026-11-26)
예정 파일: `ingest/01-choose-collector.md`

### 이 글이 답하는 질문

- Elastic Agent만으로 충분한 경우와 Logstash를 꼭 넣어야 하는 경우는 언제인가
- Fleet 관리 Agent와 standalone Agent, Beats는 어떻게 다른가
- Kafka 같은 message queue는 언제 넣는가
- 네트워크 장비 syslog, 클라우드 로그, API 수집, OpenTelemetry 데이터는 각각 무엇으로 받는가
- EDOT(Elastic Distribution of OpenTelemetry) Collector는 어디에 들어가는가

### 범위

다룸:

- 수집 구성 요소별 역할: Agent(integration), Logstash(변환, 다중 출력, persistent queue), Kafka(분리와 재처리), syslog relay(rsyslog, syslog-ng), EDOT Collector
- 공식 reference architecture 표(Agent to ES, Agent to Logstash, Agent to Kafka, Logstash for input, air-gapped)와 각각을 고르는 조건
- 데이터 원천별(서버 파일 로그, Windows 이벤트, 네트워크 장비 syslog, 클라우드 서비스, API, 애플리케이션 trace) 권장 경로 표
- decision tree(mermaid): 원천 → 변환 필요성 → 버퍼링, 재처리 필요성 → 출력 수 → 관리 방식
- Agent의 제약: 사용자가 disk queue를 설정할 수 없음(memory queue만), clustering 없음. Logstash의 제약: clustering 없음, persistent queue는 노드 로컬

다루지 않음:

- Kafka, rsyslog 자체의 운영 상세

### 목차 초안

1. 업무 문제: "Logstash를 꼭 써야 하나요"라는 질문이 매 프로젝트 나온다
2. 구성 요소별 역할과 할 수 없는 것
3. 데이터 원천별 권장 경로
4. decision tree
5. 자주 보는 잘못된 조합(예: 변환이 없는데 Logstash를 단일 노드로 끼워 넣어 단일 장애점을 만든 구성)
6. 판단 기준 요약 (해석)

### 그림

- mermaid: decision tree, 원천별 경로 개념도
- 실측 없음. 03에서 07까지의 실측 결과를 링크로 연결

### 공식 출처

- [Ingest reference architectures](https://www.elastic.co/docs/manage-data/ingest/ingest-reference-architectures)
- [Beats and Elastic Agent capabilities](https://www.elastic.co/docs/reference/fleet/beats-agent-comparison)
- [Deploying and scaling Logstash](https://www.elastic.co/docs/reference/logstash/deploying-scaling-logstash)
- [Elastic Agent Logstash output](https://www.elastic.co/docs/reference/fleet/logstash-output)

### 확인할 사실

- [x] Agent는 memory queue만 사용자가 설정 가능, disk queue는 불가(Beats and Elastic Agent capabilities 표)
- [ ] EDOT Collector의 Stack 9.x GA 상태와 log 수집 범위, Fleet 관리 여부
- [ ] Elastic Agent의 OpenTelemetry 기반 실행 모드(hybrid, otel mode) 상태
- [ ] Logstash의 Fleet 중앙 관리(Logstash central pipeline management) 라이선스 조건
- [ ] Agent integration이 없는 원천에서 쓸 수 있는 범용 input(custom logs, HTTP endpoint, CEL) 목록

---

## 2-2. 파싱은 어디서 할 것인가

상태: `초안` (draft, 2026-11-26) (기존 2-1 계획을 옮김)
예정 파일: `ingest/02-where-to-parse.md`, `labs/ingest/where-to-parse/`

### 이 글이 답하는 질문

- Logstash가 꼭 필요한가. ingest pipeline만으로 충분한 경우는 언제인가
- integration이 제공하는 파싱이 우리 로그와 안 맞으면 어떻게 고치나. 업그레이드해도 수정이 남게 하려면
- 파싱이 실패한 문서는 어디로 가고, 어떻게 알아채나
- 날짜, 다중 행, 비정형 로그에서 자주 깨지는 지점은 어디인가

### 범위

다룸:

- Agent integration, ingest pipeline, Logstash의 역할 구분과 선택 기준
- 같은 grok 패턴을 ingest pipeline과 Logstash에서 돌렸을 때의 처리량 비교(직접 측정). grok 대신 dissect도 비교
- `@custom` pipeline으로 integration 파싱을 보완하는 방법
- `on_failure`, `ignore_missing`, failure store로 실패를 다루는 방법. Streams(9.2 GA)의 Processing, Data quality 탭
- 날짜 형식, 연도 없는 syslog timestamp, 다중 행 처리의 함정

다루지 않음:

- Kafka 등 메시지 큐 운영 상세

### labs 실험 설계

- 실험 A, 처리량: 같은 grok 패턴, 같은 하드웨어. 입력 → 파싱 → 버림 구성으로 저장 비용 제외. ingest pipeline은 실제 bulk로, Logstash는 `pipeline.workers`를 바꿔 가며
- 실험 B, 실패 처리: 잘못된 날짜와 누락 필드를 섞고 `on_failure` 유무, failure store 사용 시 결과 비교

### 공식 출처

- [Ingest pipelines](https://www.elastic.co/docs/manage-data/ingest/transform-enrich/ingest-pipelines)
- [Failure store](https://www.elastic.co/docs/manage-data/data-store/data-streams/failure-store)
- [Using Logstash with Elastic integrations](https://www.elastic.co/docs/reference/logstash/using-logstash-with-elastic-integrations)
- [Streams: Manage data quality](https://www.elastic.co/docs/solutions/observability/streams/manage-data-quality)

### 확인할 사실

- [ ] failure store의 버전별 상태(GA 여부)와 기본 동작
- [ ] integration pipeline에서 `@custom` pipeline이 호출되는 위치와 이름 규칙
- [ ] Logstash `filter-elastic_integration`의 요구 조건
- [ ] Streams의 Stack GA 범위(classic stream, wired stream)

---

## 2-3. 수집기가 멈춰도 로그가 끊기지 않게 하려면

상태: `초안` (draft, 2026-11-26) (신규)
예정 파일: `ingest/03-no-gap-ingest.md`, `labs/ingest/no-gap/`

### 이 글이 답하는 질문

- Logstash와 Elastic Agent는 clustering이 없다. 업그레이드나 장애로 한 대가 멈추는 동안 로그를 어떻게 계속 받나
- 송신 측(Agent, Beats)이 Logstash 여러 대로 나눠 보내면 한 대가 죽었을 때 무슨 일이 생기나. 유실인가, 중복인가
- TCP, HTTP로 밀어 넣는 원천(네트워크 장비, 애플리케이션)은 어떻게 이중화하나
- 수집기를 무중단으로 순차 업그레이드하는 절차는
- persistent queue만 켜면 되나. 디스크가 죽으면

### 해결하려는 업무 문제

- 수집기 업그레이드, 설정 반영, 재시작 때마다 몇 분씩 로그가 비는데 감사, 보안 관제 요구사항은 "무중단"이다
- "Logstash를 cluster로 묶어 달라"는 요구를 받지만 그런 기능은 없다. 구성으로 풀어야 한다

### 범위

다룸:

- 끊김의 세 가지 종류: 송신 측이 재전송할 수 있는 경우(Agent, Beats의 ack 기반 프로토콜, 파일 수집의 registry), 재전송할 수 없는 경우(TCP, UDP, HTTP push), 수집기 안에 쌓여 있던 이벤트를 잃는 경우(memory queue)
- 패턴 1, 송신 측 부하 분산: Agent Logstash output의 `hosts` 여러 개와 `loadbalance`. 한 대가 죽을 때의 재연결, 재전송, 중복
- 패턴 2, L4 부하 분산: TCP, HTTP 원천 앞의 HAProxy, keepalived. health check와 연결 drain
- 패턴 3, Kafka 분리: 수신 계층과 처리 계층을 나눠 처리 계층을 자유롭게 재시작
- 패턴 4, 파일 기반 원천: 수집기를 재시작해도 registry 위치부터 다시 읽음. 대신 로그 회전(rotation)과 보존 기간이 버퍼 역할
- Logstash persistent queue: 기본값(`queue.type: memory`, `queue.max_bytes` 1024mb, `queue.checkpoint.writes` 1024), at-least-once를 위한 `queue.checkpoint.writes: 1`의 비용, `queue.drain`, 디스크 이중화(RAID) 권고
- 순차 업그레이드 절차: Logstash N대, Agent(Fleet 업그레이드 시 재시작 구간), Fleet Server
- 중복을 받아들이고 제거하는 방법: fingerprint 기반 `_id`(05와 연결)

다루지 않음:

- Kafka cluster 자체의 이중화 상세

### 목차 초안

1. 업무 문제: "업그레이드할 때마다 3분씩 비어요"
2. 끊김은 어디서 생기나: 재전송 가능 원천, 불가 원천, 수집기 내부 queue
3. 패턴별 구성과 trade-off(표)
4. 구현: Agent output 설정, HAProxy 설정, Logstash PQ 설정, 순차 업그레이드 절차
5. 검증: 장애 주입 실측
6. 운영: 지표로 끊김 알아채기(06과 연결), 디스크 용량 산정(07과 연결)
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 환경: Logstash 2대(PQ 켬, 끔), Agent 1대(Logstash output, `loadbalance` 켬, 끔), HAProxy, Elasticsearch
- 송신: 순번 붙은 로그를 초당 1,000에서 5,000건(환경에 맞춰 조정)으로 10분간
- 장애 주입: 송신 중 Logstash 1대를 `SIGTERM`, `SIGKILL`, 네트워크 차단(iptables), 순차 업그레이드
- 측정: 송신 건수, 저장 건수, 유실 순번 구간, 중복 건수, 복구 시간, Agent와 Logstash의 events in, out
- 비교 조합:

| 조합 | 원천 | 수집기 |
| --- | --- | --- |
| A | 파일 → Agent | Logstash 1대, memory queue |
| B | 파일 → Agent | Logstash 2대, `loadbalance`, memory queue |
| C | 파일 → Agent | Logstash 2대, `loadbalance`, PQ |
| D | TCP push | Logstash 1대 |
| E | TCP push | HAProxy + Logstash 2대 |
| F | TCP push | Logstash 2대(수신) → Kafka → Logstash(처리) |

- 산출물: compose 파일, Logstash, HAProxy, Agent 설정, 장애 주입 스크립트, 결과 CSV

### 공식 출처

- [Deploying and scaling Logstash](https://www.elastic.co/docs/reference/logstash/deploying-scaling-logstash): 최소 2노드 권장, Beats load balance, TCP와 UDP는 application-level ack 없음, HAProxy 권장, Kafka 패턴
- [Persistent queues](https://www.elastic.co/docs/reference/logstash/persistent-queues)
- [Elastic Agent Logstash output](https://www.elastic.co/docs/reference/fleet/logstash-output), [Logstash output settings](https://www.elastic.co/docs/reference/fleet/ls-output-settings)
- [Reference architecture: Agent to Logstash PQ](https://www.elastic.co/docs/manage-data/ingest/ingest-reference-architectures/lspq), [Agent to Kafka](https://www.elastic.co/docs/manage-data/ingest/ingest-reference-architectures/agent-kafka-es)
- [Upgrade Elastic Agents](https://www.elastic.co/docs/reference/fleet/upgrade-elastic-agent)

### 확인할 사실

- [x] Logstash PQ 기본값과 `queue.checkpoint.writes: 1` 권고(Persistent queues, Deploying and scaling)
- [x] TCP, UDP input은 application-level ack가 없음(Deploying and scaling)
- [x] Agent Logstash output: `loadbalance`를 끄면 여러 host 중 하나를 무작위로 고르고, 끊기면 다른 host를 고름
- [ ] Agent가 Logstash 연결이 끊긴 동안 memory queue가 차면 입력별로 무엇이 멈추는가(파일은 읽기를 멈춤, 네트워크 input은 drop인가)
- [ ] Agent 업그레이드 중 재시작 구간의 길이와 그동안 네트워크 input 상태
- [ ] Logstash `queue.drain`과 정상 종료 순서, PQ 페이지 손상 시 동작
- [ ] Logstash 9.x에서 Agent의 lumberjack(Beats) 프로토콜 ack 시점(PQ에 쓴 뒤인가, 출력 뒤인가)

---

## 2-4. UDP syslog를 유실 없이 받으려면

상태: `초안` (draft, 2026-11-26) (신규)
예정 파일: `ingest/04-syslog-udp.md`, `labs/ingest/syslog-udp/`

### 이 글이 답하는 질문

- UDP syslog는 왜 유실이 생기고, 어디서 버려지나(송신 장비, 네트워크, 수신 OS 버퍼, 수집기)
- 유실이 생겼는지 어떻게 아나
- 수신 서버를 재시작하는 동안의 로그는 어떻게 하나
- UDP를 TCP나 RELP로 바꿀 수 없는 장비는 어떻게 하나

### 해결하려는 업무 문제

- 방화벽, 스위치, 보안 장비가 UDP 514로만 보내는데, 감사 요구는 "유실 없음"이다
- 피크 시간에만 건수가 줄어드는데 원인을 모른다

### 범위

다룸:

- UDP에서 유실이 생기는 지점과 각각의 계측 방법: `netstat -su`, `/proc/net/snmp`의 `RcvbufErrors`, `InErrors`, Agent UDP input 지표(`system_packet_drops`, `receive_queue_length`, `udp_read_buffer_length_gauge`)
- 수신 버퍼 조정: Agent UDP input `read_buffer`, `max_message_size`, OS `net.core.rmem_max`, `net.core.rmem_default`
- 수신 구조 패턴:
  - 장비에서 가까운 rsyslog, syslog-ng relay가 받아 disk-assisted queue에 두고 TCP, RELP로 전달
  - UDP 부하 분산(keepalived, LVS, HAProxy UDP 또는 네트워크 장비)과 VIP 전환
  - 장비가 두 곳으로 동시에 보내고 저장 단계에서 중복 제거
- 수신기 재시작 구간을 줄이는 방법: relay는 단순하게 두고 자주 바꾸지 않음, 변환은 뒤 계층에서
- syslog 형식: RFC 3164와 5424, 연도 없는 timestamp, timezone(02와 연결). Filebeat syslog input은 8.14부터 deprecated, syslog processor 사용

다루지 않음:

- 장비별 syslog 설정 방법

### 목차 초안

1. 업무 문제: "피크 때만 로그가 빈다"
2. UDP 유실이 생기는 네 지점과 계측
3. 버퍼 조정의 효과와 한계
4. 구조 패턴: relay, 부하 분산, 이중 송신(표와 mermaid)
5. 구현: rsyslog relay 설정, Agent UDP input 설정, sysctl
6. 검증: 송신 속도별 drop 실측
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 송신: 순번 붙은 syslog를 UDP로 초당 1만에서 10만 건(환경 한도까지 단계적으로)
- 실험 A, 버퍼: `read_buffer` 기본, 크게, OS `rmem_max` 조정 전후의 drop 비율과 커널 카운터
- 실험 B, 재시작: 수신 Agent를 재시작하는 동안 직접 수신과 rsyslog relay(disk-assisted queue, TCP 전달) 경유의 유실 비교
- 실험 C, 부하 분산: keepalived VIP 전환이나 HAProxy UDP 뒤 수신기 2대에서 한 대 중단 시 유실
- 측정: 송신 건수, 저장 건수, 유실 순번 구간, 커널 카운터, Agent 지표

### 공식 출처

- [Filebeat UDP input](https://www.elastic.co/docs/reference/beats/filebeat/filebeat-input-udp): `read_buffer`, `max_message_size`, 지표 목록
- [Filebeat syslog input](https://www.elastic.co/docs/reference/beats/filebeat/filebeat-input-syslog)(8.14 deprecated), [syslog processor](https://www.elastic.co/docs/reference/beats/filebeat/syslog)
- [Deploying and scaling Logstash: Centralized syslog servers](https://www.elastic.co/docs/reference/logstash/deploying-scaling-logstash)
- rsyslog 공식 문서(queue, omrelp, omfwd), Linux kernel 네트워크 sysctl 문서

### 확인할 사실

- [x] UDP input 지표 `system_packet_drops`, `receive_queue_length`는 Linux 전용
- [x] Filebeat syslog input deprecated 8.14.0
- [ ] Agent Custom UDP logs, System/syslog integration에서 `read_buffer`를 설정할 수 있는 위치
- [ ] Agent UDP input 지표가 Fleet 모니터링 데이터(`metrics-elastic_agent.*`)에 들어가는지
- [ ] HAProxy의 UDP 지원 범위(버전, 에디션). 대안으로 nginx stream, LVS
- [ ] rsyslog disk-assisted queue 설정 항목과 재시작 시 보존 동작

---

## 2-5. 원본을 빠짐없이 받았다는 것을 어떻게 증명하는가

상태: `초안` (draft, 2026-11-26) (신규)
예정 파일: `ingest/05-count-reconciliation.md`, `labs/ingest/reconciliation/`

### 이 글이 답하는 질문

- 원천에서 보낸 건수와 Elasticsearch에 저장된 건수를 어떻게 맞춰 보나
- 시간대를 어떻게 잘라 비교해야 늦게 도착한 데이터 때문에 틀리지 않나
- 중복은 어떻게 세고 막나
- 파싱 실패, mapping 충돌로 저장되지 않은 문서는 어디서 세나
- 이 대조를 매일 자동으로 돌리고 어긋나면 알리려면

### 해결하려는 업무 문제

- 감사, 보안 관제 계약에 "수집률 99.9% 이상"이 들어가는데 근거를 낼 방법이 없다
- 원천 시스템 담당자가 "보냈다"고 하고, 수집 담당자는 "안 왔다"고 할 때 어느 구간에서 사라졌는지 가릴 방법이 없다

### 범위

다룸:

- 대조의 기준점 세 가지: 원천 자체 카운터(장비 통계, 파일 줄 수, 애플리케이션 순번), 수집기 카운터(Agent, Logstash events in, out, dropped, filtered), Elasticsearch 저장 건수
- 구간별 대조표: 원천 → 수집기 입력 → 수집기 출력 → Elasticsearch 수신(성공, 실패) → 저장. 어긋난 구간이 원인 위치
- 시간 기준: `@timestamp`(이벤트 시각)와 `event.ingested`(수신 시각). 늦게 도착하는 데이터를 감안한 대조 창
- 순번이나 원천 ID가 있을 때: ES|QL로 유실 구간 찾기
- 순번이 없을 때: 원천별, 호스트별, 시간대별 건수 비교와 허용 오차
- 중복: at-least-once 구성에서 생기는 중복, fingerprint로 `_id` 고정(Logstash fingerprint filter, ingest pipeline fingerprint processor)과 그 비용
- 저장되지 않은 문서: Logstash DLQ, failure store, `_ignored`로 표시된 degraded document, Data Set Quality 페이지(beta), Streams Data quality 탭
- 자동화: ES|QL 기반 alert rule이나 Workflows로 매일 대조, 결과를 별도 index에 기록

### 목차 초안

1. 업무 문제: "보냈다"와 "안 왔다"
2. 대조 구간과 각 구간의 카운터
3. 시간 기준과 대조 창
4. 유실 찾기: 순번 기반, 건수 기반
5. 중복 찾기와 막기
6. 저장되지 않은 문서 세기
7. 자동 대조와 알림
8. 검증: 03, 04 실험 결과를 이 방법으로 다시 계산
9. 판단 기준 요약 (해석)

### labs 실험 설계

- 03, 04의 장애 주입 결과를 입력으로 써서, 이 글의 ES|QL과 대조 스크립트가 유실 구간과 중복 건수를 정확히 찾는지 확인
- fingerprint `_id` 적용 전후로 같은 장애를 주입해 중복 건수와 적재 비용 비교
- 잘못된 날짜, mapping 충돌 문서를 섞어 failure store, `_ignored` 집계가 맞는지 확인

### 공식 출처

- [Failure store](https://www.elastic.co/docs/manage-data/data-store/data-streams/failure-store)
- [Logstash dead letter queues](https://www.elastic.co/docs/reference/logstash/dead-letter-queues)
- [Data set quality](https://www.elastic.co/docs/solutions/observability/data-set-quality-monitoring) (Stack, Serverless 모두 beta)
- [`_ignored` field](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/mapping-ignored-field)
- [Monitor Elastic Agents](https://www.elastic.co/docs/reference/fleet/monitor-elastic-agent), [Logstash node stats API](https://www.elastic.co/docs/api/doc/logstash/operation/operation-nodestats)
- ES|QL, Kibana alerting rule 문서

### 확인할 사실

- [x] Data Set Quality는 Stack, Serverless 모두 beta. degraded document는 `_ignored`가 있는 문서
- [ ] `event.ingested`가 integration pipeline에서 기본으로 채워지는지, 직접 넣어야 하는 경우
- [ ] Agent 모니터링 지표 중 출력 성공, 실패, drop을 나타내는 필드 이름(`metrics-elastic_agent.*`)
- [ ] Logstash 9.x DLQ가 Elasticsearch output에서 받는 오류 종류(400, 404 등)
- [ ] failure store에 들어가는 오류 범위(ingest pipeline 오류, mapping 오류)와 Stack GA 버전
- [ ] fingerprint `_id`를 data stream에서 쓸 때 제약(create만 허용, 중복 시 409 처리)

---

## 2-6. 수집 흐름을 대시보드로 어떻게 보는가

상태: `초안` (draft, 2026-11-26) (신규)
예정 파일: `ingest/06-flow-dashboard.md`, `labs/ingest/flow-dashboard/`

### 이 글이 답하는 질문

- 원천에서 Agent, Logstash, Elasticsearch까지 각 단계의 처리량과 지연, 적체를 한 화면에서 볼 수 있나
- Kibana 기본 제공 화면(Fleet, Stack Monitoring, Logstash pipeline viewer, Streams)으로 어디까지 되나
- 최신 dashboard 기능(ES|QL 차트, ES|QL control, Lens)으로 흐름 대시보드를 직접 만들려면
- 흐름이 멈추거나 줄었을 때 바로 알려면

### 범위

다룸:

- 기본 제공 화면과 상태: Fleet Agent 모니터링 대시보드, Logstash integration 대시보드와 pipeline viewer, Streams(Stack 9.2 GA)의 Data quality 탭
- Streams Map(데이터 흐름 지도)은 Serverless private preview, Stack unavailable이라는 점을 밝힘
- 흐름 지표 원천: Agent self-monitoring, Logstash flow metrics(`input_throughput`, `worker_utilization`, `queue_backpressure`, `worker_concurrency`), Elasticsearch indexing 통계, data stream별 건수
- 직접 만드는 흐름 대시보드: 단계별 처리량 비교 차트, 단계 사이 차이(유실, 적체) 지표, 원천별 마지막 수신 시각 표, 지연(`event.ingested` - `@timestamp`) 분포
- Lens에 흐름(sankey) 차트가 없어서 단계 비교를 막대와 표로 구성. 꼭 흐름 그림이 필요하면 Vega(유지 비용을 함께 설명)
- "로그가 끊겼다" 알림: 원천별 무수신 감지(ES|QL rule), 흐름 지표 급감

다루지 않음:

- 대시보드 디자인 일반론

### 목차 초안

1. 업무 문제: "어디서 막혔는지 모르겠다"
2. 단계별로 무엇을 재는가
3. 기본 제공 화면으로 되는 것과 안 되는 것
4. 직접 만드는 흐름 대시보드(실제 화면 캡처)
5. 알림 연결
6. 판단 기준 요약 (해석)

### 그림과 산출물

- Kibana 실제 화면 캡처: Fleet Agent 모니터링, Logstash pipeline viewer, Streams Data quality 탭, 직접 만든 흐름 대시보드
- `labs/ingest/flow-dashboard/`: 대시보드 saved object(ndjson), ES|QL query 모음, alert rule 정의

### 공식 출처

- [Monitor Elastic Agents](https://www.elastic.co/docs/reference/fleet/monitor-elastic-agent)
- [Monitoring Logstash](https://www.elastic.co/docs/reference/logstash/monitoring-logstash), Logstash node stats API의 flow metrics
- [Streams](https://www.elastic.co/docs/solutions/observability/streams/streams) (Stack 9.1 preview, 9.2 GA)
- [Streams Map](https://www.elastic.co/docs/manage-data/ingest/streams/streams-map) (Serverless preview, Stack unavailable)
- Kibana dashboards, ES|QL visualization 문서

### 확인할 사실

- [x] Streams는 Stack 9.1 preview, 9.2부터 GA
- [x] Streams Map, Streams sources, destinations는 Serverless preview, Stack unavailable. 수집 전 처리와 라우팅은 private preview
- [x] Lens 차트 종류에 sankey 없음(Kibana 문서의 chart 목록 기준)
- [ ] Logstash Stack Monitoring pipeline viewer의 9.x 상태와 Agent 기반 모니터링에서 쓸 수 있는지
- [ ] ES|QL control과 ES|QL 차트의 dashboard GA 버전
- [ ] Logstash integration이 flow metrics를 수집하는지와 필드 이름

---

## 2-7. 수집 계층에 자원은 얼마나 필요한가

상태: `초안` (draft, 2026-11-26) (신규)
예정 파일: `ingest/07-collector-sizing.md`, `labs/ingest/collector-sizing/`

### 이 글이 답하는 질문

- 호스트마다 설치하는 Agent는 CPU, 메모리를 얼마나 쓰나
- Logstash는 초당 몇 건에 몇 core, heap 몇 GB가 필요하나
- persistent queue 디스크는 얼마나 잡나
- Fleet Server는 Agent 수에 따라 얼마나 필요한가
- syslog relay, Kafka를 넣으면 무엇을 더 잡아야 하나

### 범위

다룸:

- Agent: 공식 문서의 측정값(m7i.large, throughput preset에서 CPU 약 67%, RSS 약 280MB, scale preset에서 CPU 약 20%, RSS 약 220MB), 디스크(Linux 9.0 기준 1.5GB, 업그레이드 중 두 배). integration 수에 따른 증가
- Agent output performance preset(`balanced` 기본, `throughput`, `scale`, `latency`)의 의미와 고르는 기준
- Logstash: heap 4GB에서 8GB 권장, Xms와 Xmx 동일, 물리 메모리의 50%에서 75% 이내, `pipeline.workers` 기본(core 수), `pipeline.batch.size`, inflight count, `worker_utilization` 기반 조정
- Logstash PQ 디스크: 버틸 장애 시간 x 초당 수신량 x 이벤트 크기에 여유를 더하는 계산(공식 문서 예시: 1,000 EPS, 1KB, 12시간)
- Fleet Server: 공식 scalability 표(2,000대 2GB에서 100,000대 16GB, 16 vCPU)와 Elasticsearch hot tier 권장
- 실측: 같은 파싱 파이프라인에서 core당 처리량, worker 수와 batch 크기에 따른 변화, PQ 켬과 끔의 처리량 차이, `queue.checkpoint.writes: 1`의 비용
- 산정 표와 예시: 하루 1TB, 5TB 로그에서 Logstash 대수(N+1 포함)

다루지 않음:

- Elasticsearch 클러스터 sizing(설계 컬렉션과 별도 sizing 자료로 연결)

### labs 실험 설계

- Logstash 1대, 고정 파이프라인(dissect, date, mutate), 입력은 generator나 송신기, 출력은 Elasticsearch와 null 두 가지
- 변수: `pipeline.workers`(1, 2, 4, core 수), `pipeline.batch.size`(125, 500, 1,000), queue(memory, PQ, PQ + `checkpoint.writes: 1`)
- 측정: 초당 이벤트, CPU 사용률, heap 사용량, PQ 디스크 쓰기량
- 환경 제약: core당 수치를 얻으려면 최소 4 vCPU 환경이 필요. 이 저장소의 1 vCPU 환경에서는 상대 비교만(확인 필요)

### 공식 출처

- [Elastic Agent resource requirements](https://www.elastic.co/docs/reference/fleet/install-elastic-agents#elastic-agent-installation-resource-requirements)
- [Elasticsearch output performance tuning](https://www.elastic.co/docs/reference/fleet/elasticsearch-output#output-elasticsearch-performance-tuning-settings)
- [Logstash JVM settings](https://www.elastic.co/docs/reference/logstash/jvm-settings), [Tuning and profiling Logstash performance](https://www.elastic.co/docs/reference/logstash/tuning-logstash)
- [Persistent queues: sizing](https://www.elastic.co/docs/reference/logstash/persistent-queues)
- [Fleet Server scalability](https://www.elastic.co/docs/reference/fleet/fleet-server-scalability)

### 확인할 사실

- [x] Agent 리소스 측정값과 디스크 표(install-elastic-agents의 Resource requirements)
- [x] Logstash heap 4GB에서 8GB, 50%에서 75% 이내 권장
- [x] Fleet Server scalability 표의 값. 내부 sizing 기준(2,000대 4GB, 4 vCPU 등)과 다르므로 공식 표를 기준으로 쓰고 차이를 설명
- [ ] performance preset별 실제 설정값 표(`bulk_max_size`, `worker`, `queue.mem.events` 등)
- [ ] Logstash `pipeline.batch.metrics.sampling_mode`(9.2 preview)를 실측에 쓸 수 있는지

---

## 2-8. 수백에서 수만 대 Agent를 어떻게 운영할 것인가

상태: `초안` (draft, 2026-11-26) (기존 2-2 계획을 옮김)
예정 파일: `ingest/08-fleet-at-scale.md`, `labs/ingest/fleet-at-scale/`

### 이 글이 답하는 질문

- 정책을 바꿨더니 agent가 offline이 됐다. 변경을 어떻게 단계적으로 적용하나
- Fleet Server 인증서나 CA를 교체할 때 agent가 끊기지 않게 하려면
- OS, 역할, 네트워크 환경이 다른 호스트를 정책 하나로 묶어도 되나
- agent 업그레이드는 몇 대씩, 어떤 순서로 하나
- 네트워크가 끊긴 동안의 로그는 얼마나 보존되나

### 범위

다룸:

- 정책 설계: 이기종 호스트 분리 기준, 공통 설정과 개별 설정 나누기
- 변경 적용 순서: 테스트 정책 → 소수 canary → 단계적 확대
- 인증서와 CA 교체 절차와 공식 문서의 제약
- agent 업그레이드: 배치 단위, rollout 기간 설정, 실패 시 되돌리기
- Fleet Server 가용성 구성(03의 무중단 구성과 연결)
- output queue와 offline 시 데이터 보존 범위(Agent는 memory queue만 설정 가능하다는 점과 파일 원천의 registry)

### labs 실험 설계

- 환경: Elasticsearch, Kibana, Fleet Server, agent 3에서 5대 docker compose
- 실험: 공식 절차대로 CA 교체, 절차를 빠뜨렸을 때 agent 상태 변화. 업그레이드를 배치와 rollout 기간으로 나눠 수행. Elasticsearch 연결을 끊었다가 복구하고 그동안 생성한 이벤트의 도착 여부 확인

### 공식 출처

- [Rotate SSL/TLS CA certificates](https://www.elastic.co/docs/reference/fleet/certificates-rotation)
- [Upgrade Elastic Agents](https://www.elastic.co/docs/reference/fleet/upgrade-elastic-agent)
- [Deploy on-premises and self-managed Fleet Server](https://www.elastic.co/docs/reference/fleet/add-fleet-server-on-prem)
- [Fleet Server scalability](https://www.elastic.co/docs/reference/fleet/fleet-server-scalability)
- [Fleet Server known issues](https://www.elastic.co/docs/release-notes/fleet-server/known-issues)

### 확인할 사실

- [ ] CA 교체 시 agent 재시작이 필요한 조건
- [ ] 업그레이드 API의 rollout 기간, 배치 관련 옵션
- [ ] Fleet Server 확장과 이중화에 대한 공식 권장
- [ ] agent 상태(healthy, unhealthy, offline) 판정 기준
