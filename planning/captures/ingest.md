# 수집 컬렉션 화면 캡처 지시서

이 문서는 lab Kibana에서 화면을 캡처하는 작업자(사람 또는 다른 Claude)를 위한 지시서입니다.
본문에는 `<!-- CAPTURE: 파일명 | ID -->` 주석으로 자리를 표시해 두었습니다. 캡처 후 주석을 아래 형식의 이미지 줄로 바꿉니다.

```md
![alt 문구](../../../assets/ingest/파일명)
```

## 공통 규칙

- 기준 버전: Elastic Stack 9.5.x(lab). 다른 버전이면 캡처 파일명 옆에 버전을 적어 보고합니다.
- 파일 위치: `src/assets/ingest/`, jpg, 가로 1600px 안팎. 필요한 영역만 자릅니다. 가로세로 비율은 바꾸지 않습니다.
- 이름: lab 객체는 아래 지정한 일반 이름만 씁니다. 고객사, 실제 호스트명, 계정명, 이메일이 화면에 없어야 합니다.
- 데이터: `labs/ingest/_sender/send.py`로 만든 synthetic syslog와 Agent 자체 모니터링 데이터만 씁니다.
- 캡처 후 `npx astro build`로 이미지가 렌더링되는지 확인합니다.

## lab 준비

| 항목 | 이름, 값 |
| --- | --- |
| Agent 정책 | `lab-syslog-receivers`(Custom UDP Logs, Custom TCP Logs), `lab-linux-hosts`(System) |
| Agent | `lab-recv-01`, `lab-recv-02`(수신 전용), `lab-host-01` |
| Logstash | `lab-ls-01`, `lab-ls-02`, Logstash integration(Agent 수집)으로 모니터링 |
| Logstash 출력(Fleet) | 이름 `lab-logstash`, hosts 두 개 |
| dataset | Custom UDP Logs의 dataset `lab.syslog` |
| 송신 | `send.py --proto udp --rate 2000 --seconds 1800 --run cap-01` |

## 캡처 목록

| ID | 파일명 | 들어갈 글, 위치 | Kibana 경로 | 화면에서 보여야 할 것 | alt 문구 |
| --- | --- | --- | --- | --- | --- |
| C-01 | `ingest-fleet-logstash-output.jpg` | 03, "패턴 1" 절 | Fleet > Settings > Outputs > `lab-logstash` 편집 | Hosts 칸에 host 두 개, Advanced YAML에 `loadbalance: true` | Fleet의 Logstash 출력 설정. Hosts에 Logstash 두 대가 있고 고급 YAML에 loadbalance가 켜져 있습니다. |
| C-02 | `ingest-streams-data-quality.jpg` | 02, "실패한 문서는 어디로 가나" 절 | Streams > `logs-lab.syslog-default` > Data quality 탭 | failure store에 쌓인 실패 문서 건수, 오류 종류, 예시. 실패를 만들려면 날짜 형식이 틀린 메시지를 섞어 보냄 | Streams의 Data quality 탭. 실패 문서 건수와 오류 종류, 예시 문서가 보입니다. |
| C-03 | `ingest-udp-input-metrics.jpg` | 04, "Agent UDP input 지표" 절 | Discover, data view 없이 ES\|QL: `FROM metrics-elastic_agent.filebeat_input-* \| WHERE system_packet_drops IS NOT NULL \| KEEP @timestamp, agent.name, system_packet_drops, receive_queue_length` | 송신 속도를 버퍼 한계 이상으로 올렸을 때 drop이 증가하는 행 | Discover에서 본 UDP input 지표. 송신 속도를 올린 구간에서 system_packet_drops가 늘어납니다. |
| C-04 | `ingest-agent-dashboard.jpg` | 06, "기본 제공 화면" 절 | Fleet > Agents > `lab-recv-01` > View more agent metrics(`[Elastic Agent] Agent metrics` 대시보드) | 입력, 출력 이벤트 패널과 queue 패널 | Elastic Agent 지표 대시보드. 수신 Agent의 입력과 출력 이벤트, queue 사용량이 보입니다. |
| C-05 | `ingest-logstash-pipeline.jpg` | 06, "기본 제공 화면" 절 | Dashboards > `[Metrics Logstash]` pipeline 관련 대시보드 | pipeline별 처리량과 flow metrics(worker utilization, backpressure) | Logstash integration 대시보드. pipeline별 처리량과 worker 사용률, backpressure가 보입니다. |
| C-06 | `ingest-flow-dashboard.jpg` | 06, "직접 만드는 흐름 대시보드" 절 | `labs/ingest/flow-dashboard/`의 정의로 만든 대시보드 `[Lab] Ingest flow` | P1에서 P7까지 전체. 송신 도중 `lab-ls-01`을 멈춰 처리량 선이 벌어지는 구간이 보이면 좋음 | 직접 만든 수집 흐름 대시보드. Logstash 한 대를 멈춘 구간에서 단계별 처리량 선 사이가 벌어집니다. |
| C-07 | `ingest-fleet-upgrade.jpg` | 08, "운영 점검" 절 | Fleet > Agents > 여러 Agent 선택 > Upgrade agents | 대상 버전 선택과 유지 보수 시간 창(rollout) 설정 화면 | Fleet의 Agent 업그레이드 화면. 대상 버전과 업그레이드를 나눠 진행할 시간 창을 고릅니다. |

## C-06을 만들 때

1. `labs/ingest/flow-dashboard/panels.esql`의 쿼리를 Discover ES\|QL에서 하나씩 실행해 결과가 나오는지 확인합니다. 필드가 없으면 `README.md`의 상태 칸에 적고, 맞는 필드 이름으로 고친 쿼리를 커밋합니다.
2. 대시보드에 ES\|QL 패널로 추가하고 README의 배치대로 놓습니다.
3. Stack 9.5 이후면 Dashboards API로 JSON을 내보내 `labs/ingest/flow-dashboard/dashboard.json`으로 저장합니다.

## 완료 보고

캡처마다 파일명, 사용한 Stack 버전, 본문 주석을 이미지로 바꿨는지, 쿼리를 고쳤다면 무엇을 고쳤는지 적습니다.
