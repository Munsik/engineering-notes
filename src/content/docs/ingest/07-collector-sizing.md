---
title: "수집 계층에 자원은 얼마나 필요한가"
description: 호스트마다 설치하는 Elastic Agent, Logstash, Fleet Server의 CPU, 메모리, 디스크를 공식 수치와 산정 공식으로 잡는 방법, output performance preset과 Logstash 설정을 조정하는 기준, 운영 데이터로 처리량을 직접 재는 절차를 정리합니다.
draft: true
sidebar:
  label: 07. 자원 산정
  order: 7
---

수집 계층의 자원은 Elasticsearch sizing에 묻혀 대충 잡히는 경우가 많습니다.
그 결과 Agent가 업무 서버의 CPU를 생각보다 많이 쓰거나, Logstash heap이 모자라 GC로 처리량이 떨어지거나, PQ 디스크가 차서 입력이 멈춥니다.
Logstash 처리량은 하드웨어, 파이프라인, 데이터에 따라 크게 달라서 다른 환경의 숫자를 그대로 쓸 수 없습니다. 이 글은 공식 수치로 출발점을 잡고, 운영 데이터로 직접 재서 맞추는 절차를 정리합니다.

:::note[기준]
- Elastic Agent, Fleet Server, Logstash 9.x 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- 이 글의 수치는 모두 공식 문서의 측정값이나 예시입니다. 직접 측정한 처리량은 넣지 않았습니다.
:::

## Elastic Agent

