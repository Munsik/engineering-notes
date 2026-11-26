# 수집 컬렉션 labs

[수집 컬렉션](https://munsik.github.io/engineering-notes/ingest/)의 설정 예시와 검증 도구입니다. 값은 예시이므로 환경에 맞춰 바꿉니다.

| 경로 | 내용 | 글 |
| --- | --- | --- |
| [`_sender/`](_sender/) | 순번(`labels.seq`)과 시험 이름(`labels.run`)을 붙인 syslog를 TCP, UDP로 보내는 송신기 | 03, 04, 05 |
| [`no-gap/`](no-gap/) | Logstash PQ, Beats 입력 pipeline, HAProxy TCP 부하 분산, Agent Logstash output 설정 | 03 |
| [`syslog-udp/`](syslog-udp/) | rsyslog relay, nginx UDP 부하 분산, sysctl, Custom UDP Logs 고급 설정 | 04 |
| [`reconciliation/`](reconciliation/) | 유실, 중복, 실패 문서를 세는 ES\|QL, fingerprint 설정 | 05 |
| [`flow-dashboard/`](flow-dashboard/) | 흐름 대시보드 패널 정의(ES\|QL)와 알림 쿼리 | 06 |

쿼리와 설정은 문서와 소스로 확인한 필드 이름을 썼지만, 모두 lab에서 실행해 확인해야 합니다. 확인한 것은 각 README의 상태 칸에 적습니다.
