---
title: "수백에서 수만 대 Agent를 어떻게 운영할 것인가"
description: Fleet에서 정책을 나누는 기준, 정책 변경과 Agent 업그레이드를 단계적으로 적용하는 방법(rollout 기간, 자동 업그레이드, rollback), CA와 인증서를 교체할 때의 제약, Fleet Server 가용성, Agent 상태를 판정하는 기준을 정리합니다.
sidebar:
  label: 08. Fleet 운영
  order: 8
---

Agent가 수천 대가 되면 정책을 한 번 바꿀 때마다 수천 대가 동시에 영향을 받습니다.
잘못된 설정 하나가 전체 수집을 멈추게 할 수 있고, 인증서를 교체하다 Agent가 한꺼번에 offline이 되기도 합니다.
이 글은 정책을 어떻게 나누고, 변경과 업그레이드를 어떤 순서로 퍼뜨리며, 인증서 교체에서 무엇을 조심해야 하는지 정리합니다.

:::note[기준]
- Fleet, Fleet Server, Elastic Agent 9.x 기준입니다. self-managed Fleet Server를 중심으로 썼습니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- 정책 단위 자동 업그레이드는 Stack 9.1 GA, Fleet 관리 Agent의 업그레이드 rollback은 9.3 GA입니다. 두 기능 모두 구독 등급 조건이 있습니다.
:::

## Fleet 구조: 정책, revision, check-in