공식 문서의 측정값입니다. AWS `m7i.large`(2 vCPU, 8GB 메모리)에서 로그 파일 하나를 최대한 빠르게 수집했고, self-monitoring을 포함했습니다([Install Elastic Agents: Resource requirements](https://www.elastic.co/docs/reference/fleet/install-elastic-agents#elastic-agent-installation-resource-requirements)).

| 자원 | throughput preset | scale preset |
| --- | --- | --- |
| CPU | 약 67% | 약 20% |
| RSS 메모리 | 약 280MB | 약 220MB |
| 쓰기 네트워크 처리량 | 약 3.5MB/s | 약 480KB/s |

- integration을 추가할수록 메모리 사용량이 늘어납니다(같은 문서).
- 디스크는 Linux 9.0 기준 1.5GB, Windows 705MB, macOS 775MB이고, 업그레이드하는 동안에는 새 binary를 받기 위해 두 배가 필요합니다(같은 문서).
- 이 측정은 "최대한 빨리 읽는" 조건입니다. 일반 업무 서버처럼 로그가 천천히 쌓이면 사용량은 훨씬 적습니다(해석).

### output performance preset

Elasticsearch output은 `preset`으로 관련 설정을 한 번에 바꿉니다. 기본은 `balanced`입니다([Elasticsearch output settings](https://www.elastic.co/docs/reference/fleet/es-output-settings)).

| 설정 | balanced | throughput | scale | latency |
| --- | --- | --- | --- | --- |
| `bulk_max_size` | 1600 | 1600 | 1600 | 50 |
| `worker` | 1 | 4 | 1 | 1 |
| `queue.mem.events` | 6400 | 25600 | 6400 | 4100 |
| `queue.mem.flush.min_events` | 1600 | 1600 | 1600 | 2050 |
| `queue.mem.flush.timeout` | 10 | 5 | 20 | 1 |
| `idle_connection_timeout` | 3 | 15 | 1 | 60 |

- 위 값은 Stack 9.5.2 이후 기준입니다. 8.12에서 9.5.1까지는 `queue.mem.events`가 balanced와 scale 3200, throughput 12800이었습니다(같은 문서).
- 공식 문서는 balanced 대비 throughput이 EPS를 약 4배, scale은 비슷한 수준, latency는 약 20% 낮다고 설명합니다.
- `queue.mem.events`를 키우면 출력이 잠시 막혔을 때 버틸 이벤트가 늘어나지만, 그만큼 메모리를 씁니다. Agent는 disk queue를 설정할 수 없으므로 이 값이 Agent 쪽 버퍼의 전부입니다([Beats and Elastic Agent capabilities](https://www.elastic.co/docs/reference/fleet/beats-agent-comparison)).

고르는 기준입니다(해석).

| 호스트 | preset |
| --- | --- |
| 일반 업무 서버, 로그가 적음 | balanced 또는 scale |
| 수천에서 수만 대 | scale(연결과 메모리를 적게) |
| syslog, 대량 수신 전용 Agent | throughput |
| 탐지 지연이 중요한 소량 이벤트 | latency |

## Logstash

### JVM heap

공식 문서의 권장입니다([Logstash JVM settings](https://www.elastic.co/docs/reference/logstash/jvm-settings)).

- 일반 수집에서 heap은 4GB 이상 8GB 이하로 잡습니다.
- heap이 너무 작으면 GC가 잦아져 CPU를 불필요하게 씁니다. heap을 두 배로 늘려 성능이 좋아지는지 보면 확인할 수 있습니다.
- 물리 메모리를 넘기지 말고, 대개 물리 메모리의 50%에서 75% 안에서 잡습니다.
- `Xms`와 `Xmx`를 같은 값으로 둡니다.

PQ를 쓰면 queue 데이터는 디스크와 OS page cache에 있으므로, heap 밖의 메모리도 남겨 둡니다(해석).

### pipeline 설정

| 설정 | 기본값 | 조정 기준 |
| --- | --- | --- |
| `pipeline.workers` | CPU core 수 | filter, output이 CPU를 다 쓰지 않는데 이벤트가 밀리면 늘림. 출력이 I/O 대기가 많으면 core 수보다 많아도 됨 |
| `pipeline.batch.size` | 125 | 크면 효율이 좋아지지만 메모리와 지연이 늘어남 |
| inflight 이벤트 | `workers` x `batch.size` | heap 산정에 반영 |

[Tuning and profiling Logstash performance](https://www.elastic.co/docs/reference/logstash/tuning-logstash) 문서의 기준입니다. 같은 문서는 flow metrics를 조정 근거로 쓰라고 권합니다. `worker_utilization`이 계속 100 근처면 worker가 모두 filter와 output 처리에 묶여 있다는 뜻입니다.

### persistent queue 디스크

공식 문서의 산정 예시입니다. 초당 1,000건, 이벤트당 1KB를 받는 Logstash가 뒤쪽이 12시간 멈춰도 원천에 압력을 주지 않으려면 `queue.max_bytes`를 약 50GB로 잡습니다(시간당 약 3.6GB x 12시간 x 여유 10%)([Persistent queues](https://www.elastic.co/docs/reference/logstash/persistent-queues)).

```text
queue.max_bytes ≈ 초당 이벤트 x 이벤트 크기 x 버틸 초 x 1.1
```

- 값은 pipeline마다 적용됩니다. 모든 pipeline의 `queue.max_bytes` 합이 디스크보다 작아야 합니다(같은 문서).
- 디스크는 이중화합니다(온프레미스 RAID)([Deploying and scaling Logstash](https://www.elastic.co/docs/reference/logstash/deploying-scaling-logstash)).
- "버틸 시간"은 Elasticsearch 장애 대응 목표 시간으로 정합니다. 주말 동안 버텨야 하면 수십 시간이 됩니다(해석).

### 대수

아래 계산은 제가 쓰는 방법입니다(해석).

```text
필요 대수 = ceil(피크 EPS / 한 대가 안정적으로 처리하는 EPS) + 1
```

- "한 대가 안정적으로 처리하는 EPS"는 아래 절차로 운영 데이터와 운영 파이프라인으로 직접 잽니다. 다른 환경의 숫자를 쓰지 않습니다.
- `+1`은 한 대를 업그레이드하거나 잃어도 나머지가 피크를 받기 위한 여유입니다. 최소 2대는 공식 권장이기도 합니다.
- PQ를 켜면 처리량이 낮아지고 CPU를 더 쓰므로, 측정도 PQ를 켠 상태로 합니다.

## Fleet Server

공식 scalability 표입니다([Fleet Server scalability](https://www.elastic.co/docs/reference/fleet/fleet-server-scalability)).

| Agent 수 | Fleet Server 메모리 | Fleet Server vCPU | Elasticsearch hot tier |
| --- | --- | --- | --- |
| 2,000 | 2GB | 최대 8 | 32GB RAM, 8 vCPU |
| 5,000 | 4GB | 최대 8 | 32GB RAM, 8 vCPU |
| 10,000 | 8GB | 최대 8 | 128GB RAM, 32 vCPU |
| 25,000 | 8GB | 최대 8 | 256GB RAM, 64 vCPU |
| 50,000 | 8GB | 최대 8 | 384GB RAM, 96 vCPU |
| 100,000 | 16GB | 16 | 512GB RAM, 128 vCPU |

- 표는 Elastic Cloud에서 측정한 값입니다. self-managed에서 같은 환경을 만들기 어려우면 여유를 두고 잡습니다(해석).
- 가용성을 위해 여러 대를 부하 분산기 뒤에 둡니다([03](../03-no-gap-ingest/#fleet-server)).

## syslog relay, Kafka

- rsyslog relay는 받아서 넘기기만 해서 CPU 부담이 작습니다. 디스크는 disk-assisted queue의 `queue.maxDiskSpace`로 정하고, 크기는 PQ와 같은 방식(버틸 시간 x 유입량)으로 계산합니다(해석).
- Kafka는 보존 기간 동안의 유입량에 replication factor를 곱한 디스크가 필요합니다. 상세는 Kafka 운영 자료를 따릅니다.

## 처리량을 직접 재는 절차

아래 순서는 제가 쓰는 방법입니다(해석).

1. 운영과 같은 사양의 Logstash 1대를 준비합니다. 파이프라인, PQ 설정, JVM heap도 운영과 같게 둡니다.
2. 운영 데이터의 표본(최소 몇 시간 분량)을 파일로 준비해 입력으로 씁니다. 데이터 특성이 결과를 크게 바꾸므로 synthetic 데이터를 쓰지 않습니다.
3. 출력은 운영 Elasticsearch(또는 같은 사양)로 둡니다. 출력이 병목이면 Logstash가 아니라 Elasticsearch를 재게 되므로, 비교용으로 출력을 버리는 구성도 한 번 돌립니다.
4. `pipeline.workers`, `pipeline.batch.size`를 하나씩 바꾸며 flow metrics(`input_throughput`, `worker_utilization`, `queue_backpressure`)와 CPU, heap을 기록합니다.
5. `worker_utilization`이 100 근처에 붙고 CPU가 포화되는 지점의 EPS를 한계로 보고, 그 70% 정도를 "안정적으로 처리하는 EPS"로 씁니다.

Agent도 같은 방식으로, 운영 서버에 integration을 켠 상태로 며칠간 CPU와 메모리를 관찰해 정합니다.

## 판단 기준

이 절은 위의 사실을 바탕으로 한 제 판단입니다(해석).

| 구성 요소 | 출발점 | 맞추는 방법 |
| --- | --- | --- |
| Agent | 공식 측정값, preset은 balanced 또는 scale | 운영 서버에서 며칠 관찰 |
| Logstash | heap 4GB에서 8GB, workers는 core 수, 최소 2대 | 운영 데이터로 직접 재서 대수 결정 |
| Logstash PQ | 버틸 시간 x 유입량 x 1.1 | Elasticsearch 장애 대응 목표 시간으로 |
| Fleet Server | 공식 scalability 표, 2대 이상 | Agent 수 증가에 맞춰 |

## 참고 문서

- [Install Elastic Agents: Resource requirements](https://www.elastic.co/docs/reference/fleet/install-elastic-agents#elastic-agent-installation-resource-requirements)
- [Elasticsearch output settings: Performance tuning](https://www.elastic.co/docs/reference/fleet/es-output-settings)
- [Logstash JVM settings](https://www.elastic.co/docs/reference/logstash/jvm-settings)
- [Tuning and profiling Logstash performance](https://www.elastic.co/docs/reference/logstash/tuning-logstash)
- [Persistent queues](https://www.elastic.co/docs/reference/logstash/persistent-queues)
- [Fleet Server scalability](https://www.elastic.co/docs/reference/fleet/fleet-server-scalability)
