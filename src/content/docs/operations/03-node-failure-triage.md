---
title: "노드가 왜 죽었는지 어떻게 좁혀 가는가"
description: 노드가 재시작됐을 때 어떻게 죽었는지(SIGTERM, JVM OOM, OS OOM killer, GC가 회수하지 못함)부터 가르고, circuit breaker 429와 heap 압박의 원인을 진단 명령으로 좁히는 순서, 흔한 원인, OS 설정 점검을 정리합니다.
draft: true
sidebar:
  label: 03. 노드 장애
  order: 3
---

"노드가 재시작됐는데 Elasticsearch 로그에는 단서가 없다"는 문의가 많습니다. 로그에 단서가 없다는 것 자체가 단서입니다. 프로세스가 스스로 내려간 것이 아니라 밖에서 죽었을 가능성이 크기 때문입니다.
이 글은 어떻게 죽었는지부터 가르고, 메모리 문제라면 원인을 좁히는 순서를 정리합니다.

:::note[기준]
- Elasticsearch 9.x, Linux 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- 명령 모음은 [`labs/operations/node-triage.console`](https://github.com/Munsik/engineering-notes/blob/main/labs/operations/node-triage.console)에 있습니다.
:::

## 메모리 구조

| 영역 | 크기 | 넘치면 |
| --- | --- | --- |
| JVM heap | 기본은 노드 역할과 메모리로 자동 설정. 직접 정하면 물리 메모리의 50% 이하, compressed oops 경계 이하(대부분 26GB는 안전, 일부 시스템은 30GB) | circuit breaker 429, GC 증가, JVM OOM |
| off-heap(네트워크 버퍼, direct memory) | heap 밖 | 프로세스 메모리 증가, OS OOM killer |
| OS page cache | 남은 메모리 전부 | 줄면 검색, 적재가 느려짐(죽지는 않음) |

근거: [JVM settings](https://www.elastic.co/docs/reference/elasticsearch/jvm-settings). 같은 문서는 자동 heap 설정을 권하고, 같은 호스트에 노드가 여럿이면 heap 합이 메모리의 50%를 넘지 않게 하라고 적고 있습니다.

## 어떻게 죽었나부터 가른다

| 흔적 | 의미 | 확인 |
| --- | --- | --- |
| Elasticsearch 로그에 정상 종료 메시지, 종료 코드 143 | SIGTERM을 받아 정상 종료. 누군가(사람, systemd, 배포 도구, 컨테이너 런타임)가 내렸음 | `journalctl -u elasticsearch`, 배포 이력 |
| 로그에 `OutOfMemoryError`, `.hprof` 파일 생성 | JVM heap OOM | heap dump 위치(9.1부터 기본 logs 디렉터리, 9.0은 data 디렉터리) |
| 로그가 갑자기 끊김, 커널 로그에 `Out of memory: Killed process` | OS OOM killer | `dmesg -T`, `journalctl -k` |
| 로그 끝부분에 긴 GC, 응답 없음 뒤 재시작 | GC가 heap을 회수하지 못해 멈춤 | GC 로그, 모니터링의 heap 그래프 |

종료 코드 143은 128 + 15(SIGTERM)입니다. heap dump 기본 위치는 [JVM settings](https://www.elastic.co/docs/reference/elasticsearch/jvm-settings)에 있습니다.

OS OOM killer라면 heap이 아니라 프로세스 전체 메모리가 원인입니다. heap을 물리 메모리의 50% 넘게 잡았거나, 같은 호스트의 다른 프로세스가 메모리를 쓰거나, 컨테이너 메모리 한도가 heap에 비해 작은 경우가 흔합니다(해석).

## circuit breaker 429

circuit breaker는 요청이 heap 한도를 넘을 것으로 예상되면 요청을 거부해 노드를 지킵니다. 거부된 요청은 HTTP 429와 `circuit_breaking_exception`을 받습니다([Circuit breaker errors](https://www.elastic.co/docs/troubleshoot/elasticsearch/circuit-breaker-errors)).

| breaker | 기본 한도 |
| --- | --- |
| parent | `indices.breaker.total.use_real_memory: true`(기본)면 heap의 95%, 아니면 70% |
| request(aggregation 등 요청 단위 구조) | heap의 60% |
| fielddata | heap의 40% |
| inflight_requests(전송 중 요청 크기) | heap의 100%(parent에 묶임) |

근거: [Circuit breaker settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/circuit-breaker-settings).

```console
GET _cat/circuit_breaker?v
GET _nodes/stats?filter_path=nodes.*.name,nodes.*.breakers.*.tripped,nodes.*.breakers.*.estimated_size,nodes.*.breakers.*.limit_size
```

9.5.5의 노드 통계에는 이 밖에 `model_inference`, `eql_sequence` breaker도 보입니다(로컬 확인). 오류 메시지의 `[parent]`, `[request]`, `[fielddata]`가 어떤 breaker인지 알려 줍니다. `[parent]`는 heap 전체가 높다는 뜻이라 특정 요청보다 heap 압박 자체를 봐야 하고, `[request]`는 대개 큰 aggregation입니다(해석).
429는 circuit breaker만 내는 것이 아닙니다. thread pool queue가 차거나 indexing pressure 한도(기본 heap의 10%)를 넘어도 `es_rejected_execution_exception`과 함께 429가 납니다. 오류 이름으로 둘을 구분합니다([Rejected requests](https://www.elastic.co/docs/troubleshoot/elasticsearch/rejected-requests)).

breaker 한도를 올리는 것은 해결이 아닙니다. 노드를 지키는 장치를 끄는 것이라 OOM으로 이어질 수 있습니다(해석).

## heap 압박의 원인 좁히기

공식 문서는 heap 사용률이 계속 85%를 넘으면 압박을 줄이라고 권합니다([High JVM memory pressure](https://www.elastic.co/docs/troubleshoot/elasticsearch/high-jvm-memory-pressure)).

| 순서 | 볼 것 | 명령 |
| --- | --- | --- |
| 1 | 어느 노드가, 언제부터 | `GET _cat/nodes?v&h=name,node.role,heap.percent,ram.percent,cpu&s=heap.percent:desc` |
| 2 | GC가 기준을 벗어나는지(Young 50ms 미만, Old 1초 미만, 10분에 한 번 이하) | GC 로그, `GET _nodes/stats/jvm` |
| 3 | 지금 무엇이 돌고 있나 | `GET _tasks?detailed=true&actions=*search*`, `GET _nodes/hot_threads` |
| 4 | 구조적 부담 | shard 수, 필드 수, segment 수(`GET _cluster/stats`) |
| 5 | 정확한 원인 | heap 사용률이 높을 때 heap dump |

자주 보는 원인입니다.

| 원인 | 신호 | 조치 |
| --- | --- | --- |
| 큰 aggregation(고 cardinality terms, 큰 `size`) | request breaker, 특정 시간대 대시보드 | 06(예정)의 보호 설정, composite aggregation |
| 큰 bulk, 동시 bulk 과다 | indexing pressure 거부, coordinating 노드 heap | bulk 크기 줄이기([데이터 설계 04](../../data/04-shards-and-bulk/)) |
| shard, index, 필드가 너무 많음 | 평소에도 heap이 높고 내려가지 않음 | shard 정리, rollover 크기 기준, mapping explosion 방지 |
| fielddata(text 필드 집계) | fielddata breaker | text 필드 집계를 keyword로 |

GC가 계속 돌아도 heap이 줄지 않는 상태는 저절로 회복되지 않는 경우가 많습니다. 원인 요청을 취소할 수 없으면 해당 노드를 재시작하는 편이 장애 시간을 줄입니다. 재시작 전에 hot threads와 tasks를 저장해 둡니다(해석).

## OS 설정 점검

공식 문서의 important system configuration 항목입니다([Important system configuration](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/important-system-configuration)).

| 항목 | 공식 권장 | 확인 |
| --- | --- | --- |
| swap | 완전히 끄는 것이 우선. 안 되면 swappiness를 낮추거나 `bootstrap.memory_lock` | `GET _nodes?filter_path=**.mlockall`, `free -m` |
| `vm.max_map_count` | 1048576보다 낮으면 1048576으로 | `sysctl vm.max_map_count` |
| file descriptor | 최소 65,535. RPM, Debian 패키지는 기본 적용 | `GET _nodes/stats/process?filter_path=**.max_file_descriptors` |
| thread 수 | 최소 4,096 | `ulimit -u` |
| TCP retransmission | `net.ipv4.tcp_retries2`를 낮춰(예: 5) 장애를 빨리 감지 | `sysctl net.ipv4.tcp_retries2` |
| 백신 | data 디렉터리를 검사 대상에서 제외 | [Important settings configuration](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/important-settings-configuration) |

`vm.max_map_count`는 패키지 업그레이드 뒤에 바뀌어 있을 수 있습니다.

- 9.5.5 RPM, Debian 패키지는 `/usr/lib/sysctl.d/elasticsearch.conf`에 `vm.max_map_count=262144`를 넣고, 설치와 업그레이드 때 `systemd-sysctl`을 다시 시작합니다(Elasticsearch 9.5.5 소스 `distribution/packages`). 9.6 개발 브랜치는 1048576입니다.
- systemd의 sysctl.d는 디렉터리와 상관없이 파일 이름의 사전 순서로 적용하고, 같은 설정이 여러 파일에 있으면 이름이 가장 뒤인 파일이 이깁니다. `/etc/sysctl.d/99-custom.conf`의 값은 이름 순서상 뒤인 `elasticsearch.conf`(`9`보다 `e`가 뒤)에 덮입니다. `/etc/sysctl.d/elasticsearch.conf`처럼 같은 이름으로 두면 `/usr/lib/sysctl.d`의 패키지 파일을 대체합니다([systemd sysctl.d(5)](https://www.freedesktop.org/software/systemd/man/latest/sysctl.d.html)).
- 공식 문서는 `/etc/sysctl.conf`에 두면 패키지 기본값보다 우선한다고 적고 있습니다([vm.max_map_count](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/vm-max-map-count)). 그런데 `systemd-sysctl`은 `/etc/sysctl.conf`를 직접 읽지 않습니다. 배포판이 `99-sysctl.conf`라는 이름의 링크로 연결해 둔 경우에만 읽고, 이 이름은 `elasticsearch.conf`보다 앞이라 패키지 값에 덮입니다.
- Ubuntu 24.04(systemd 255, procps-ng 4.0.4)에서 재현했습니다. `/etc/sysctl.conf`에 1048576, `/usr/lib/sysctl.d/elasticsearch.conf`에 262144를 두고 실행한 결과입니다. 패키지를 설치하는 대신 9.5.5 패키지와 같은 내용의 파일을 같은 위치에 두었습니다.

| 적용 경로 | 언제 도나 | 결과 |
| --- | --- | --- |
| `systemd-sysctl` | 부팅, 패키지 설치와 업그레이드(postinst) | 262144. 패키지 값이 이김 |
| `sysctl --system`(procps) | 사람이 직접 실행할 때 | 1048576. `/etc/sysctl.conf`를 맨 마지막에 읽음 |
| `/etc/sysctl.d/elasticsearch.conf`에 1048576 | 둘 다 | 1048576. 같은 이름이 패키지 파일을 대체 |

- Ubuntu 24.04는 자체 기본값으로 `/etc/sysctl.d/10-map-count.conf`에 1048576을 둡니다. Elasticsearch 패키지가 넣는 `elasticsearch.conf`는 이름 순서상 뒤라 이 값을 262144로 낮춥니다.
- 링크가 있는 배포판은 Ubuntu 24.04(위 재현), RHEL 7 이후([Red Hat solution 3726391](https://access.redhat.com/solutions/3726391)), Debian 12입니다. Debian 13은 이 링크를 없애서 `systemd-sysctl`이 `/etc/sysctl.conf`를 아예 읽지 않습니다([Debian 13 release notes 5.1.15](https://www.debian.org/releases/trixie/release-notes/issues.html#etc-sysctl-conf-is-no-longer-honored)).
- RHEL에서 tuned가 돌면 tuned의 sysctl plugin이 `/etc/sysctl.conf`를 마지막에 다시 적용합니다([RHEL-6884](https://issues.redhat.com/browse/RHEL-6884)). 그래서 같은 설정이라도 tuned 유무에 따라 결과가 달라질 수 있습니다.
- 정리하면 배포판과 상관없이 `/etc/sysctl.d/elasticsearch.conf`에 두는 방법이 확실합니다. 업그레이드와 재부팅 뒤에는 `sysctl vm.max_map_count`로 실제 값을 확인합니다(해석).

THP(transparent huge pages), glibc malloc arena 같은 튜닝은 공식 important system configuration에 없습니다. 근거 없이 바꾸지 않습니다.

## 판단 기준

이 절은 위의 사실을 바탕으로 한 제 판단입니다(해석).

| 상황 | 먼저 할 것 |
| --- | --- |
| 노드가 재시작됨 | 종료 흔적으로 SIGTERM, JVM OOM, OS OOM, GC 정지 중 무엇인지 가름 |
| 429가 간헐적으로 | breaker 종류 확인, `request`면 aggregation, `parent`면 heap 전체 |
| heap이 평소에도 85% 이상 | shard, 필드 수부터 줄임. heap 증설은 그다음 |
| OS OOM killer | heap 비율, 다른 프로세스, 컨테이너 한도 |
