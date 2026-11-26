# 흐름 대시보드 정의

06의 흐름 대시보드를 만들기 위한 패널 정의입니다. 모든 패널은 ES|QL로 정의해 data view 의존이 없습니다.
Stack 9.5 이후라면 완성한 대시보드를 Dashboards API JSON으로 내보내 `dashboard.json`으로 이 폴더에 둡니다.

| ID | 패널 | 차트 | 쿼리 | 상태 |
| --- | --- | --- | --- | --- |
| P1 | 단계별 처리량 | 선(같은 시간 축) | `panels.esql`의 P1-a(Agent acked), P1-b(Logstash input), P1-c(Elasticsearch 문서 증가) | 미확인 |
| P2 | 수집 지연 p50, p95 | 선 | P2 | 미확인 |
| P3 | Agent queue 사용률 상위 | 표 | P3 | 미확인 |
| P4 | Logstash backpressure | 선 | P4 | 미확인 |
| P5 | UDP drop 증가분 | 선 | P5 | 미확인 |
| P6 | 실패 문서 | 표 | P6 | 미확인 |
| P7 | 원천별 마지막 수신 | 표 | P7 | 미확인 |

배치: 1행 P1(넓게), P2 / 2행 P3, P4 / 3행 P5, P6 / 4행 P7(넓게). 시간 범위 기본값은 최근 6시간.
