# 수집 컬렉션 labs

[수집 컬렉션](https://munsik.github.io/engineering-notes/ingest/)의 설정 예시와 검증 도구입니다. 값은 예시이므로 환경에 맞춰 바꿉니다.

| 경로 | 내용 | 글 | 상태 |
| --- | --- | --- | --- |
| [`_sender/`](_sender/) | 순번(`labels.seq`)과 시험 이름(`labels.run`)을 붙인 syslog를 TCP, UDP로 보내는 송신기, 순번을 꺼내는 ingest pipeline | 03, 04, 05 | 송신기: Linux에서 UDP 송신 확인. pipeline: lab 9.5.5에서 simulate와 bulk로 확인(기존 `kv` 방식은 메시지 앞부분 때문에 실패해 `grok`으로 바꿈) |
| [`no-gap/`](no-gap/) | Logstash PQ, Beats 입력 pipeline, HAProxy TCP 부하 분산, Agent Logstash output 설정 | 03 | Fleet Logstash 출력(hosts 2개, `loadbalance: true`)은 lab 9.5.5에서 API로 만들어 화면 확인. Logstash, HAProxy 설정은 문서 기준이며 실행하지 않음 |
| [`syslog-udp/`](syslog-udp/) | rsyslog relay, nginx UDP 부하 분산, sysctl, Custom UDP Logs 고급 설정, 커널 drop 확인 스크립트 | 04 | `check-drops.sh`: Linux에서 느린 수신기로 drop을 일으켜 `RcvbufErrors` 증가 확인. 나머지는 문서 기준이며 실행하지 않음 |
| [`reconciliation/`](reconciliation/) | 유실, 중복, 실패 문서를 세는 ES\|QL, fingerprint 설정 | 05 | 쿼리 4개 lab 9.5.5에서 실행 확인(순번 쿼리, failure store 쿼리 수정). fingerprint 설정은 문서 기준 |
| [`flow-dashboard/`](flow-dashboard/) | 흐름 대시보드 패널 정의(ES\|QL), Dashboards API JSON | 06 | lab 9.5.5에서 대시보드 생성 확인. 패널별 상태는 폴더 README |

lab은 Elastic Cloud Hosted 9.5.5입니다. Logstash, 수신 전용 Agent, UDP 수신기가 없어서 그 데이터가 필요한 확인은 하지 못했습니다. 위 표에서 "문서 기준"으로 적은 것이 그 부분입니다.
