---
title: 수집
description: 수집기 선택부터 무중단 구성, UDP syslog, 건수 정합성, 흐름 대시보드, 자원 산정, 대규모 Fleet 운영까지 데이터를 안정적으로 수집하는 방법을 실무 순서대로 정리합니다.
sidebar:
  label: 개요
  order: 0
---

도입 프로젝트마다 빠지지 않는 질문이 세 가지 있습니다. 무엇으로 받을지, 수집기가 멈춰도 끊기지 않게 하려면 어떻게 할지, 누락 없이 다 받았다는 것을 어떻게 확인할지입니다.
세 질문 모두 제품 기능 하나로 답이 나오지 않습니다. Logstash와 Elastic Agent에는 clustering이 없고, UDP는 받았다는 확인을 돌려주지 않으며, 저장 건수만 봐서는 어느 구간에서 빠졌는지 알 수 없습니다.

그래서 기능이 아니라 구성과 운영으로 푸는 방법을 정리했습니다.

:::note[기준]
- Elastic Agent, Fleet, Logstash, Elasticsearch, Kibana 9.x 기준입니다. 글마다 맨 위에 기준 버전을 따로 적었습니다.
- self-managed와 Elastic Cloud Hosted를 기준으로 썼고, Serverless와 다른 점은 본문에 따로 적었습니다.
- 공식 문서로 확인한 내용에는 출처를 달았습니다. 출처가 없는 판단과 권장은 제 현장 경험에서 나온 것이고, 아직 확인하지 못한 내용에는 "확인 필요"라고 표시했습니다. 소스 코드로 확인한 내용은 근거를 같이 적었습니다.
- 설정 예시는 저장소의 [`labs/ingest/`](https://github.com/Munsik/engineering-notes/tree/main/labs/ingest)에 있습니다.
:::

## 구성

| 순서 | 글 | 다루는 내용 |
| --- | --- | --- |
| 01 | [수집기 선택](01-choose-collector/) | Agent, Logstash, Kafka, syslog relay, Agent 내장 OpenTelemetry Collector의 역할과 decision tree |
| 02 | [파싱 위치](02-where-to-parse/) | integration, `@custom` pipeline, Logstash의 역할 구분, failure store와 DLQ, 실패 문서 재처리, integration 업그레이드 |
| 03 | [무중단 수집](03-no-gap-ingest/) | clustering 없는 수집기를 구성으로 이중화하는 패턴, 출력 교체와 재수집, filestream file identity, persistent queue, 순차 업그레이드 |
| 04 | [UDP syslog](04-syslog-udp/) | UDP 유실 지점과 계측, 버퍼, relay, 부하 분산 |
| 05 | [건수 정합성](05-count-reconciliation/) | 구간별 카운터 대조, 유실과 중복 찾기, 저장되지 않은 문서 세기 |
| 06 | [흐름 대시보드](06-flow-dashboard/) | 기본 제공 화면, ES\|QL로 만드는 흐름 대시보드(Dashboards API JSON 포함), 끊김 알림 |
| 07 | [자원 산정](07-collector-sizing/) | Agent, Logstash, Fleet Server의 CPU, 메모리, 디스크 |
| 08 | [Fleet 운영](08-fleet-at-scale/) | 정책 설계, 단계적 변경과 업그레이드, 인증서 교체 |

## 자주 묻는 질문

| 질문 | 짧은 답 | 자세히 |
| --- | --- | --- |
| Logstash를 꼭 써야 하나 | 변환, 다중 출력, 디스크 버퍼가 필요할 때만 넣습니다. 넣는다면 2대 이상으로 넣습니다. | [01](01-choose-collector/) |
| Logstash나 Agent를 cluster로 묶을 수 있나 | 없습니다. 송신 측 부하 분산, L4 부하 분산, Kafka 분리로 구성합니다. | [03](03-no-gap-ingest/) |
| Agent 출력을 Logstash로 바꾸면 로그가 다시 들어오나 | 기존 출력의 설정을 고치면 다시 들어오지 않습니다. 새 출력을 등록해 정책에 할당하면 registry가 새로 생겨 소스에 남은 로그를 다시 보낼 가능성이 높습니다. | [03](03-no-gap-ingest/#출력을-바꿀-때-수정과-교체는-다르다) |
| Agent를 다시 시작했더니 오래된 로그가 다시 들어왔다 | filestream은 파일을 앞부분 hash로 식별합니다. fingerprint 설정이나 input `id`를 바꾸면 처음부터 다시 읽습니다. | [03](03-no-gap-ingest/#패턴-4-소스의-보존을-버퍼로-쓰기) |
| failure store에 쌓인 문서를 재처리할 수 있나 | 원인을 고친 뒤 원본을 꺼내는 pipeline과 `_reindex`로 되돌립니다. lab에서 60건을 모두 되살렸습니다. | [02](02-where-to-parse/#실패한-문서-재처리) |
| UDP syslog 유실을 0으로 만들 수 있나 | UDP 구간이 남아 있는 한 보장할 수 없습니다. 장비 가까이에서 TCP로 바꾸고, 남은 구간의 drop을 계측합니다. | [04](04-syslog-udp/) |
| 다 받았다는 것을 어떻게 확인하나 | 소스, 수집기 입력, 출력, Elasticsearch 저장 건수를 같은 시간 범위로 대조합니다. | [05](05-count-reconciliation/) |
| 실패해 저장되지 않은 문서는 어디서 보나 | failure store에 쌓입니다. Streams의 Data quality 탭에서 건수와 오류 종류를 보고, ES\|QL은 `FROM logs-*::failures`를 `document.index`로 묶어 셉니다. | [02](02-where-to-parse/), [05](05-count-reconciliation/) |
| UDP 부하 분산에 오픈소스 nginx나 HAProxy를 써도 되나 | 쓸 수는 있지만 멈춘 수신기를 스스로 빼지 못합니다. syslog는 응답이 없어 health check 근거가 없기 때문입니다. keepalived 같은 외부 check를 같이 둡니다. | [04](04-syslog-udp/) |
| Logstash 한 대에 자원은 얼마나 주나 | heap 4GB에서 8GB로 시작하고, 처리량은 운영 데이터로 직접 측정합니다. | [07](07-collector-sizing/) |

## 읽는 순서

01을 먼저 읽으면 나머지 글의 위치가 보입니다. 03, 04, 05는 같은 측정 방법(순번 기반 유실, 중복 계산)을 공유하므로 이어서 읽기를 권합니다.
