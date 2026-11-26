---
title: "UDP syslog를 유실 없이 받으려면"
description: UDP syslog가 어디서 버려지는지 네 지점으로 나누고, 커널과 Elastic Agent 지표로 drop을 재는 방법, 수신 버퍼 조정, syslog relay와 부하 분산 구성, 수신기 재시작 구간을 줄이는 방법을 정리합니다.
draft: true
sidebar:
  label: 04. UDP syslog
  order: 4
---

방화벽, 스위치, 보안 장비 가운데에는 UDP 514로만 보내는 장비가 아직 많습니다. 그런데 감사 요구사항은 "유실 없음"입니다.
UDP는 받았다는 확인을 돌려주지 않습니다. 그래서 수신 쪽이 잠깐 느려지거나 멈추면, 송신 장비는 아무것도 모른 채 계속 보내고 그 사이의 로그는 사라집니다.
피크 시간에만 건수가 줄어드는데 원인을 모르는 경우가 대부분 이 문제입니다. 이 글은 유실이 생기는 지점과 계측 방법부터 정리하고, 줄이는 구성을 다룹니다.

:::note[기준]
- Elastic Agent 9.x(Custom UDP Logs, syslog를 받는 integration), Linux 수신 서버 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- 설정 예시는 [`labs/ingest/syslog-udp/`](https://github.com/Munsik/engineering-notes/tree/main/labs/ingest/syslog-udp)에 있습니다. 송신 속도별 drop 비율 같은 실측 수치는 하드웨어와 네트워크에 따라 크게 달라 넣지 않았습니다. 같은 방법으로 직접 재는 절차를 적었습니다.
:::

## 먼저 받아들일 전제

UDP 구간이 남아 있는 한 유실 0을 보장할 수 없습니다. 할 수 있는 것은 세 가지입니다(해석).

1. UDP 구간을 짧게 만든다. 장비 가장 가까운 곳에서 받아 그 뒤로는 TCP로 넘긴다.
2. 남은 UDP 구간에서 drop이 생기면 바로 알 수 있게 계측한다.
3. 수신기가 멈추는 시간을 줄인다.

## UDP 유실이 생기는 네 지점

```mermaid
flowchart LR
    D["송신 장비<br/>(송신 버퍼)"] -- "① 네트워크" --> K["수신 서버 커널<br/>② socket 수신 버퍼"]
    K --> A["Agent UDP input<br/>③ 읽기 속도"]
    A --> Q["Agent memory queue<br/>④ 출력 지연"]
    Q --> ES["Elasticsearch"]
```

| 지점 | 무엇이 넘치나 | 어떻게 보나 |
| --- | --- | --- |
| ① 네트워크 | 경로 위 장비의 버퍼, 링크 대역폭 | 네트워크 장비 통계. 수신 서버에서는 보이지 않음 |
| ② 커널 socket 수신 버퍼 | 애플리케이션이 읽기 전에 버퍼가 가득 참 | `/proc/net/snmp`의 `Udp: RcvbufErrors`, `netstat -su`의 receive buffer errors |
| ③ UDP input 읽기 | 입력이 버퍼를 비우는 속도가 들어오는 속도보다 느림 | Agent UDP input 지표 `receive_queue_length`, `system_packet_drops` |
| ④ 출력 지연 | Elasticsearch나 Logstash가 느려 memory queue가 가득 참. 입력이 버퍼를 비우지 못해 ②가 넘침 | Agent의 pipeline queue 사용률, output 오류 |

④가 가장 놓치기 쉽습니다. UDP에는 송신 측에 "천천히 보내라"고 알릴 방법이 없어서, 뒤쪽이 느려지면 그 압력이 결국 커널 수신 버퍼의 drop으로 나타납니다. ingest pipeline에 무거운 처리를 추가한 뒤 UDP drop이 늘었다면 이 경우입니다(해석).

## 계측

### 커널 카운터

```bash
# 누적값. 몇 분 간격으로 두 번 보고 차이를 본다
grep -A1 '^Udp:' /proc/net/snmp
netstat -su | grep -i -E 'receive buffer errors|packet receive errors'
```

`RcvbufErrors`가 늘면 ②에서 버려지고 있습니다.

### Agent UDP input 지표

UDP input은 다음 지표를 냅니다([Filebeat UDP input](https://www.elastic.co/docs/reference/beats/filebeat/filebeat-input-udp)).

| 지표 | 의미 |
| --- | --- |
| `udp_read_buffer_length_gauge` | UDP socket 버퍼 크기(byte) |
| `receive_queue_length` | 시스템 수신 queue 크기 합(IPv4, IPv6). Linux 전용 |
| `system_packet_drops` | 시스템 패킷 drop 수 합(IPv4, IPv6). Linux 전용 |

Fleet 관리 Agent는 이 입력 지표를 `metrics-elastic_agent.filebeat_input-*` data stream으로 보냅니다(elastic/integrations의 `elastic_agent` 패키지 필드 정의 기준). [06](../06-flow-dashboard/)의 대시보드에서 이 값을 패널로 씁니다.

<!-- CAPTURE: ingest-udp-input-metrics.jpg | C-03 -->

## 수신 버퍼 조정

Custom UDP Logs integration은 고급 설정에서 `read_buffer_size`와 `max_message_size`(기본 10KiB)를 바꿀 수 있습니다(elastic/integrations의 `udp` 패키지 manifest 기준).
애플리케이션이 큰 버퍼를 요청해도 커널 한도를 넘을 수 없으므로 OS 설정도 같이 올립니다.

```bash
# /etc/sysctl.d/90-udp-syslog.conf
net.core.rmem_max = 33554432
net.core.rmem_default = 33554432
net.core.netdev_max_backlog = 50000
```

```yaml
# Custom UDP Logs 고급 설정
read_buffer_size: 32MiB
max_message_size: 64KiB
```

버퍼를 키우면 순간적인 피크를 흡수할 시간이 늘어날 뿐, 평균 수신 속도가 처리 속도보다 빠른 상황은 해결하지 못합니다. 그 경우는 수신기를 늘리거나 뒤쪽 처리를 가볍게 해야 합니다(해석). 값은 예시입니다. 피크 초당 건수와 메시지 크기로 몇 초를 버틸지 계산해 정합니다.

## 구성 패턴

| 패턴 | 하는 일 | 남는 위험 |
| --- | --- | --- |
| A. syslog relay에서 TCP로 바꾸기 | 장비 가까이의 rsyslog가 UDP를 받아 disk-assisted queue에 두고 TCP로 Agent나 Logstash에 넘김 | relay 자체의 재시작, 장애 구간 |
| B. UDP 부하 분산 | VIP 뒤에 수신기 여러 대. 한 대를 멈춰도 나머지가 받음 | VIP 전환 순간의 유실, 부하 분산기 성능 |
| C. 이중 송신 | 장비가 수신기 두 곳으로 같은 로그를 보냄 | 저장 단계 중복 제거 필요, 장비 부하 |

### A. rsyslog relay

rsyslog 공식 tutorial의 신뢰성 있는 전달 구성은 action에 LinkedList queue와 `queue.filename`(disk assistance), `queue.saveOnShutdown`, `action.resumeRetryCount="-1"`을 주고 TCP로 보내는 것입니다([rsyslog: Reliable forwarding](https://www.rsyslog.com/doc/tutorials/reliable_forwarding.html)).

```text
# /etc/rsyslog.d/10-relay.conf
global(workDirectory="/var/spool/rsyslog")
module(load="imudp")
input(type="imudp" port="514" rcvbufSize="32m")

action(type="omfwd" target="10.0.0.100" port="6514" protocol="tcp"
       action.resumeRetryCount="-1"
       queue.type="LinkedList"
       queue.filename="fwd_elastic"
       queue.maxDiskSpace="20g"
       queue.saveOnShutdown="on")
```

- 뒤쪽(Agent, Logstash)이 멈추면 relay가 메모리와 디스크에 쌓아 두었다가 다시 보냅니다. 업그레이드가 잦은 수집 계층을 장비에서 떼어 놓는 효과가 있습니다.
- 같은 tutorial은 disk-assisted queue가 프로세스 강제 종료, OOM, 시스템 장애, 전원 장애 뒤에는 순수 disk queue와 같은 보장을 하지 않는다고 적고 있습니다.
- relay는 설정을 단순하게 두고 거의 바꾸지 않습니다. 파싱과 변환은 뒤 계층에서 합니다(해석).
- `target`은 03의 L4 부하 분산 VIP로 두면 뒤쪽도 이중화됩니다.

### B. UDP 부하 분산

수신 Agent 여러 대를 VIP 뒤에 둡니다. nginx stream 모듈은 UDP 부하 분산을 지원합니다([nginx: TCP and UDP load balancing](https://docs.nginx.com/nginx/admin-guide/load-balancer/tcp-udp-load-balancer/)).

```text
stream {
    upstream syslog_udp {
        server 10.0.0.21:514;
        server 10.0.0.22:514;
    }
    server {
        listen 514 udp;
        proxy_pass syslog_udp;
        proxy_responses 0;
    }
}
```

- 오픈소스 nginx는 UDP upstream의 능동 health check가 없습니다. 실패를 감지하는 방식은 확인 필요입니다. LVS(keepalived)나 네트워크 장비의 부하 분산 기능도 선택지입니다.
- HAProxy의 UDP 지원 범위는 버전과 에디션에 따라 다릅니다(확인 필요).
- 부하 분산기를 거치면 수신기가 보는 송신 IP가 바뀔 수 있습니다. `host.ip`나 `log.source.address`로 장비를 구분한다면 원래 주소를 보존하는 방식(DSR, transparent proxy)을 확인합니다(해석).

### C. 이중 송신

장비가 syslog 대상을 두 개 지원하면 두 수신기로 같은 로그를 보냅니다. 한쪽이 멈춰도 다른 쪽이 받습니다. 대신 평소에는 모든 로그가 두 번 들어오므로 저장 전에 중복을 제거해야 합니다. 메시지 내용과 장비, 시각으로 fingerprint를 만들어 `_id`로 쓰는 방법은 [05](../05-count-reconciliation/#중복-찾기와-막기)에서 다룹니다. 같은 내용의 로그가 같은 초에 정당하게 여러 번 찍히는 장비라면 이 방법은 쓸 수 없습니다(해석).

## 직접 재는 절차

1. 송신기에서 순번을 붙인 syslog를 정해진 속도로 보냅니다. [`labs/ingest/_sender/`](https://github.com/Munsik/engineering-notes/tree/main/labs/ingest/_sender)의 스크립트를 쓸 수 있습니다.
2. 보내기 전후의 `RcvbufErrors`, Agent의 `system_packet_drops`를 기록합니다.
3. Elasticsearch에서 순번을 집계해 빠진 구간을 찾습니다([05](../05-count-reconciliation/#순번으로-유실-구간-찾기)).
4. 속도를 단계적으로 올리며 drop이 시작되는 지점을 찾고, 버퍼와 수신기 수를 바꿔 다시 잽니다.
5. 같은 속도에서 수신 Agent를 재시작해 직접 수신과 relay 경유의 차이를 봅니다.

## 판단 기준

이 절은 위의 사실을 바탕으로 한 제 판단입니다(해석).

| 상황 | 권장 |
| --- | --- |
| 장비가 TCP를 지원 | TCP로 바꾸고 03의 L4 부하 분산 |
| UDP만 되고 수집 계층을 자주 바꿈 | 장비 가까이 rsyslog relay(disk-assisted queue) → TCP → 수집 계층 |
| UDP만 되고 relay를 둘 수 없음 | UDP 부하 분산 + 수신 Agent 2대 이상 + 버퍼 조정 |
| 감사 요구가 강함 | relay + 이중 송신 + 중복 제거, drop 지표 알림 |
| 피크 때만 건수가 줄어듦 | 커널 카운터와 Agent 지표로 ②, ③, ④ 중 어디인지 먼저 가린다 |

## 참고 문서

- [Filebeat UDP input](https://www.elastic.co/docs/reference/beats/filebeat/filebeat-input-udp)
- [Filebeat syslog processor](https://www.elastic.co/docs/reference/beats/filebeat/syslog)
- [Deploying and scaling Logstash: TCP, UDP, and HTTP protocols, Centralized syslog servers](https://www.elastic.co/docs/reference/logstash/deploying-scaling-logstash)
- [rsyslog: Reliable forwarding of syslog messages](https://www.rsyslog.com/doc/tutorials/reliable_forwarding.html)
- [nginx: TCP and UDP load balancing](https://docs.nginx.com/nginx/admin-guide/load-balancer/tcp-udp-load-balancer/)
