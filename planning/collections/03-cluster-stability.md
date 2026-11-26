# 3. 클러스터가 죽지 않게, 죽어도 돌아오게

운영 중 장애를 겪는 사람에게 가장 필요한 내용입니다. self-managed 비중이 높은 환경을 기본으로 쓰고, ECH와 다른 점은 글마다 적습니다.
"평소 점검 → 징후 → 장애 유형별 대응 → 복구 설계 → 사후 분석" 순서로 따라 읽을 수 있게 구성합니다.

- 폴더: `src/content/docs/operations/`
- labs: `labs/operations/` (진단 명령 모음, 재현 스크립트)
- 기준: Elasticsearch 9.x, Linux

## 진행 메모 (2026-11-26)

- 기존 4편(3-1에서 3-4)을 10편으로 확장. 사용자 요청: 현장에서 실제로 겪는 이슈, general guidance, best practice, 시나리오를 단계별로
- 근거: 공식 troubleshooting 문서(docs-content `troubleshoot/elasticsearch/`), production guidance, Elasticsearch 소스와 release notes(known issues)
- 사내 KB, Slack, internal docs는 현장에서 자주 나오는 주제를 고르는 데만 사용. 본문 근거는 공개 자료로 다시 확인한 것만
- 사내 자료에서 확인한 자주 나오는 주제: GC가 회수하지 못하는 상태(ineffective G1 cycle), RPM 설치의 `vm.max_map_count` 되돌림, exit code 143(SIGTERM), 저트래픽 시간대 HTTP timeout과 TCP keepalive, 클라이언트가 받는 TCP RST, 9.5.0에서 9.5.2의 translog 증가 known issue, mapping explosion, 재시작 절차
- 01에서 04를 먼저 초안으로 작성. 05에서 10은 다음 단계
- 2026-11-27: 05에서 10 작성, 10편 모두 발행. 03의 `/etc/sysctl.conf` 확인 필요는 Ubuntu 24.04에서 systemd-sysctl, procps 적용 순서를 재현해 해소. lab ECH 로그인이 풀려 있어 05에서 10의 API는 공식 문서와 소스 기준으로만 확인(lab 실행은 다음 재검증 때)

## 글 목록과 순서

| 순서 | 파일 | 제목(가제) | 단계 |
| --- | --- | --- | --- |
| 01 | `operations/01-daily-checks.md` | 평소에 무엇을 보고 있어야 하는가 | 평소 |
| 02 | `operations/02-red-yellow.md` | 클러스터가 RED나 YELLOW일 때 무엇부터 보는가 | 징후, 장애 |
| 03 | `operations/03-node-failure-triage.md` | 노드가 왜 죽었는지 어떻게 좁혀 가는가 | 장애 |
| 04 | `operations/04-disk-full.md` | 디스크가 차면 무슨 일이 생기고 어떻게 푸는가 | 장애 |
| 05 | `operations/05-slow-cluster.md` | 클러스터가 느려질 때 어디서 막혔는지 어떻게 찾는가 | 장애 |
| 06 | `operations/06-expensive-queries.md` | 비싼 query로부터 클러스터를 어떻게 보호하는가 | 예방 |
| 07 | `operations/07-unstable-cluster.md` | 노드가 클러스터에서 자꾸 빠질 때 | 장애 |
| 08 | `operations/08-recoverability.md` | 노드 하나를 잃어도 데이터를 잃지 않으려면 | 복구 설계 |
| 09 | `operations/09-offline-diagnostics.md` | 진단 파일을 밖으로 낼 수 없을 때 어떻게 점검하는가 | 점검 |
| 10 | `operations/10-incident-runbook.md` | 장애가 났을 때 첫 30분에 무엇을 하는가 | 사후 |

기존 계획과의 대응: 3-1 → 03, 3-2 → 08(RED 대응 부분은 02로 분리), 3-3 → 06, 3-4 → 09.

---

## 3-1. 평소에 무엇을 보고 있어야 하는가 (01)

상태: `발행`

- 질문: 매일 무엇을 확인하나. 어떤 지표를 어느 임계값으로 알림하나. 무엇으로 모니터링하나(Stack Monitoring, AutoOps, health report)
- 범위: health report API의 indicator, 노드 지표(heap, CPU, 디스크, thread pool rejection, GC), shard 수와 크기, 매일, 매주, 매월 점검표, 공식 문서에 나온 임계값(heap 85%, parent breaker 95%, 디스크 85/90/95%)
- 근거: Health report API, High JVM memory pressure, Watermark errors, AutoOps(self-managed는 Cloud Connect), Size your shards

## 3-2. 클러스터가 RED나 YELLOW일 때 (02)

상태: `발행`

- 질문: RED와 YELLOW는 무엇이 다른가. unassigned shard 원인을 어떻게 읽나. 사본이 없으면 선택지는
- 범위: health report, `_cat/shards`, allocation explain 읽는 법, 흔한 원인(노드 이탈, 디스크 watermark, 할당 규칙, 최대 재시도 초과, shard 한도), `node_left.delayed_timeout`(기본 1분), `_cluster/reroute?retry_failed`, 사본이 없을 때 snapshot 복원과 빈 primary 할당의 데이터 손실 범위
- 근거: Red or yellow cluster health status, Diagnose unassigned shards, Cluster allocation API examples, Restore from snapshot

## 3-3. 노드가 왜 죽었는지 어떻게 좁혀 가는가 (03)

