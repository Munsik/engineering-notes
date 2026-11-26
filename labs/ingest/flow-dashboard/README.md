# 흐름 대시보드 정의

06의 흐름 대시보드를 만들기 위한 패널 정의입니다. 모든 패널은 ES|QL로 정의해 data view 의존이 없습니다.

- [`panels.esql`](panels.esql): 패널별 쿼리. Discover의 ES|QL에서 하나씩 실행해 볼 수 있습니다.
- [`dashboard.json`](dashboard.json): Dashboards API(Stack 9.5 GA)에 그대로 보내는 정의입니다.

```bash
curl -X PUT "$KIBANA_URL/api/dashboards/lab-ingest-flow" \
  -H "Authorization: ApiKey $KIBANA_API_KEY" \
  -H "kbn-xsrf: true" -H "Content-Type: application/json" \
  -d @dashboard.json
```

| ID | 패널 | 차트 | 쿼리 | 상태(lab 9.5.5) |
| --- | --- | --- | --- | --- |
| P1 | 단계별 처리량 | 선 3개 | P1-a(Agent acked), P1-b(Logstash input), P1-c(Elasticsearch 문서 증가) | P1-a: Agent 9.5.3 데이터로 결과 확인. counter라 `TS` + `INCREASE`로 수정. P1-b: Logstash가 없어 미확인(필드는 `logstash` 패키지 정의 기준). P1-c: 결과 확인 |
| P2 | 수집 지연 p50, p95 | 선 | P2 | 결과 확인 |
| P3 | Agent queue 사용률 상위 | 표 | P3 | 결과 확인. data stream을 `elastic_agent.elastic_agent`로 수정. `filled.pct`는 0에서 1 사이 비율 |
| P4 | Logstash backpressure | 선 | P4 | 미확인(Logstash 없음) |
| P5 | UDP drop 증가분 | 선 | P5 | 문법 확인, UDP 데이터 없음. 필드를 `filebeat_input.system_packet_drops`로, 계산을 `INCREASE`로 수정 |
| P6 | 실패 문서 | 표 | P6 | 결과 확인. `data_stream.dataset` 대신 `document.index`로 수정 |
| P7 | 원천별 마지막 수신 | 표 | P7 | 결과 확인 |

배치: 1행 P1(세 패널), 2행 P2, P3 / 3행 P4, P5 / 4행 P6, P7. 시간 범위 기본값은 최근 6시간.