- Agent는 Fleet Server에 HTTP long-polling으로 check-in합니다. 요청은 설정 변경이나 action이 생기거나 5분이 지날 때까지 열려 있고, 그 뒤 다시 요청합니다([Agent health status](https://www.elastic.co/docs/reference/fleet/agent-health-status)).
- 정책을 바꾸면 새 revision이 만들어지고, 그 정책의 Agent는 다음 check-in 응답으로 새 revision을 받습니다. 그래서 정책 변경은 그 정책의 모든 Agent에 거의 동시에 퍼집니다(해석).
- `Offline`에서 `Inactive`로 바뀌는 시간은 inactivity timeout으로 조정합니다(같은 문서).

## 정책 설계

아래 기준은 제가 쓰는 방법입니다(해석).

| 기준 | 나누는 이유 |
| --- | --- |
| OS | integration과 경로가 다름. Windows와 Linux를 한 정책에 두면 쓰지 않는 입력 오류가 상태를 흐림 |
| 역할(웹, DB, 수신 전용, 폴링 전용) | 수집 대상이 다름. 폴링 integration은 Agent 여러 대에 걸면 중복 수집 |
| 네트워크 구역 | 출력(Elasticsearch, Logstash)과 proxy가 다름 |
| 변경 위험도 | canary 정책을 따로 두고 변경을 먼저 적용 |

공통 설정은 integration 단위로 같은 값을 쓰고, 정책마다 다른 것은 출력, 네트워크, 역할별 integration으로 한정합니다. 정책 수가 수십 개를 넘으면 같은 변경을 여러 정책에 반복해야 하므로, API나 Terraform으로 관리합니다(해석).

## 변경 적용 순서

1. lab 정책에서 변경을 검증합니다.
2. 운영과 같은 integration 구성의 canary 정책(소수 Agent)에 적용하고, Agent 상태와 수집 건수를 확인합니다.
3. 운영 정책에 적용합니다. 정책이 크면 Agent를 여러 정책으로 나눠 두고 정책 단위로 순서대로 적용합니다.
4. 각 단계마다 [06](../06-flow-dashboard/)의 흐름 대시보드와 Agent 상태를 봅니다.

정책 하나 안에서 일부 Agent에만 먼저 적용하는 기능은 없으므로, 단계적 적용은 정책을 나눠서 만듭니다(해석).

## Agent 업그레이드

| 방법 | 동작 | 근거 |
| --- | --- | --- |
| 즉시 | 선택한 Agent가 바로 업그레이드. 10대 넘는 batch에는 쓰지 말라고 안내 | [Upgrade Elastic Agents](https://www.elastic.co/docs/reference/fleet/upgrade-elastic-agent) |
| 유지 보수 시간 창 | 지정한 시간에 걸쳐 고르게 나눠 진행 | 같은 문서 |
| 자동 rollout | 10대 이상이면 자동 적용. 10분과 `대수 x 0.03`초 중 큰 값 | 같은 문서 |
| 정책 단위 자동 업그레이드(9.1 GA) | 정책에 대상 버전과 비율(%)을 지정 | 같은 문서. 구독 등급 조건 |
| rollback(9.3 GA) | Fleet 관리 Agent를 이전 버전으로 되돌림 | 같은 문서. 구독 등급 조건 |

- rollout 기간 안의 Agent는 업그레이드가 시작되기 전에도 `Updating` 상태로 보입니다(같은 문서).
- 업그레이드 중에는 디스크가 Agent 크기의 두 배 필요합니다([07](../07-collector-sizing/#elastic-agent)).
- Agent는 업그레이드하면서 다시 시작합니다. 수신 전용 Agent는 한 대씩 업그레이드합니다([03](../03-no-gap-ingest/#agent)).

권장 순서입니다(해석).

1. Fleet Server와 Kibana, Elasticsearch가 대상 버전을 지원하는지 확인합니다. Fleet Server를 먼저 올립니다.
2. canary 정책의 Agent를 업그레이드하고 하루 이상 지켜봅니다.
3. 정책 단위 자동 업그레이드로 비율을 단계적으로 올립니다(예: 10%, 50%, 100%). 이 기능이 없으면 유지 보수 시간 창을 지정해 정책별로 나눕니다.
4. 문제가 생기면 진행을 멈추고, 9.3 이후라면 rollback합니다.

## CA와 인증서 교체

공식 문서의 제약입니다([Rotate SSL/TLS CA certificates](https://www.elastic.co/docs/reference/fleet/certificates-rotation)).

- Agent는 인증서와 CA 파일의 hot reload를 지원하지 않습니다. 바꾼 뒤에는 Agent를 다시 시작해야 적용됩니다.
- Beats와 달리 CA 디렉터리를 넘기거나 디렉터리 변화를 감시하지 않습니다. 특정 파일을 가리켜야 합니다.

이 제약 때문에 CA 교체는 "새 CA와 이전 CA를 함께 신뢰하는 기간"을 두는 순서로 합니다(해석).

1. Agent가 신뢰하는 CA 파일에 새 CA를 추가합니다(이전 CA와 함께). Agent를 다시 시작해 적용합니다. 수천 대면 이 단계를 정책별로 나눠 진행합니다.
2. Fleet Server의 인증서를 새 CA로 서명한 것으로 바꾸고 다시 시작합니다.
3. 모든 Agent가 정상 check-in하는 것을 확인합니다.
4. 이전 CA를 CA 파일에서 지우고 다시 시작합니다.

순서를 거꾸로 하면, Fleet Server 인증서를 먼저 바꾼 순간 새 CA를 모르는 Agent가 연결하지 못합니다.

## Fleet Server 가용성

- 여러 대를 부하 분산기 뒤에 두라고 권합니다. 인증서에는 부하 분산기 이름과 각 호스트 이름을 넣습니다([Deploy on-premises and self-managed Fleet Server](https://www.elastic.co/docs/reference/fleet/add-fleet-server-on-prem)).
- 부하 분산기 timeout은 long-polling에 맞춰 늘립니다. Fleet Server의 long-poll timeout은 기본 5분, Fleet Server write timeout과 Agent 요청 timeout은 10분입니다(같은 문서).
- TLS pass through를 권하고, health check에는 `GET /api/status`를 씁니다(같은 문서).
- 크기는 [07](../07-collector-sizing/#fleet-server)의 표를 따릅니다.

## 네트워크가 끊겼을 때

- Agent는 출력에 닿지 못하는 동안 memory queue에 이벤트를 쌓습니다. queue가 차면 파일 입력은 읽기를 멈추고 기다리고, 다시 연결되면 이어서 읽습니다(해석).
- disk queue는 설정할 수 없으므로, 파일이 아닌 원천(TCP, UDP 수신)은 queue가 찬 뒤의 데이터를 잃습니다([Beats and Elastic Agent capabilities](https://www.elastic.co/docs/reference/fleet/beats-agent-comparison), 해석).
- 끊긴 동안 로그 회전으로 파일이 지워지면 그 부분도 잃습니다. 네트워크 단절이 잦은 구역은 로그 보존을 길게 둡니다(해석).

## 운영 점검

| 항목 | 볼 곳 |
| --- | --- |
| offline, unhealthy Agent | Fleet Agent 목록, 내장 규칙 "Offline status", "Unhealthy status" |
| 반복 재시작 | 내장 규칙 "Excessive restarts" |
| 업그레이드 진행 | Fleet의 업그레이드 상태 화면 |
| known issue | [Fleet Server known issues](https://www.elastic.co/docs/release-notes/fleet-server/known-issues), Elastic Agent release notes |

<!-- CAPTURE: ingest-fleet-upgrade.jpg | C-07 -->

## 판단 기준

이 절은 위의 사실을 바탕으로 한 제 판단입니다(해석).

| 상황 | 권장 |
| --- | --- |
| 이기종 호스트 | OS, 역할, 네트워크 구역으로 정책 분리. 폴링은 전용 정책 |
| 정책 변경 | lab → canary 정책 → 운영 정책 순서 |
| 업그레이드 | Fleet Server 먼저, canary, 비율 단계적 확대 |
| CA 교체 | 새 CA 추가와 재시작 → Fleet Server 교체 → 이전 CA 제거 |
| Fleet Server | 2대 이상, 부하 분산기 timeout 조정, `/api/status` health check |

## 참고 문서

- [Agent health status](https://www.elastic.co/docs/reference/fleet/agent-health-status)
- [Upgrade Elastic Agents](https://www.elastic.co/docs/reference/fleet/upgrade-elastic-agent)
- [Rotate SSL/TLS CA certificates](https://www.elastic.co/docs/reference/fleet/certificates-rotation)
- [Deploy on-premises and self-managed Fleet Server](https://www.elastic.co/docs/reference/fleet/add-fleet-server-on-prem)
- [Fleet Server scalability](https://www.elastic.co/docs/reference/fleet/fleet-server-scalability)
- [Elastic Agent built-in alerts](https://www.elastic.co/docs/reference/fleet/alert-templates)