상태: `발행`

- 질문: heap이 가득 차서 노드가 재시작됐다. 429와 OOM은 무엇이 다른가. OS가 프로세스를 죽였는지 어떻게 아나. OS 설정은 무엇을 확인하나
- 범위: 메모리 구조(heap, off-heap, page cache), 증상별 분기(circuit breaker 429, GC가 회수하지 못함, JVM OOM, OS OOM killer, SIGTERM 종료), 진단 명령, 흔한 원인(큰 aggregation, 큰 bulk, shard와 필드가 많음), OS 설정(swap, `vm.max_map_count`, file descriptor, TCP retransmission), 공식 근거가 없는 OS 튜닝은 확인 필요로 분리
- 근거: High JVM memory pressure, Circuit breaker errors, Circuit breaker settings, Important system configuration, Bootstrap checks, Capture diagnostics, Elasticsearch 패키지의 sysctl 파일

## 3-4. 디스크가 차면 (04)

상태: `발행`

- 질문: 85%, 90%, 95%에서 각각 무슨 일이 생기나. read-only가 걸리면 어떻게 푸나. `disk.indices`보다 `disk.used`가 훨씬 크면
- 범위: watermark 동작, flood-stage 해제 조건, 긴급 조치 순서(삭제, replica 축소, 용량 추가), 재발 방지(ILM, 크기 기준 rollover, frozen), 9.5.0에서 9.5.2의 known issue(translog가 정리되지 않아 디스크 증가, 9.5.3에서 수정), 마스터, 기타 노드 디스크
- 근거: Watermark errors, Fix data node out of disk, Fix master node out of disk, Decrease disk usage, Elasticsearch known issues

## 3-5. 클러스터가 느려질 때 (05)

상태: `발행`

- 질문: 검색이나 적재가 느려졌다. CPU인가, 디스크인가, 특정 노드인가, 특정 요청인가
- 범위: high CPU 진단(hot threads), thread pool rejection과 queue, task queue backlog(pending tasks, 오래 걸리는 task), hot spotting(데이터 컬렉션 04와 연결), slow log, search profiler, 클라이언트 쪽 원인(연결 재사용, timeout, TCP keepalive)
- 근거: High CPU usage, Rejected requests, Task queue backlog, Hot spotting, Slow log, Troubleshooting searches

## 3-6. 비싼 query로부터 보호 (06)

상태: `발행` (기존 3-3)

- 질문: 사용자 한 명의 query가 클러스터 전체를 느리게 만든다. 어떤 query가 위험하고 어떻게 막나
- 범위: 위험한 query 유형(고 cardinality terms, 깊은 pagination, leading wildcard, 큰 regex, script), 보호 설정(`search.max_buckets` 기본 65,536, `search.allow_expensive_queries`, `search.default_search_timeout`, `index.max_result_window`), 실행 중인 query 찾기와 취소(tasks API), Kibana 쪽 제한, 대안(composite aggregation, search_after, PIT)
- 근거: Search settings, Circuit breaker settings, Task management API, Paginate search results

## 3-7. 노드가 클러스터에서 자꾸 빠질 때 (07)

상태: `발행` (신규)

- 질문: node-left 로그가 반복된다. 네트워크인가, 노드 과부하인가. master가 자주 바뀐다
- 범위: node-left 이유(disconnected, lagging, followers check retry count exceeded), `cluster.follower_lag.timeout`(90s), TCP retransmission(`net.ipv4.tcp_retries2`), discovery 문제, cluster state가 클 때(shard 수, 필드 수, mapping explosion), master 전용 노드
- 근거: Troubleshooting an unstable cluster, Discovery troubleshooting, Mapping explosion, Decrease the TCP retransmission timeout

## 3-8. 노드 하나를 잃어도 데이터를 잃지 않으려면 (08)

상태: `발행` (기존 3-2)

- 질문: replica 0의 비용과 위험, zone 배치, snapshot 주기, rolling restart가 오래 걸리는 이유
- 범위: 복구 목표(RPO, RTO)와 replica, zone, SLM, rolling restart 공식 절차(`cluster.routing.allocation.enable: primaries`, flush, ML upgrade mode), recovery 속도 설정, 노드 제거 절차(allocation exclude)
- 근거: Design for resilience, Full cluster restart and rolling restart procedures, Index recovery settings, Snapshot lifecycle management

## 3-9. 진단 파일을 밖으로 낼 수 없을 때 (09)

상태: `발행` (기존 3-4)

- 질문: 폐쇄망이라 support diagnostic을 보낼 수 없다. 무엇을 직접 보나
- 범위: support diagnostic 도구가 모으는 것, 수동으로 같은 정보를 모으는 API 목록, 읽는 순서, 민감 정보 제거
- 근거: Capture diagnostics, support-diagnostics 저장소

## 3-10. 장애가 났을 때 첫 30분 (10)

상태: `발행` (신규)

- 질문: 장애 알림을 받았다. 무엇부터, 누가, 어떤 순서로 하나. 지원 요청에는 무엇을 붙이나
- 범위: 영향 확인, 정보 보존(재시작 전에 hot threads, tasks, 로그), 완화 조치 우선순위(쓰기 중단, 비싼 요청 취소, 노드 격리), 의사소통, 지원 요청 정보, 사후 분석 양식
- 근거: Capture diagnostics, 01에서 09의 진단 절차
